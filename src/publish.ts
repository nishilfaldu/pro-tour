// Publish recorded tours to their pull request: one comment per tour with the video and the behavior checklist.
// Retry-safe without local state: each comment carries a marker for its recording, and a rerun that finds the
// marker on the PR reuses that comment instead of posting again.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { appTree, blobId, exists, git, sha, TourError, tourName } from './repo.ts';
import { markdown } from './report.ts';
import { recordingFiles, removeRecording } from './runtime.ts';
import type { Report } from './types.ts';

type Env = NodeJS.ProcessEnv;

export interface PullRequest {
  number: number;
  url: string;
  /** owner/name */
  repo: string;
  /** The base branch name. */
  base: string;
  /** The commit at the head of the PR. */
  head: string;
}

interface Comment {
  body?: string;
  html_url?: string;
  node_id?: string;
}

function exec(command: string, args: string[], { env, cwd, timeout = 60_000 }: { env?: Env; cwd?: string; timeout?: number } = {}) {
  return new Promise<string>((done, fail) => {
    execFile(command, args, { env, cwd, timeout, maxBuffer: 64 << 20, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error?.code === 'ENOENT') fail(new TourError(`${command} was not found on PATH`));
      else if (error)
        fail(new TourError(`${command} ${args.slice(0, 2).join(' ')} failed: ${(stderr || error.message).trim().slice(0, 500)}`));
      else done(stdout);
    });
  });
}

// Read-only GitHub calls are retried; writes never are.
async function retryRead<T>(read: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(done => setTimeout(done, attempt * 1000));
    }
  }
}

// The PR to publish to: --pr, else the single open PR whose head is this branch in this repository.
export async function resolvePr(
  repo: string,
  { target, branch, env }: { target?: string; branch?: string; env: Env },
): Promise<PullRequest> {
  if (target && !/^([1-9]\d*|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*)$/.test(target))
    throw new TourError('Invalid PR number or GitHub PR URL');
  if (!target) {
    if (!branch) throw new TourError('Pass --pr, or run from the pull request branch');
    const head = branch;
    const raw = await retryRead(() =>
      exec('gh', ['pr', 'list', '--head', head, '--state', 'open', '--json', 'number,url,headRepositoryOwner'], { cwd: repo, env }),
    );
    let entries: { url: string; headRepositoryOwner?: { login?: string } }[];
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
  const view = target;
  const data = JSON.parse(
    await retryRead(() => exec('gh', ['pr', 'view', view, '--json', 'number,url,baseRefName,headRefOid'], { cwd: repo, env })),
  );
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)$/.exec(data.url ?? '');
  if (!match || typeof data.number !== 'number' || typeof data.headRefOid !== 'string')
    throw new TourError('GitHub returned invalid PR metadata; no PR was guessed');
  return { number: data.number, url: data.url, repo: match[1], base: data.baseRefName, head: data.headRefOid };
}

interface Ready {
  name: string;
  video: string;
  report: Report;
}

// Every tour is checked before anything is posted, so a problem does not leave the PR half published.
// A recording may be posted only if it passed and was made from the tour and the app code the PR's head holds.
async function ready(repo: string, tour: string, headTree: string): Promise<Ready> {
  const name = tourName(tour);
  const path = relative(repo, tour);
  const files = recordingFiles(join(repo, '.videos'), name);
  const saved = await readFile(files.report, 'utf8').catch(() => null);
  if (!saved) throw new TourError(`No recording of ${name}; run pro-tour run ${path} --url <app url> first.`);
  const report: Report = JSON.parse(saved);
  if (report.videoSha !== sha(await readFile(files.video).catch(() => '')))
    throw new TourError(`The recording of ${name} is incomplete; record it again.`);
  if (report.status !== 'passed')
    throw new TourError(`The latest recording of ${name} failed; fix the tour or the change and record it again.`);
  let committed: string | null = null;
  try {
    committed = git(['rev-parse', `HEAD:${path}`], repo).trim();
  } catch {}
  if (committed !== report.tourBlob) {
    throw new TourError(
      (await exists(tour)) && blobId(repo, tour) === report.tourBlob
        ? `Commit ${path} and push it, then publish.`
        : `${path} changed after its latest recording; record it again before publishing.`,
    );
  }
  if (report.appTree !== headTree) {
    let files = '';
    try {
      const paths = git(['diff-tree', '-r', '--name-only', headTree, report.appTree], repo).trim().split('\n');
      files = `: ${paths.slice(0, 10).join(', ')}${paths.length > 10 ? ', …' : ''}`;
    } catch {}
    // Untracked files count: they were part of the app when it was recorded.
    throw new TourError(
      `${name} was recorded from app code that differs from the pull request's head${files}. Commit or delete what differs, then record it again.`,
    );
  }
  return { name, video: files.video, report };
}

async function comments(pr: PullRequest, env: Env): Promise<Comment[]> {
  const raw = await retryRead(() =>
    exec('gh', ['api', '--paginate', '--slurp', `repos/${pr.repo}/issues/${pr.number}/comments?per_page=100`], { env, timeout: 30_000 }),
  );
  try {
    return JSON.parse(raw).flat();
  } catch {
    throw new TourError('GitHub returned invalid PR comments');
  }
}

// The posted comment for this recording, if any: its marker, and the video gh uploaded.
async function findPosted(pr: PullRequest, marker: string, env: Env): Promise<string | null> {
  const posted = (await comments(pr, env)).filter(
    comment => comment.body?.includes(marker) && comment.body.includes('github.com/user-attachments/assets/'),
  );
  return posted.at(-1)?.html_url ?? null;
}

// Earlier comments of the same tour are minimized as outdated, not deleted. Best effort: the new comment is
// already up, so a failure here only leaves the old ones expanded.
async function hideOlder(pr: PullRequest, tourMarker: string, current: string, env: Env): Promise<void> {
  try {
    for (const comment of await comments(pr, env)) {
      if (!comment.body?.includes(tourMarker) || comment.html_url === current || !comment.node_id) continue;
      await exec(
        'gh',
        [
          'api',
          'graphql',
          '-f',
          'query=mutation($id: ID!) { minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) { clientMutationId } }',
          '-f',
          `id=${comment.node_id}`,
        ],
        { env },
      );
    }
  } catch (error) {
    console.warn(`pro-tour: could not hide older tour comments: ${(error as Error).message}`);
  }
}

// gh replaces the body's reference to the attached file with the uploaded video.
const commentBody = (report: Report, video: string, commit: string) => markdown(report, `![](${video})`, commit);

async function post({ name, video, report }: Ready, pr: PullRequest, env: Env): Promise<{ url: string; reused: boolean }> {
  const marker = `<!-- pro-tour:${sha(`${name}:${report.videoSha}:${pr.url}`)} -->`;
  // Names the tour, so a newer recording of it can hide the older comments.
  const tourMarker = `<!-- pro-tour-tour:${sha(`${name}:${pr.url}`).slice(0, 16)} -->`;
  let url = await findPosted(pr, marker, env);
  const reused = Boolean(url);
  if (!url) {
    const work = await mkdtemp(join(tmpdir(), 'pro-tour-publish-'));
    try {
      const body = join(work, 'comment.md');
      await writeFile(body, `${commentBody(report, video, pr.head)}\n${marker}\n${tourMarker}\n`);
      url = (
        await exec('gh', ['pr', 'comment', String(pr.number), '--repo', pr.repo, '--body-file', body, '--attach', video], {
          env,
          timeout: 180_000,
        })
      ).trim();
    } catch (error) {
      // The comment may have been posted even though gh reported a failure (a dropped response).
      url = await findPosted(pr, marker, env).catch(() => null);
      if (!url) throw new TourError(`Publishing ${name} failed and no comment for it is on the PR: ${(error as Error).message}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  await hideOlder(pr, tourMarker, url, env);
  return { url, reused };
}

export type PublishResult = { name: string; body: string } | { name: string; url: string; reused: boolean };

/**
 * Post each tour's recording to the PR. A dry run returns the comment bodies instead. The local recordings
 * are deleted once every tour is on the PR; until then a rerun reuses the comments already posted.
 */
export async function publishTours(
  repo: string,
  pr: PullRequest,
  tours: string[],
  { env = process.env, dryRun = false }: { env?: Env; dryRun?: boolean } = {},
): Promise<PublishResult[]> {
  const local = git(['rev-parse', 'HEAD'], repo).trim();
  if (local !== pr.head)
    throw new TourError(
      `This checkout (${local.slice(0, 7)}) is not the head of ${pr.url} (${pr.head.slice(0, 7)}); push or pull, then publish.`,
    );
  const headTree = appTree(repo, 'HEAD');
  const recordings = [];
  for (const tour of tours) recordings.push(await ready(repo, tour, headTree));
  if (dryRun) return recordings.map(recording => ({ name: recording.name, body: commentBody(recording.report, recording.video, pr.head) }));
  const results = [];
  for (const recording of recordings) results.push({ name: recording.name, ...(await post(recording, pr, env)) });
  for (const { name } of recordings) await removeRecording(join(repo, '.videos'), name);
  return results;
}
