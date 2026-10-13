import { strict as assert } from 'node:assert';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishTours } from '../src/publish.ts';
import { sha } from '../src/repo.ts';
import { fakeGh, PR, recording } from './helpers.ts';

// A repository with recorded tours, as pro-tour run leaves it.
async function setup(names = ['feature']) {
  const repo = await mkdtemp(join(tmpdir(), 'publish-test-'));
  await mkdir(join(repo, '.tours'));
  await mkdir(join(repo, '.videos'));
  const tours = [];
  for (const name of names) {
    const tour = join(repo, '.tours', `${name}.tour.js`);
    await writeFile(tour, `export const meta = { title: '${name}' };\n`);
    await recording(join(repo, '.videos', `${name}.mp4`), { tourSha: sha(await readFile(tour)) });
    tours.push(tour);
  }
  return { repo, tours };
}

const gone = (path: string) => assert.rejects(access(path), { code: 'ENOENT' }, `${path} should be deleted`);

test('publishes one comment with the video and checklist, then deletes the local recording', async () => {
  const { repo, tours } = await setup();
  const { env, read } = await fakeGh();
  const [result] = await publishTours(repo, PR, tours, { env });
  assert.deepEqual(result, { name: 'feature', url: `${PR.url}#issuecomment-1`, reused: false });
  const { comments, posts } = await read();
  assert.equal(posts, 1);
  assert.match(comments[0].body, /^### Feature tour: Filter by assignee$/m);
  assert.match(comments[0].body, /^https:\/\/github.com\/user-attachments\/assets\/1$/m);
  assert.match(comments[0].body, /^- ✓ Picking a person shows their tasks \(step 1\)$/m);
  assert.match(comments[0].body, /<!-- pro-tour:[0-9a-f]{64} -->/);
  for (const suffix of ['.mp4', '.json']) await gone(join(repo, '.videos', `feature${suffix}`));
});

test('a dry run returns the comment and posts and deletes nothing', async () => {
  const { repo, tours } = await setup();
  const { env, read } = await fakeGh();
  const [result] = await publishTours(repo, PR, tours, { env, dryRun: true });
  assert.ok('body' in result && result.body.includes('### Feature tour: Filter by assignee'));
  assert.equal((await read()).posts ?? 0, 0);
  await access(join(repo, '.videos', 'feature.mp4'));
});

test('a lost response is reconciled from the posted comment instead of posting again', async () => {
  const { repo, tours } = await setup();
  const { env, read } = await fakeGh({ at: 1, lost: true });
  const [result] = await publishTours(repo, PR, tours, { env });
  assert.deepEqual(result, { name: 'feature', url: `${PR.url}#issuecomment-1`, reused: false });
  assert.equal((await read()).comments.length, 1);
});

test('a failed post keeps the recording, and the next run posts it', async () => {
  const { repo, tours } = await setup();
  const { env, read } = await fakeGh({ at: 1 });
  await assert.rejects(publishTours(repo, PR, tours, { env }), /Publishing feature failed and no comment for it is on the PR/);
  await access(join(repo, '.videos', 'feature.mp4'));
  await publishTours(repo, PR, tours, { env });
  assert.equal((await read()).comments.length, 1);
});

test('after a partial publish, a rerun reuses the posted comment and posts the rest', async () => {
  const { repo, tours } = await setup(['first', 'second']);
  const { env, read } = await fakeGh({ at: 2 });
  await assert.rejects(publishTours(repo, PR, tours, { env }), /Publishing second failed/);
  const results = await publishTours(repo, PR, tours, { env });
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
  const { repo, tours } = await setup();
  const { env, read } = await fakeGh();
  await publishTours(repo, PR, tours, { env });
  await recording(join(repo, '.videos', 'feature.mp4'), { tourSha: sha(await readFile(tours[0])) }, 2);
  await publishTours(repo, PR, tours, { env });
  assert.deepEqual(
    (await read()).comments.map((comment: { minimized?: boolean }) => Boolean(comment.minimized)),
    [true, false],
  );
});
