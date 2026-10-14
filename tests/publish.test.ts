import { strict as assert } from 'node:assert';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { type PullRequest, publishTours } from '../src/publish.ts';
import { fakeGh, git, PR, recording, repo } from './helpers.ts';

// A repository on a pushed PR branch with a passing recording of each tour.
async function setup(names = ['feature']) {
  const dir = await repo();
  const head = git(dir, 'rev-parse', 'HEAD').trim();
  for (const name of names) await recording(join(dir, '.videos', `${name}.mp4`), { commit: head });
  await mkdir(join(dir, '.videos'), { recursive: true });
  await writeFile(join(dir, '.videos', '.gitignore'), '*\n');
  const pr: PullRequest = { ...PR, head };
  return { dir, names, pr };
}

const gone = (path: string) => assert.rejects(access(path), { code: 'ENOENT' }, `${path} should be deleted`);

test('publishes one comment per recording, then deletes the videos and .videos/ with them', async () => {
  const { dir, names, pr } = await setup(['feature', 'apps/web/login']);
  const { env, read } = await fakeGh();
  const results = await publishTours(dir, pr, names, { env });
  assert.deepEqual(results, [
    { name: 'feature', url: `${PR.url}#issuecomment-1`, reused: false },
    { name: 'apps/web/login', url: `${PR.url}#issuecomment-2`, reused: false },
  ]);
  const { comments } = await read();
  assert.match(comments[0].body, /^### Feature tour: Filter by assignee$/m);
  assert.match(
    comments[0].body,
    new RegExp(`^\\*\\*✓ Passed\\*\\* · 1 step · 1s · recorded at \`${pr.head.slice(0, 7)}\`, this PR's head$`, 'm'),
  );
  assert.match(comments[0].body, /^https:\/\/github.com\/user-attachments\/assets\/1$/m);
  assert.match(comments[0].body, /^ {2}- ✓ 2 of 4 tasks$/m);
  assert.match(comments[0].body, /<!-- pro-tour:[0-9a-f]{64} -->/);
  await gone(join(dir, '.videos'));
});

test('a failed recording is published as failed, not refused', async () => {
  const { dir, pr } = await setup([]);
  await recording(join(dir, '.videos', 'feature.mp4'), { status: 'failed', error: 'Card says Ana', commit: 'f'.repeat(40), dirty: true });
  const { env, read } = await fakeGh();
  await publishTours(dir, pr, ['feature'], { env });
  const [comment] = (await read()).comments;
  assert.match(
    comment.body,
    /^\*\*✗ Failed\*\* · .* recorded at `fffffff`, not this PR's head \(`[0-9a-f]{7}`\), plus uncommitted changes$/m,
  );
  assert.match(comment.body, /^> ✗ Card says Ana$/m);
});

test('a dry run returns the comment and posts and deletes nothing', async () => {
  const { dir, names, pr } = await setup();
  const { env, read } = await fakeGh();
  const [result] = await publishTours(dir, pr, names, { env, dryRun: true });
  assert.ok('body' in result && result.body.includes('### Feature tour: Filter by assignee'));
  assert.equal((await read()).posts ?? 0, 0);
  await access(join(dir, '.videos', 'feature.mp4'));
});

test('a missing recording, or a video pro-tour did not make, stops before anything is posted', async () => {
  const { dir, pr } = await setup(['first']);
  const { env, read } = await fakeGh();
  await assert.rejects(publishTours(dir, pr, ['first', 'second'], { env }), /No recording of second; record it with pro-tour run first/);
  await recording(join(dir, '.videos', 'second.mp4'));
  await writeFile(join(dir, '.videos', 'second.mp4'), 'not a video');
  await assert.rejects(publishTours(dir, pr, ['first', 'second'], { env }), /second\.mp4 is not a pro-tour recording; record second again/);
  assert.equal((await read()).posts ?? 0, 0);
});

test('a lost response is reconciled from the posted comment instead of posting again', async () => {
  const { dir, names, pr } = await setup();
  const { env, read } = await fakeGh({ at: 1, lost: true });
  const [result] = await publishTours(dir, pr, names, { env });
  assert.deepEqual(result, { name: 'feature', url: `${PR.url}#issuecomment-1`, reused: false });
  assert.equal((await read()).comments.length, 1);
});

test('a failed post keeps the recording, and the next run posts it', async () => {
  const { dir, names, pr } = await setup();
  const { env, read } = await fakeGh({ at: 1 });
  await assert.rejects(publishTours(dir, pr, names, { env }), /Publishing feature failed and no comment for it is on the PR/);
  await access(join(dir, '.videos', 'feature.mp4'));
  await publishTours(dir, pr, names, { env });
  assert.equal((await read()).comments.length, 1);
});

test('after a partial publish, the posted video is already gone and a rerun posts the rest', async () => {
  const { dir, names, pr } = await setup(['first', 'second']);
  const { env, read } = await fakeGh({ at: 2 });
  await assert.rejects(publishTours(dir, pr, names, { env }), /Publishing second failed/);
  assert.deepEqual((await readdir(join(dir, '.videos'))).sort(), ['.gitignore', 'second.mp4']);
  const results = await publishTours(dir, pr, ['second'], { env });
  assert.deepEqual(results, [{ name: 'second', url: `${PR.url}#issuecomment-2`, reused: false }]);
  assert.equal((await read()).comments.length, 2);
});

test('a new recording of the same tour hides the older comment as outdated', async () => {
  const { dir, names, pr } = await setup();
  const { env, read } = await fakeGh();
  await publishTours(dir, pr, names, { env });
  await recording(join(dir, '.videos', 'feature.mp4'), { commit: pr.head }, 2);
  await publishTours(dir, pr, names, { env });
  assert.deepEqual(
    (await read()).comments.map((comment: { minimized?: boolean }) => Boolean(comment.minimized)),
    [true, false],
  );
});
