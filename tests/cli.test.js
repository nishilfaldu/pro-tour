import { after, before, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createAppServer } from '../sample-app/server.js';
import { main } from '../src/cli.js';
import { fakeGh, recording } from './helpers.js';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' });
const sha = text => createHash('sha256').update(text).digest('hex');

// A repository whose main has `files`, checked out on a feature branch.
async function repo(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cli-test-'));
  git(dir, 'init', '-q', '-b', 'main');
  await writeFile(join(dir, 'README.md'), 'app\n');
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

// Run the CLI in `cwd` with `env`, capturing what it prints.
async function cli(cwd, args, env = process.env) {
  const out = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, env: process.env, cwd: process.cwd() };
  console.log = console.error = console.warn = (...parts) => out.push(parts.join(' '));
  process.env = env;
  process.chdir(cwd);
  try {
    return { code: await main(args), out: out.join('\n') };
  } finally {
    Object.assign(console, { log: saved.log, error: saved.error, warn: saved.warn });
    process.env = saved.env;
    process.chdir(saved.cwd);
  }
}

let server;
let appUrl;
before(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  appUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('bad arguments are usage errors, not crashes', async () => {
  const dir = await repo();
  assert.equal((await cli(dir, ['run', 'missing.tour.js'])).code, 2);
  assert.match((await cli(dir, ['run', 'x.tour.js', '--url', 'ftp://example.com'])).out, /http\(s\) URL/);
  assert.match((await cli(dir, ['run', 'x.tour.js', '--url', 'http://user:pw@localhost:1'])).out, /must not contain credentials/);
  assert.match((await cli(dir, ['run', 'missing.tour.js', '--url', appUrl])).out, /Tour file not found/);
  assert.equal((await cli(dir, ['nope'])).code, 2);
  assert.match((await cli(dir, ['api'])).out, /# Tour API/);
});

test('init installs the skill for every agent once, with the project\'s package runner', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'pnpm-lock.yaml'), '');
  await writeFile(join(dir, 'AGENTS.md'), '# Agents\n\nUse pnpm.');
  const first = await cli(dir, ['init']);
  assert.equal(first.code, 0);
  for (const copy of ['.agents/skills/pro-tour/SKILL.md', '.claude/skills/pro-tour/SKILL.md']) {
    const skill = await readFile(join(dir, copy), 'utf8');
    assert.match(skill, /^---\nname: pro-tour\ndescription: /);
    assert.match(skill, /pnpm exec pro-tour run \.tours\/<feature>\.tour\.js --url <app url>/);
    assert.doesNotMatch(skill, /\{\{run\}\}/);
  }
  assert.match(await readFile(join(dir, 'AGENTS.md'), 'utf8'), /^# Agents\n\nUse pnpm.\n\n## Feature tours\n/);
  assert.match(await readFile(join(dir, 'CLAUDE.md'), 'utf8'), /use the\n`pro-tour` skill/);
  assert.match(await readFile(join(dir, '.gitignore'), 'utf8'), /^\.videos\/$/m);
  const second = await cli(dir, ['init']);
  assert.match(second.out, /already up to date/);
  assert.equal((await readFile(join(dir, 'AGENTS.md'), 'utf8')).match(/## Feature tours/g).length, 1);
});

test('run records a tour, keeps only its latest recording, and names a failure file on failure', async () => {
  const dir = await repo();
  await mkdir(join(dir, '.tours'));
  const tour = join(dir, '.tours', 'status-filter.tour.js');
  await writeFile(tour, `export const meta = { title: 'Filter to Done', behaviors: { done: 'Done shows finished tasks' } };
export async function run(t) {
  await t.step('Filter to Done', () => t.select(t.page.getByRole('combobox', { name: 'Status', exact: true }), 'Done'),
    [t.text('1 task in view', t.page.locator('#visible-count'), '1')], { covers: ['done'] });
}
`);
  await mkdir(join(dir, '.videos'));
  await recording(join(dir, '.videos', 'status-filter-v1.mp4'));
  const passed = await cli(dir, ['run', tour, '--url', appUrl, '--json']);
  assert.equal(passed.code, 0, passed.out);
  const [result] = JSON.parse(passed.out);
  assert.equal(result.status, 'passed');
  assert.deepEqual((await readdir(join(dir, '.videos'))).filter(file => file.endsWith('.mp4')), [result.video.split('/').at(-1)]);

  await writeFile(tour, (await readFile(tour, 'utf8')).replace("'1')", "'7')"));
  const failed = await cli(dir, ['run', tour, '--url', appUrl]);
  assert.equal(failed.code, 1);
  const file = /Failure details: (\S+)/.exec(failed.out)[1];
  const details = await readFile(join(dir, file), 'utf8');
  assert.match(details, /Error: Check failed: 1 task in view/);
  assert.match(details, /Around the element the tour last acted on/);
});

test('publish posts the tours the PR changed, and refuses failed or stale recordings', async () => {
  const dir = await repo({ '.tours/untouched.tour.js': 'export const meta = { title: "Older feature" };\n' });
  const { env, read } = await fakeGh();
  const tour = join(dir, '.tours', 'assignee-filter.tour.js');
  await writeFile(tour, 'export const meta = { title: "Assignee filter" };\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'tour');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/owner/app.git');
  await mkdir(join(dir, '.videos'));
  const video = join(dir, '.videos', 'assignee-filter-v1.mp4');

  await recording(video, { status: 'failed', tourSha: sha(await readFile(tour)) });
  assert.match((await cli(dir, ['publish'], env)).out, /latest recording of assignee-filter failed/);

  await recording(video, { tourSha: 'stale' });
  assert.match((await cli(dir, ['publish'], env)).out, /changed after its latest recording/);

  await recording(video, { tourSha: sha(await readFile(tour)) });
  const dry = await cli(dir, ['publish', '--dry-run'], env);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /--- assignee-filter: comment that would be posted to https:\/\/github.com\/owner\/app\/pull\/1 ---/);
  assert.doesNotMatch(dry.out, /untouched/);

  const posted = await cli(dir, ['publish'], env);
  assert.equal(posted.code, 0, posted.out);
  assert.match(posted.out, /Published assignee-filter: https:\/\/github.com\/owner\/app\/pull\/1#issuecomment-1/);
  assert.equal((await read()).posts, 1);
  await assert.rejects(access(video), { code: 'ENOENT' });
});
