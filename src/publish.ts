// Publish recorded tours to their pull request: one comment per tour with the video and its steps. Each video
// is deleted once it is on the PR. Retry-safe without local state: each comment carries a marker for its
// recording, and a rerun that finds the marker on the PR reuses that comment instead of posting again.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecording, recordingFile, removeRecording } from './record.ts';
import { exists, git, removeVideosDirIfEmpty, sha, TourError } from './repo.ts';
import { markdown } from './report.ts';
import type { TourResult } from './types.ts';

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
    let owner: string | undefined;
    try {
      owner = git(['remote', 'get-url', 'origin'], repo).match(/github\.com[:/]([^/]+)\//)?.[1];
    } catch {}
    if (owner) entries = entries.filter(entry => entry.headRepositoryOwner?.login?.toLowerCase() === owner.toLowerCase());
    if (entries.length > 1) throw new TourError('More than one open PR matches this branch; pass --pr');
    if (!entries.length) throw new TourError(`No open PR for branch ${branch}; pass --pr`);
    target = entries[0].url;
  }
  const view = target;
  const raw = await retryRead(() => exec('gh', ['pr', 'view', view, '--json', 'number,url,baseRefName,headRefOid'], { cwd: repo, env }));
  let data: { number?: unknown; url?: string; baseRefName?: string; headRefOid?: unknown } = {};
  try {
    data = JSON.parse(raw);
  } catch {}
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)$/.exec(data.url ?? '');
  if (!match || typeof data.number !== 'number' || typeof data.headRefOid !== 'string')
    throw new TourError('GitHub returned invalid PR metadata; no PR was guessed');
  return { number: data.number, url: match[0], repo: match[1], base: data.baseRefName ?? '', head: data.headRefOid };
}

interface Ready {
  name: string;
  video: string;
  videoSha: string;
  result: TourResult;
}

// Every recording is read before anything is posted, so a missing one does not leave the PR half published.
async function ready(repo: string, name: string): Promise<Ready> {
  const video = recordingFile(join(repo, '.videos'), name);
  if (!(await exists(video))) throw new TourError(`No recording of ${name}; record it with pro-tour run first.`);
  const result = await readRecording(video);
  if (!result) throw new TourError(`${video} is not a pro-tour recording; record ${name} again.`);
  return { name, video, videoSha: sha(await readFile(video)), result };
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
const commentBody = ({ result, video }: Ready, head: string) => markdown(result, `![](${video})`, head);

async function post(recording: Ready, pr: PullRequest, env: Env): Promise<{ url: string; reused: boolean }> {
  const { name, video, videoSha } = recording;
  const marker = `<!-- pro-tour:${sha(`${name}:${videoSha}:${pr.url}`)} -->`;
  // Names the tour, so a newer recording of it can hide the older comments.
  const tourMarker = `<!-- pro-tour-tour:${sha(`${name}:${pr.url}`).slice(0, 16)} -->`;
  let url = await findPosted(pr, marker, env);
  const reused = Boolean(url);
  if (!url) {
    const work = await mkdtemp(join(tmpdir(), 'pro-tour-publish-'));
    try {
      const body = join(work, 'comment.md');
      await writeFile(body, `${commentBody(recording, pr.head)}\n${marker}\n${tourMarker}\n`);
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
 * Post each named recording to the PR. A dry run returns the comment bodies instead. Each video is deleted
 * once its comment is up, and .videos/ with it when it is empty.
 */
export async function publishTours(
  repo: string,
  pr: PullRequest,
  names: string[],
  { env = process.env, dryRun = false }: { env?: Env; dryRun?: boolean } = {},
): Promise<PublishResult[]> {
  const recordings = [];
  for (const name of names) recordings.push(await ready(repo, name));
  if (dryRun) return recordings.map(recording => ({ name: recording.name, body: commentBody(recording, pr.head) }));
  const results = [];
  for (const recording of recordings) {
    results.push({ name: recording.name, ...(await post(recording, pr, env)) });
    await removeRecording(join(repo, '.videos'), recording.name);
  }
  await removeVideosDirIfEmpty(repo);
  return results;
}
