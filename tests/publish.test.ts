import { strict as assert } from 'node:assert';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { publish } from '../src/publish.ts';
import { fakeGh, PR, recording } from './helpers.ts';

const pr = PR;

async function setup(mode: 'error' | 'lost' | null = null, name = 'feature-v1.mp4') {
  const { env, read } = await fakeGh(mode);
  const dir = await mkdtemp(join(tmpdir(), 'publish-test-'));
  const video = await recording(join(dir, name));
  return { video, env, read };
}

test('publishes one comment with the video and checklist, and a rerun reuses it', async () => {
  const { video, env, read } = await setup();
  const first = await publish(video, pr, { env, keep: true });
  assert.equal(first.reused, false);
  const second = await publish(video, pr, { env, keep: true });
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
  await access(video);
  await assert.rejects(publish(video, pr, { env }), /--retry-upload/);
  assert.equal((await read()).posts, 1);
  const result = await publish(video, pr, { env, retryUpload: true, keep: true });
  assert.equal(result.status, 'uploaded');
  assert.equal((await read()).comments.length, 1);
  assert.equal(JSON.parse(await readFile(video.replace('.mp4', '.upload.json'), 'utf8')).status, 'uploaded');
});

test('a new recording of the same tour hides the older comment as outdated', async () => {
  const { video, env, read } = await setup();
  await publish(video, pr, { env });
  const newer = await recording(video.replace('-v1.mp4', '-v2.mp4'), {}, 2);
  const result = await publish(newer, pr, { env });
  assert.equal(result.hidden, 1);
  const { comments } = await read();
  assert.deepEqual(
    comments.map((comment: { minimized?: boolean }) => Boolean(comment.minimized)),
    [true, false],
  );
});

test('a published recording is deleted locally, a dry run posts and deletes nothing', async () => {
  const { video, env, read } = await setup();
  const dry = await publish(video, pr, { env, dryRun: true });
  assert.match(dry.body ?? '', /### Feature tour: Filter by assignee/);
  assert.equal((await read()).posts ?? 0, 0);
  await access(video);
  await publish(video, pr, { env });
  for (const suffix of ['.mp4', '.json', '.md', '.upload.json']) {
    await assert.rejects(access(video.replace('.mp4', suffix)), { code: 'ENOENT' }, `${suffix} should be deleted`);
  }
});
