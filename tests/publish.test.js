import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publish } from '../src/publish.js';

const pr = { number: 1, url: 'https://github.com/owner/app/pull/1', repo: 'owner/app' };

// A stand-in for gh that keeps PR comments in a JSON state file. `mode` makes `pr comment` fail:
// "error" posts nothing; "lost" posts the comment but reports a failure, as a dropped response would.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs');
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const save = () => fs.writeFileSync(file, JSON.stringify(state));
if (args[0] === 'pr' && args[1] === 'comment' && args.includes('--help')) { console.log('--attach file'); process.exit(0); }
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
  const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8').replace('](' + video + ')', '](https://github.com/user-attachments/assets/abc)');
  const mode = state.mode;
  if (mode === 'error') { state.mode = null; save(); process.exit(1); }
  const url = 'https://github.com/owner/app/pull/1#issuecomment-' + (state.comments.length + 1);
  state.comments.push({ body, html_url: url, node_id: 'node' + (state.comments.length + 1) });
  if (mode === 'lost') { state.mode = null; save(); process.exit(1); }
  save();
  console.log(url);
  process.exit(0);
}
process.exit(1);
`;

async function setup(mode = null, name = 'feature-v1.mp4') {
  const dir = await mkdtemp(join(tmpdir(), 'publish-test-'));
  await writeFile(join(dir, 'gh'), FAKE_GH);
  await chmod(join(dir, 'gh'), 0o755);
  const state = join(dir, 'state.json');
  await writeFile(state, JSON.stringify({ comments: [], mode }));
  const video = join(dir, name);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  await writeFile(video.replace('.mp4', '.json'), JSON.stringify({
    title: 'Filter by assignee', summary: 'Narrow the board.', status: 'passed', seconds: 1,
    coverage: [{ id: 'filter', description: 'Picking a person shows their tasks', steps: [1] }],
    steps: [{ title: 'Pick Priya', status: 'passed', seconds: 1, checks: [{ label: '2 of 4 tasks', passed: true, changed: true }] }],
  }));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_GH_STATE: state };
  const read = async () => JSON.parse(await readFile(state, 'utf8'));
  return { video, env, read };
}

test('publishes one comment with the video and checklist, and a rerun reuses it', async () => {
  const { video, env, read } = await setup();
  const first = await publish(video, pr, { env });
  assert.equal(first.reused, false);
  const second = await publish(video, pr, { env });
  assert.equal(second.reused, true);
  assert.equal(second.commentUrl, first.commentUrl);
  const { comments, posts } = await read();
  assert.equal(posts, 1);
  assert.match(comments[0].body, /### Feature tour: Filter by assignee/);
  assert.match(comments[0].body, /!\[\]\(https:\/\/github.com\/user-attachments\/assets\/abc\)/);
  assert.match(comments[0].body, /- ✓ Picking a person shows their tasks \(step 1\)/);
  assert.match(comments[0].body, /<!-- pro-tour:[0-9a-f]{64} -->/);
});

test('a lost response is reconciled from the posted comment instead of uploading again', async () => {
  const { video, env, read } = await setup('lost');
  const result = await publish(video, pr, { env });
  assert.equal(result.status, 'uploaded');
  assert.equal((await read()).posts, 1);
});

test('an unknown result blocks another upload until --retry-upload', async () => {
  const { video, env, read } = await setup('error');
  await assert.rejects(publish(video, pr, { env }), /result is unknown/);
  await assert.rejects(publish(video, pr, { env }), /--retry-upload/);
  assert.equal((await read()).posts, 1);
  const result = await publish(video, pr, { env, retryUpload: true });
  assert.equal(result.status, 'uploaded');
  assert.equal((await read()).comments.length, 1);
  assert.equal(JSON.parse(await readFile(video.replace('.mp4', '.upload.json'), 'utf8')).status, 'uploaded');
});

test('a new recording of the same tour hides the older comment as outdated', async () => {
  const { video, env, read } = await setup();
  await publish(video, pr, { env });
  const newer = video.replace('-v1.mp4', '-v2.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', newer]);
  await writeFile(newer.replace('.mp4', '.json'), await readFile(video.replace('.mp4', '.json')));
  const result = await publish(newer, pr, { env });
  assert.equal(result.hidden, 1);
  const { comments } = await read();
  assert.deepEqual(comments.map(comment => Boolean(comment.minimized)), [true, false]);
});
