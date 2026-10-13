// Shared test helpers: a stand-in gh CLI and recorded-looking videos.
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PR = { number: 1, url: 'https://github.com/owner/app/pull/1', repo: 'owner/app', base: 'main' };

// Keeps PR comments in a JSON state file. `mode` makes `pr comment` fail: "error" posts nothing;
// "lost" posts the comment but reports a failure, as a dropped response would.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs');
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const pr = ${JSON.stringify(PR)};
if (args[0] === 'pr' && args[1] === 'comment' && args.includes('--help')) { console.log('--attach file'); process.exit(0); }
if (args[0] === 'pr' && args[1] === 'list') { console.log(JSON.stringify([{ number: pr.number, url: pr.url, headRepositoryOwner: { login: 'owner' } }])); process.exit(0); }
if (args[0] === 'pr' && args[1] === 'view') { console.log(JSON.stringify({ number: pr.number, url: pr.url, baseRefName: pr.base })); process.exit(0); }
if (args[0] === 'api' && args[1] === 'graphql') {
  const id = /subjectId: "([^"]+)"/.exec(args.join(' '))[1];
  state.comments.find(comment => comment.node_id === id).minimized = true;
  save();
  process.exit(0);
}
if (args[0] === 'api') { console.log(JSON.stringify([state.comments])); process.exit(0); }
if (args[0] === 'pr' && args[1] === 'comment') {
  state.posts = (state.posts || 0) + 1;
  const video = args[args.indexOf('--attach') + 1];
  // Real gh replaces a body reference to the attached file with the uploaded asset's bare URL.
  const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8').replace('![](' + video + ')', 'https://github.com/user-attachments/assets/abc');
  const mode = state.mode;
  if (mode === 'error') { state.mode = null; save(); process.exit(1); }
  const url = pr.url + '#issuecomment-' + (state.comments.length + 1);
  state.comments.push({ body, html_url: url, node_id: 'node' + (state.comments.length + 1) });
  if (mode === 'lost') { state.mode = null; save(); process.exit(1); }
  save();
  console.log(url);
  process.exit(0);
}
process.exit(1);
`;

export async function fakeGh(mode: 'error' | 'lost' | null = null) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-gh-'));
  await writeFile(join(dir, 'gh'), FAKE_GH);
  await chmod(join(dir, 'gh'), 0o755);
  const state = join(dir, 'state.json');
  await writeFile(state, JSON.stringify({ comments: [], mode }));
  return {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_GH_STATE: state },
    read: async () => JSON.parse(await readFile(state, 'utf8')),
  };
}

export const REPORT = {
  title: 'Filter by assignee',
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
  await writeFile(video.replace('.mp4', '.json'), JSON.stringify({ ...REPORT, ...report }));
  await writeFile(video.replace('.mp4', '.md'), '# report');
  return video;
}
