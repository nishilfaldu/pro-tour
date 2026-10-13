// Shared test helpers: git repositories, a stand-in gh CLI and recorded-looking videos.
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appTree, sha } from '../src/repo.ts';

export const PR = { number: 1, url: 'https://github.com/owner/app/pull/1', repo: 'owner/app', base: 'main' };

export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });

// A repository whose main has `files`, checked out on a feature branch.
export async function repo(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pro-tour-test-'));
  git(dir, 'init', '-q', '-b', 'main');
  await writeFile(join(dir, 'README.md'), 'app\n');
  await writeFile(join(dir, '.gitignore'), '.videos/\n');
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), body);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'app');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'checkout', '-qb', 'feature');
  return dir;
}

// A committed tour with a passing recording of it, as pro-tour run leaves it.
export async function recordedTour(dir: string, name: string, report: Record<string, unknown> = {}): Promise<string> {
  const tour = join(dir, '.tours', `${name}.tour.js`);
  await mkdir(join(dir, '.tours'), { recursive: true });
  await writeFile(tour, `export const meta = { title: '${name}' };\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', `tour ${name}`);
  await mkdir(join(dir, '.videos'), { recursive: true });
  await recording(join(dir, '.videos', `${name}.mp4`), { tourSha: sha(await readFile(tour)), appTree: appTree(dir), ...report });
  return tour;
}

// Keeps PR comments in a JSON state file. `fail` makes post number `at` fail: with `lost`, the comment is
// posted but gh reports a failure, as a dropped response would; without it, nothing is posted.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs');
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const pr = ${JSON.stringify(PR)};
if (args[0] === 'pr' && args[1] === 'list') { console.log(JSON.stringify([{ number: pr.number, url: pr.url, headRepositoryOwner: { login: 'owner' } }])); process.exit(0); }
// The PR's head is the checkout's HEAD, as if it were pushed, unless the state names another.
if (args[0] === 'pr' && args[1] === 'view') {
  const head = state.head || require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ number: pr.number, url: pr.url, baseRefName: pr.base, headRefOid: head }));
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'graphql') {
  const id = args.find(arg => arg.startsWith('id=')).slice(3);
  state.comments.find(comment => comment.node_id === id).minimized = true;
  save();
  process.exit(0);
}
if (args[0] === 'api') { console.log(JSON.stringify([state.comments])); process.exit(0); }
if (args[0] === 'pr' && args[1] === 'comment') {
  state.posts = (state.posts || 0) + 1;
  const failing = state.fail && state.fail.at === state.posts ? state.fail : null;
  if (failing && !failing.lost) { save(); process.exit(1); }
  const video = args[args.indexOf('--attach') + 1];
  // Real gh replaces a body reference to the attached file with the uploaded asset's bare URL.
  const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8').replace('![](' + video + ')', 'https://github.com/user-attachments/assets/' + state.posts);
  const url = pr.url + '#issuecomment-' + (state.comments.length + 1);
  state.comments.push({ body, html_url: url, node_id: 'node' + (state.comments.length + 1) });
  save();
  if (failing) process.exit(1);
  console.log(url);
  process.exit(0);
}
process.exit(1);
`;

export async function fakeGh(fail: { at: number; lost?: boolean } | null = null) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-gh-'));
  await writeFile(join(dir, 'gh'), FAKE_GH);
  await chmod(join(dir, 'gh'), 0o755);
  const state = join(dir, 'state.json');
  await writeFile(state, JSON.stringify({ comments: [], fail }));
  return {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_GH_STATE: state },
    read: async () => JSON.parse(await readFile(state, 'utf8')),
  };
}

export const REPORT = {
  title: 'Filter by assignee',
  url: 'http://127.0.0.1:4173',
  summary: 'Narrow the board.',
  status: 'passed',
  seconds: 1,
  coverage: [{ id: 'filter', description: 'Picking a person shows their tasks', steps: [1] }],
  steps: [{ title: 'Pick Priya', status: 'passed', seconds: 1, checks: [{ label: '2 of 4 tasks', passed: true, changed: true }] }],
};

// A small real H.264 video with a report beside it, as pro-tour run leaves them.
export async function recording(video: string, report: Record<string, unknown> = {}, seconds = 1): Promise<string> {
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=160x120:rate=5:duration=${seconds}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    video,
  ]);
  const videoSha = sha(await readFile(video));
  await writeFile(video.replace('.mp4', '.json'), JSON.stringify({ ...REPORT, videoSha, ...report }));
  return video;
}
