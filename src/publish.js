// Publish a recorded tour to its pull request as one comment: the video, then the behavior checklist.
// Retry-safe: every attempt first looks for an earlier comment carrying this recording's marker, and an
// upload whose outcome is unknown is not repeated until the user confirms the comment is absent.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { git, TourError } from './repo.js';
import { markdown } from './report.js';
import { removeRecording } from './runtime.js';

function exec(command, args, { env, cwd, timeout = 60_000 } = {}) {
  return new Promise((done, fail) => {
    execFile(command, args, { env, cwd, timeout, maxBuffer: 64 << 20, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error?.code === 'ENOENT') fail(new TourError(`${command} was not found on PATH`));
      else if (error) fail(new TourError(`${command} ${args.slice(0, 2).join(' ')} failed: ${(stderr || error.message).trim().slice(0, 500)}`));
      else done(stdout);
    });
  });
}

// Read-only GitHub calls are retried; writes never are.
async function retryRead(read, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(done => setTimeout(done, attempt * 1000));
    }
  }
}

// GH_MEDIA_TOKEN, when set, is the token gh uses for publishing; otherwise gh's own login is used.
export function githubEnv(env = process.env) {
  const clean = { ...env };
  if (env.GH_MEDIA_TOKEN) {
    delete clean.GITHUB_TOKEN;
    clean.GH_TOKEN = env.GH_MEDIA_TOKEN;
  }
  return clean;
}

export async function requireMediaSupport(env) {
  const help = await exec('gh', ['pr', 'comment', '--help'], { env });
  if (!help.includes('--attach')) throw new TourError('This GitHub CLI cannot attach videos. Update gh until `gh pr comment --help` lists --attach.');
}

export function validatePrTarget(target) {
  if (target && !/^([1-9]\d*|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*)$/.test(target)) throw new TourError('Invalid PR number or GitHub PR URL');
}

// The PR to publish to: --pr, else the single open PR whose head is this branch in this repository.
export async function resolvePr(repo, { target, branch, env }) {
  validatePrTarget(target);
  if (!target) {
    const raw = await retryRead(() => exec('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url,headRepositoryOwner'], { cwd: repo, env }));
    let entries;
    try {
      entries = JSON.parse(raw);
      if (!Array.isArray(entries)) throw new Error();
    } catch {
      throw new TourError('GitHub returned invalid PR data; no PR was guessed');
    }
    const owner = git(['remote', 'get-url', 'origin'], repo).match(/github\.com[:/]([^/]+)\//)?.[1];
    if (owner) entries = entries.filter(entry => entry.headRepositoryOwner?.login?.toLowerCase() === owner.toLowerCase());
    if (entries.length > 1) throw new TourError('More than one open PR matches this branch; pass --pr');
    if (!entries.length) throw new TourError(`No open PR for branch ${branch}; pass --pr`);
    target = entries[0].url;
  }
  const data = JSON.parse(await retryRead(() => exec('gh', ['pr', 'view', target, '--json', 'number,url,baseRefName'], { cwd: repo, env })));
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)$/.exec(data.url ?? '');
  if (!match || typeof data.number !== 'number') throw new TourError('GitHub returned invalid PR metadata; no PR was guessed');
  return { number: data.number, url: data.url, repo: match[1], base: data.baseRefName };
}

export async function probeVideo(video) {
  if (!video.endsWith('.mp4')) throw new TourError('Expected an MP4 recording');
  const info = JSON.parse(await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]));
  const stream = info.streams?.find(item => item.codec_type === 'video');
  if (stream?.codec_name !== 'h264' || !(Number(info.format?.duration) > 0)) throw new TourError('The MP4 must contain playable H.264 video');
  // Decode every frame before uploading.
  await exec('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', video, '-f', 'null', '-'], { timeout: 120_000 });
}

async function withLock(video, run) {
  const path = video.replace(/\.mp4$/, '.upload.lock');
  const owner = Number(await readFile(path, 'utf8').catch(() => ''));
  if (owner) {
    let alive = true;
    try {
      process.kill(owner, 0);
    } catch (error) {
      alive = error.code === 'EPERM';
    }
    if (alive) throw new TourError('Another upload owns this video; retry when it finishes');
    await unlink(path).catch(() => {});
  }
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new TourError('Another upload owns this video; retry when it finishes');
    throw error;
  }
  try {
    await handle.writeFile(String(process.pid));
    await handle.close();
    return await run();
  } finally {
    await unlink(path).catch(() => {});
  }
}

async function comments(pr, env) {
  // Every page: an upload whose response was lost must not be repeated.
  const raw = await retryRead(() => exec('gh', ['api', '--paginate', '--slurp', `repos/${pr.repo}/issues/${pr.number}/comments?per_page=100`], { env, timeout: 30_000 }));
  try {
    return JSON.parse(raw).flat();
  } catch {
    throw new TourError('Cannot read the PR comments to reconcile; the upload was not repeated');
  }
}

async function findUpload(pr, marker, env) {
  const matches = (await comments(pr, env)).filter(comment => comment.body?.includes(marker) && comment.body.includes('github.com/user-attachments/assets/'));
  if (matches.length > 1) throw new TourError('More than one comment matches this recording; inspect the PR before retrying');
  return matches[0]?.html_url ?? null;
}

// The comment body for a recording: video first, then the behavior checklist, then collapsible steps.
export function commentBody(report, video) {
  return markdown(report, { video: `![](${video})`, collapseSteps: true });
}

// After a confirmed upload the local recording is deleted (the PR hosts it) unless keep is set.
export async function publish(videoPath, pr, { env = githubEnv(), retryUpload = false, keep = false, dryRun = false } = {}) {
  const video = resolve(videoPath);
  await probeVideo(video);
  const report = JSON.parse(await readFile(video.replace(/\.mp4$/, '.json'), 'utf8').catch(() => {
    throw new TourError(`No report beside ${basename(video)}; publish a video recorded by pro-tour`);
  }));
  if (dryRun) return { status: 'dry-run', body: commentBody(report, video) };
  await requireMediaSupport(env);
  const digest = createHash('sha256').update(await readFile(video)).digest('hex');
  const identity = createHash('sha256').update(`${basename(video)}:${digest}:${pr.url}`).digest('hex');
  const marker = `<!-- pro-tour:${identity} -->`;
  // Names the tour, so a newer recording of it can hide the older comments.
  const tourMarker = `<!-- pro-tour-tour:${createHash('sha256').update(`${basename(video).replace(/-v\d+\.mp4$/, '')}:${pr.url}`).digest('hex').slice(0, 16)} -->`;
  const journal = video.replace(/\.mp4$/, '.upload.json');
  const record = data => writeFile(journal, JSON.stringify({ pr_url: pr.url, sha256: digest, identity, ...data }, null, 2) + '\n');

  return withLock(video, async () => {
    // Reconcile first, including a retry from another checkout or CI run.
    const existing = await findUpload(pr, marker, env);
    if (existing) {
      if (keep) await record({ status: 'uploaded', comment_url: existing, reused: true });
      else await removeRecording(video);
      return { status: 'uploaded', commentUrl: existing, reused: true };
    }
    const previous = JSON.parse(await readFile(journal, 'utf8').catch(() => 'null'));
    if (previous?.identity === identity && ['pending', 'unknown'].includes(previous.status) && !retryUpload) {
      throw new TourError('A previous upload of this video has an unknown result and no matching comment is visible. Check the PR, then rerun with --retry-upload only if the comment is absent.');
    }
    await record({ status: 'pending' });
    const work = await mkdtemp(join(tmpdir(), 'pro-tour-publish-'));
    let url;
    try {
      const body = join(work, 'comment.md');
      await writeFile(body, `${commentBody(report, video)}\n${marker}\n${tourMarker}\n`);
      url = (await exec('gh', ['pr', 'comment', String(pr.number), '--repo', pr.repo, '--body-file', body, '--attach', video], { env, timeout: 180_000 })).trim();
    } catch (error) {
      url = await findUpload(pr, marker, env).catch(() => null);
      if (!url) {
        await record({ status: 'unknown' });
        throw new TourError(`The upload failed or its result is unknown; the local video is kept. Run publish again to reconcile before another upload. (${error.message})`);
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    await record({ status: 'uploaded', comment_url: url });
    const hidden = await hideOlder(pr, tourMarker, url, env);
    if (!keep) await removeRecording(video);
    return { status: 'uploaded', commentUrl: url, reused: false, hidden };
  });
}

// Earlier recordings of the same tour are minimized as outdated, not deleted. Best effort: publishing
// already succeeded, so a failure here only leaves the old comments visible.
async function hideOlder(pr, tourMarker, newUrl, env) {
  let hidden = 0;
  try {
    for (const comment of await comments(pr, env)) {
      if (!comment.body?.includes(tourMarker) || comment.html_url === newUrl || !comment.node_id) continue;
      await exec('gh', ['api', 'graphql', '-f', `query=mutation { minimizeComment(input: { subjectId: "${comment.node_id}", classifier: OUTDATED }) { minimizedComment { isMinimized } } }`], { env });
      hidden++;
    }
  } catch (error) {
    console.warn(`pro-tour: could not hide older tour comments: ${error.message}`);
  }
  return hidden;
}
