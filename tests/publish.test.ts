import { strict as assert } from 'node:assert';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { type PullRequest, publishTours } from '../src/publish.ts';
import { appTree, sha } from '../src/repo.ts';
import { fakeGh, git, PR, recordedTour, recording, repo } from './helpers.ts';

// A repository on a pushed PR branch with a passing recording of each tour.
async function setup(names = ['feature']) {
  const dir = await repo();
  const tours = [];
  for (const name of names) tours.push(await recordedTour(dir, name));
  const pr: PullRequest = { ...PR, head: git(dir, 'rev-parse', 'HEAD').trim() };
  return { dir, tours, pr };
}

const gone = (path: string) => assert.rejects(access(path), { code: 'ENOENT' }, `${path} should be deleted`);

test('publishes one comment with the video and checklist, then deletes the local recording', async () => {
  const { dir, tours, pr } = await setup();
  const { env, read } = await fakeGh();
  const [result] = await publishTours(dir, pr, tours, { env });
  assert.deepEqual(result, { name: 'feature', url: `${PR.url}#issuecomment-1`, reused: false });
  const { comments, posts } = await read();
  assert.equal(posts, 1);
  assert.match(comments[0].body, /^### Feature tour: Filter by assignee$/m);
  assert.match(comments[0].body, new RegExp(`^\\*\\*Passed\\*\\*: 1/1 steps · 1s video of ${pr.head.slice(0, 7)}$`, 'm'));
  assert.match(comments[0].body, /^https:\/\/github.com\/user-attachments\/assets\/1$/m);
  assert.match(comments[0].body, /^- ✓ Picking a person shows their tasks \(step 1\)$/m);
  assert.match(comments[0].body, /<!-- pro-tour:[0-9a-f]{64} -->/);
  for (const suffix of ['.mp4', '.json']) await gone(join(dir, '.videos', `feature${suffix}`));
});

test('a dry run returns the comment and posts and deletes nothing', async () => {
  const { dir, tours, pr } = await setup();
  const { env, read } = await fakeGh();
  const [result] = await publishTours(dir, pr, tours, { env, dryRun: true });
  assert.ok('body' in result && result.body.includes('### Feature tour: Filter by assignee'));
  assert.equal((await read()).posts ?? 0, 0);
  await access(join(dir, '.videos', 'feature.mp4'));
});

test('a lost response is reconciled from the posted comment instead of posting again', async () => {
  const { dir, tours, pr } = await setup();
  const { env, read } = await fakeGh({ at: 1, lost: true });
  const [result] = await publishTours(dir, pr, tours, { env });
  assert.deepEqual(result, { name: 'feature', url: `${PR.url}#issuecomment-1`, reused: false });
  assert.equal((await read()).comments.length, 1);
});

test('a failed post keeps the recording, and the next run posts it', async () => {
  const { dir, tours, pr } = await setup();
  const { env, read } = await fakeGh({ at: 1 });
  await assert.rejects(publishTours(dir, pr, tours, { env }), /Publishing feature failed and no comment for it is on the PR/);
  await access(join(dir, '.videos', 'feature.mp4'));
  await publishTours(dir, pr, tours, { env });
  assert.equal((await read()).comments.length, 1);
});

test('after a partial publish, a rerun reuses the posted comment and posts the rest', async () => {
  const { dir, tours, pr } = await setup(['first', 'second']);
  const { env, read } = await fakeGh({ at: 2 });
  await assert.rejects(publishTours(dir, pr, tours, { env }), /Publishing second failed/);
  const results = await publishTours(dir, pr, tours, { env });
  assert.deepEqual(
    results.map(result => ('reused' in result ? [result.name, result.reused] : [])),
    [
      ['first', true],
      ['second', false],
    ],
  );
  assert.equal((await read()).comments.length, 2);
});

test('a new recording of the same tour hides the older comment as outdated', async () => {
  const { dir, tours, pr } = await setup();
  const { env, read } = await fakeGh();
  await publishTours(dir, pr, tours, { env });
  await recording(join(dir, '.videos', 'feature.mp4'), { tourSha: sha(await readFile(tours[0])), appTree: appTree(dir) }, 2);
  await publishTours(dir, pr, tours, { env });
  assert.deepEqual(
    (await read()).comments.map((comment: { minimized?: boolean }) => Boolean(comment.minimized)),
    [true, false],
  );
});

test('a recording is refused unless it shows the tour and the app code at the head of the PR', async () => {
  const { dir, tours, pr } = await setup();
  const { env, read } = await fakeGh();

  await assert.rejects(publishTours(dir, { ...pr, head: 'f'.repeat(40) }, tours, { env }), /is not the head of .*push or pull/);

  await writeFile(join(dir, 'README.md'), 'app, changed after the recording\n');
  git(dir, 'commit', '-qam', 'change the app');
  const changed = { ...pr, head: git(dir, 'rev-parse', 'HEAD').trim() };
  await assert.rejects(publishTours(dir, changed, tours, { env }), /recorded from app code that differs from the pull request's/);

  await writeFile(tours[0], "export const meta = { title: 'edited' };\n");
  await recording(join(dir, '.videos', 'feature.mp4'), { tourSha: sha(await readFile(tours[0])), appTree: appTree(dir) });
  await assert.rejects(publishTours(dir, changed, tours, { env }), /Commit \.tours\/feature\.tour\.js and push it/);

  await writeFile(tours[0], "export const meta = { title: 'edited again' };\n");
  await assert.rejects(publishTours(dir, changed, tours, { env }), /changed after its latest recording/);
  assert.equal((await read()).posts ?? 0, 0);
});

// Record a tour of the working tree as it is, before anything is committed.
async function recordUncommitted(dir: string, name: string): Promise<string> {
  const tour = join(dir, '.tours', `${name}.tour.js`);
  await mkdir(join(dir, '.tours'), { recursive: true });
  await writeFile(tour, `export const meta = { title: '${name}' };\n`);
  await mkdir(join(dir, '.videos'), { recursive: true });
  await recording(join(dir, '.videos', `${name}.mp4`), { tourSha: sha(await readFile(tour)), appTree: appTree(dir) });
  return tour;
}

test('a recording of uncommitted app code publishes once that code is committed, and not other code', async () => {
  const dir = await repo();
  const { env } = await fakeGh();
  await writeFile(join(dir, 'README.md'), 'app with the change\n');
  await writeFile(join(dir, 'feature.js'), 'export const feature = true;\n');
  const tour = await recordUncommitted(dir, 'feature');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'the change and its tour');
  const head = () => ({ ...PR, head: git(dir, 'rev-parse', 'HEAD').trim() });
  await publishTours(dir, head(), [tour], { env, dryRun: true });

  await writeFile(join(dir, 'feature.js'), 'export const feature = false;\n');
  git(dir, 'commit', '-qam', 'a different change');
  await assert.rejects(
    publishTours(dir, head(), [tour], { env, dryRun: true }),
    /recorded from app code that differs from the pull request's head: feature\.js\. Commit or delete/,
  );
});

test('an untracked file at recording time is named when publish refuses', async () => {
  const dir = await repo();
  const { env } = await fakeGh();
  await writeFile(join(dir, 'scratch.md'), 'notes\n');
  const tour = await recordUncommitted(dir, 'feature');
  git(dir, 'add', '.tours');
  git(dir, 'commit', '-qm', 'tour');
  await assert.rejects(
    publishTours(dir, { ...PR, head: git(dir, 'rev-parse', 'HEAD').trim() }, [tour], { env, dryRun: true }),
    /differs from the pull request's head: scratch\.md\./,
  );
});
