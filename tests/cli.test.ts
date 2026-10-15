import { strict as assert } from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../sample-app/server.js';
import { main } from '../src/cli.ts';
import { readRecording } from '../src/record.ts';
import { fakeGh, git, recording, repo } from './helpers.ts';

// Tours record at full speed in tests: no cursor travel, typing delay or pauses.
const FAST = { ...process.env, PRO_TOUR_PACE: 'fast' };

// Run the CLI in `cwd` with `env`, capturing what it prints.
async function cli(cwd: string, args: string[], env: NodeJS.ProcessEnv = FAST): Promise<{ code: number; out: string }> {
  const out: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, env: process.env, cwd: process.cwd() };
  console.log = console.error = console.warn = (...parts: unknown[]) => void out.push(parts.join(' '));
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

// A one-step tour of the sample app's status filter.
const FILTER_TOUR = `import { expect, test } from 'pro-tour';

test('Filter to Done', async ({ page }) => {
  await test.step('Filter to Done', async () => {
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Done');
    await expect(page.locator('#visible-count'), '1 task in view').toHaveText('1');
  });
});
`;

async function withTour(body: string, name = 'status-filter.tour.ts', files: Record<string, string> = {}) {
  const dir = await repo(files);
  await mkdir(join(dir, '.tours'), { recursive: true });
  const tour = join(dir, '.tours', name);
  await writeFile(tour, body);
  return { dir, tour, videos: join(dir, '.videos') };
}

let server: Server;
let appUrl: string;
before(async () => {
  server = createAppServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  appUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('bad arguments are usage errors, not crashes', async () => {
  const dir = await repo();
  assert.equal((await cli(dir, ['run', 'missing.tour.ts'])).code, 2);
  const ftp = await cli(dir, ['run', 'x.tour.ts', '--url', 'ftp://example.com']);
  assert.deepEqual([ftp.code, /http\(s\) URL/.test(ftp.out)], [2, true]);
  assert.match((await cli(dir, ['run', 'x.tour.ts', '--url', 'http://user:pw@localhost:1'])).out, /must not contain credentials/);
  assert.match((await cli(dir, ['run', 'missing.tour.ts', '--url', appUrl])).out, /Tour file not found/);
  assert.match((await cli(dir, ['run', 'README.md', '--url', appUrl])).out, /README\.md is not a tour/);
  assert.equal((await cli(dir, ['nope'])).code, 2);
  assert.match((await cli(dir, ['publish'])).out, /There are no recordings in \.videos\/ to publish/);
});

test('init points AGENTS.md and CLAUDE.md at the docs, replaces an older section and removes the old skill', async () => {
  const dir = await repo();
  await writeFile(
    join(dir, 'AGENTS.md'),
    '# Agents\n\nUse pnpm.\n\n## Feature tours\n\nuse the `pro-tour` skill\n\n## Testing\n\nRun pnpm test.\n',
  );
  await mkdir(join(dir, '.claude', 'skills', 'pro-tour'), { recursive: true });
  await writeFile(join(dir, '.claude', 'skills', 'pro-tour', 'SKILL.md'), 'old');
  // As pnpm installs it, pro-tour is reached through node_modules.
  await mkdir(join(dir, 'node_modules', 'pro-tour', 'docs'), { recursive: true });
  await writeFile(join(dir, 'node_modules', 'pro-tour', 'docs', 'feature-tours.md'), '# Feature tours');
  const first = await cli(dir, ['init']);
  assert.equal(first.code, 0, first.out);
  assert.equal(
    await readFile(join(dir, 'AGENTS.md'), 'utf8'),
    '# Agents\n\nUse pnpm.\n\n## Feature tours\n\nAfter changing something users can see in the app, or when asked for a feature tour, read `node_modules/pro-tour/docs/feature-tours.md` and follow it.\n\n## Testing\n\nRun pnpm test.\n',
  );
  assert.match(
    await readFile(join(dir, 'CLAUDE.md'), 'utf8'),
    /^## Feature tours\n\nAfter changing .* read `node_modules\/pro-tour\/docs\/feature-tours\.md`/,
  );
  await assert.rejects(access(join(dir, '.claude', 'skills', 'pro-tour')), { code: 'ENOENT' });
  await assert.rejects(access(join(dir, '.gitignore')), { code: 'ENOENT' });
  assert.match((await cli(dir, ['init'])).out, /^Already set up\.$/);
});

test('init writes the section only to AGENTS.md when CLAUDE.md imports it, and removes an earlier copy', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'AGENTS.md'), '# Agents\n');
  await writeFile(join(dir, 'CLAUDE.md'), '@AGENTS.md\n\n## Feature tours\n\nold\n\n## Testing\n\nRun pnpm test.\n');
  const first = await cli(dir, ['init']);
  assert.equal(first.code, 0, first.out);
  assert.match(first.out, /^updated AGENTS\.md\nremoved the Feature tours section from CLAUDE\.md\n/);
  assert.match(first.out, /^CLAUDE\.md imports AGENTS\.md, so only AGENTS\.md has the Feature tours section\.$/m);
  assert.match(await readFile(join(dir, 'AGENTS.md'), 'utf8'), /^# Agents\n\n## Feature tours\n/);
  assert.equal(await readFile(join(dir, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n\n## Testing\n\nRun pnpm test.\n');
  assert.match((await cli(dir, ['init'])).out, /only AGENTS\.md has the Feature tours section\.\nAlready set up\.$/);
});

test('run records the tour as one MP4 that carries its result, and touches nothing else', async () => {
  const { dir, tour, videos } = await withTour(FILTER_TOUR);
  const passed = await cli(dir, ['run', tour, '--url', appUrl, '--json']);
  assert.equal(passed.code, 0, passed.out);
  const [result] = JSON.parse(passed.out);
  assert.equal(result.status, 'passed');
  assert.ok(result.video.endsWith('/.videos/status-filter.mp4'), passed.out);
  assert.deepEqual((await readdir(videos)).sort(), ['.gitignore', 'status-filter.mp4']);
  // .videos/ ignores itself, so git and the app's own .gitignore never see it.
  assert.equal(await readFile(join(videos, '.gitignore'), 'utf8'), '*\n');
  assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all'), '?? .tours/status-filter.tour.ts\n');
  const saved = await readRecording(result.video);
  assert.equal(typeof saved?.steps[0].at, 'number');
  assert.deepEqual(
    { ...saved, seconds: typeof saved?.seconds },
    {
      title: 'Filter to Done',
      status: 'passed',
      steps: [{ title: 'Filter to Done', at: saved?.steps[0].at, status: 'passed', checks: [{ label: '1 task in view', passed: true }] }],
      seconds: 'number',
      commit: git(dir, 'rev-parse', 'HEAD').trim(),
      dirty: false,
      tree: saved?.tree,
    },
  );
  // The code it was recorded with, the uncommitted tour included, without touching the index (checked above).
  git(dir, 'add', '-A');
  assert.equal(saved?.tree, git(dir, 'write-tree').trim());
});

test('a failure prints the error at the tour line and the visible DOM, and the video records it failing', async () => {
  const { dir, tour, videos } = await withTour(FILTER_TOUR.replace("toHaveText('1')", "toHaveText('7')"));
  await writeFile(join(dir, 'README.md'), 'an uncommitted change\n');
  const failed = await cli(dir, ['run', tour, '--url', appUrl]);
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /^FAILED: Filter to Done · \.videos\/status-filter\.mp4 \(/m);
  assert.match(failed.out, /^ {2}✗ Filter to Done\n {6}✗ 1 task in view$/m);
  assert.match(failed.out, /Error: 1 task in view\n\n {2}expect\(locator\)\.toHaveText\(expected\) failed/);
  assert.match(failed.out, /^ {6}at \.tours\/status-filter\.tour\.ts:6:68$/m);
  assert.match(failed.out, /^ {2}> {4}6 \| {5}await expect\(page\.locator\('#visible-count'\)/m);
  assert.match(failed.out, /Visible DOM where the tour stopped:\n {4}Around the element the tour last acted on:/);
  // The DOM is long, so the failure is repeated in one line at the end.
  assert.match(
    failed.out,
    /\nFAILED: step "Filter to Done" · Error: 1 task in view · locator\('#visible-count'\) · \.tours\/status-filter\.tour\.ts:6:68 \(error above the DOM\)$/,
  );
  const saved = await readRecording(join(videos, 'status-filter.mp4'));
  assert.deepEqual([saved?.status, saved?.error, saved?.dirty], ['failed', 'Error: 1 task in view', true]);
});

test('--fast runs the tour with the same checks and output, and records nothing', async () => {
  const { dir, tour, videos } = await withTour(FILTER_TOUR.replace("toHaveText('1')", "toHaveText('7')"));
  await recording(join(videos, 'status-filter.mp4'));
  const before = await readFile(join(videos, 'status-filter.mp4'));
  // At full pace, as an agent would run it, and with no ffmpeg: a fast run does not need it.
  const bin = await mkdtemp(join(tmpdir(), 'no-ffmpeg-'));
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:/usr/bin:/bin` };
  delete env.PRO_TOUR_PACE;
  const failed = await cli(dir, ['run', tour, '--url', appUrl, '--fast'], env);
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /^FAILED: Filter to Done · \.tours\/status-filter\.tour\.ts \([\d.]+s, not recorded: --fast\)$/m);
  assert.match(failed.out, /^ {6}✗ 1 task in view$/m);
  assert.match(
    failed.out,
    /\nFAILED: step "Filter to Done" · Error: 1 task in view · locator\('#visible-count'\) · \.tours\/status-filter\.tour\.ts:6:68/,
  );
  assert.deepEqual((await readdir(videos)).sort(), ['.gitignore', 'status-filter.mp4']);
  assert.deepEqual(await readFile(join(videos, 'status-filter.mp4')), before);
  await writeFile(tour, FILTER_TOUR);
  const passed = await cli(dir, ['run', tour, '--url', appUrl, '--fast', '--json'], env);
  assert.equal(passed.code, 0, passed.out);
  assert.deepEqual(
    JSON.parse(passed.out).map(({ status, video }: { status: string; video: string | null }) => [status, video]),
    [['passed', null]],
  );
});

test('the video hides --hide elements and the Next.js badge without an error, and notices move off the target', async () => {
  const page = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<body style="margin:0"><header style="display:flex;justify-content:flex-end;padding:10px 24px">
      <button onclick="this.textContent = 'Signed in'">Sign in</button></header>
      <div class="dev-toolbar">toolbar</div>
      <script>
        // As Next.js 16 draws it: the badge in the open shadow root of <nextjs-portal>.
        for (const error of ['false', 'true']) {
          const portal = document.createElement('nextjs-portal');
          portal.className = 'error-' + error;
          portal.attachShadow({ mode: 'open' }).innerHTML =
            '<div id="devtools-indicator"><div data-next-badge data-error="' + error + '">N</div></div>';
          document.body.append(portal);
        }
      </script></body>`);
  });
  await new Promise<void>(resolve => page.listen(0, '127.0.0.1', resolve));
  try {
    const { dir, tour } = await withTour(`import { expect, test } from 'pro-tour';
const shown = (portal: string) =>
  document.querySelector(portal)!.shadowRoot!.querySelector<HTMLElement>('#devtools-indicator')!.checkVisibility();
test('Overlays', async ({ page }) => {
  await test.step('Sign in', async () => {
    await expect(page.locator('.dev-toolbar'), 'The toolbar is hidden').toBeHidden();
    expect(await page.evaluate(shown, '.error-false'), 'The badge is hidden').toBe(false);
    expect(await page.evaluate(shown, '.error-true'), 'An error badge shows').toBe(true);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const notices = await page.evaluate(() => sessionStorage.getItem('__tour_notices'));
    expect(notices, 'The notices moved off the button').toBe('low');
  });
});
`);
    const run = await cli(dir, [
      'run',
      tour,
      '--url',
      `http://127.0.0.1:${(page.address() as AddressInfo).port}`,
      '--hide',
      '.dev-toolbar',
      '--fast',
    ]);
    assert.equal(run.code, 0, run.out);
  } finally {
    page.close();
  }
});

test('tours are held to what a watchable video needs, each with an error that says what to change', async () => {
  const cases: Record<string, [string, RegExp]> = {
    'outside-step.tour.ts': [
      `import { test } from 'pro-tour';\ntest('Outside', async ({ page }) => {\n  await page.getByRole('button', { name: 'New task' }).click();\n});\n`,
      /locator\.click\(\) ran outside a test\.step\. Put every action inside test\.step/,
    ],
    'no-steps.tour.ts': [`import { test } from 'pro-tour';\ntest('Nothing', async () => {});\n`, /The tour has no test\.step/],
    'no-message.tour.js': [
      `import { expect, test } from 'pro-tour';\ntest('Unlabelled', async ({ page }) => {\n  await test.step('Look', async () => {\n    await expect(page.locator('h1')).toBeVisible();\n  });\n});\n`,
      /expect\(\) needs a message as its second argument/,
    ],
    'playwright-import.tour.js': [
      `import { test } from 'playwright/test';\ntest('Plain', async ({ page }) => {\n  await page.goto('about:blank');\n});\n`,
      /Import test and expect from 'pro-tour', not from 'playwright\/test'/,
    ],
    'two-tests.tour.ts': [
      `import { test } from 'pro-tour';\ntest('One', async () => {});\ntest('Two', async () => {});\n`,
      /A tour is one test, and this file has 2/,
    ],
    'syntax.tour.js': [`import { test } from 'pro-tour';\ntest('Broken', async () => {\n`, /The tour failed to load/],
  };
  const dir = await repo();
  await mkdir(join(dir, '.tours'));
  for (const [name, [body]] of Object.entries(cases)) await writeFile(join(dir, '.tours', name), body);
  const files = Object.keys(cases).map(name => join(dir, '.tours', name));
  const run = await cli(dir, ['run', ...files, '--url', appUrl, '--json']);
  assert.equal(run.code, 1, run.out);
  const results = JSON.parse(run.out);
  for (const [i, [name, [, error]]] of Object.entries(cases).entries()) {
    assert.equal(results[i].status, 'failed', name);
    assert.match(results[i].error, error, name);
  }
});

test("actions look like a person's: fill types key by key, selectOption picks by label, and page shorthands act the same", async () => {
  const page = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<input aria-label="Name"><select aria-label="Size"><option value="s">Small</option><option value="l">Large</option></select>
      <button onclick="this.textContent = 'Clicked'">Go</button><script>
      window.keys = 0; document.querySelector('input').addEventListener('keydown', () => window.keys++);
    </script>`);
  });
  await new Promise<void>(resolve => page.listen(0, '127.0.0.1', resolve));
  try {
    const { dir, tour } = await withTour(`import { expect, test } from 'pro-tour';
test('Actions', async ({ page }) => {
  await test.step('Type, pick and press', async () => {
    await page.getByLabel('Name').fill('Priya');
    await expect.poll(() => page.evaluate(() => (window as unknown as { keys: number }).keys), 'Typed key by key').toBe(5);
    await page.getByLabel('Size').selectOption('Large');
    await expect(page.getByLabel('Size'), 'Large is picked').toHaveValue('l');
    await page.click('button');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button'), 'Go was clicked').toHaveText('Clicked');
    expect(1 + 1, 'Synchronous expects show too').toBe(2);
  });
});
`);
    const run = await cli(dir, ['run', tour, '--url', `http://127.0.0.1:${(page.address() as AddressInfo).port}`]);
    assert.equal(run.code, 0, run.out);
    assert.match(run.out, /✓ Typed key by key\n {6}✓ Large is picked\n {6}✓ Go was clicked\n {6}✓ Synchronous expects show too/);
  } finally {
    page.close();
  }
});

test('an unreachable app is a recording error that leaves nothing behind', async () => {
  const { dir, tour, videos } = await withTour(FILTER_TOUR);
  const run = await cli(dir, ['run', tour, '--url', 'http://127.0.0.1:9', '--json']);
  assert.equal(run.code, 3, run.out);
  const [result] = JSON.parse(run.out);
  assert.equal(result.status, 'error');
  assert.match(result.error, /^Recording failed: The app did not open at http:\/\/127\.0\.0\.1:9\/: page\.goto: net::ERR_/);
  assert.match(result.error, /Start the app, or pass the URL it runs at with --url\.$/);
  await assert.rejects(access(videos), { code: 'ENOENT' });
});

test('a recording that fails to encode leaves the previous recording as it was', async () => {
  const { dir, tour, videos } = await withTour(FILTER_TOUR);
  await recording(join(videos, 'status-filter.mp4'));
  const before = await readFile(join(videos, 'status-filter.mp4'));
  const bin = await mkdtemp(join(tmpdir(), 'broken-ffmpeg-'));
  await writeFile(join(bin, 'ffmpeg'), '#!/bin/sh\necho "encoder broke" >&2\nexit 1\n');
  await chmod(join(bin, 'ffmpeg'), 0o755);
  const run = await cli(dir, ['run', tour, '--url', appUrl], { ...FAST, PATH: `${bin}:${process.env.PATH}` });
  assert.equal(run.code, 3, run.out);
  assert.match(run.out, /^ERROR: .*status-filter\.tour\.ts\n {2}Recording failed: ffmpeg failed: encoder broke/m);
  assert.deepEqual((await readdir(videos)).sort(), ['.gitignore', 'status-filter.mp4']);
  assert.deepEqual(await readFile(join(videos, 'status-filter.mp4')), before);
});

test("a tour runs whatever the app's package.json says, and an app that never stops polling still records", async () => {
  const polling = createServer((request, response) => {
    if (request.url === '/poll') return void setTimeout(() => response.end('{}'), 300);
    response.setHeader('content-type', 'text/html');
    response.end(`<button>Go</button><p id="out">idle</p><script>
      setInterval(() => fetch('/poll'), 100);
      document.querySelector('button').onclick = () => { document.querySelector('#out').textContent = 'done'; };
    </script>`);
  });
  await new Promise<void>(resolve => polling.listen(0, '127.0.0.1', resolve));
  try {
    const { dir, tour } = await withTour(
      `import { expect, test } from 'pro-tour';
test('Go', async ({ page }) => {
  await test.step('Press Go', async () => {
    await page.getByRole('button', { name: 'Go' }).click();
    await expect(page.locator('#out'), 'Says done').toHaveText('done');
  });
});
`,
      'go.tour.ts',
      { 'package.json': '{ "type": "commonjs" }\n' },
    );
    const started = Date.now();
    const run = await cli(dir, ['run', tour, '--url', `http://127.0.0.1:${(polling.address() as AddressInfo).port}`]);
    assert.equal(run.code, 0, run.out);
    assert.ok(Date.now() - started < 25_000, 'the first page load must not wait for the network to go quiet');
  } finally {
    polling.closeAllConnections();
    polling.close();
  }
});

test('Ctrl-C stops the recording, keeps the previous one and exits 130', async () => {
  const { dir, tour, videos } = await withTour(FILTER_TOUR);
  await recording(join(videos, 'status-filter.mp4'));
  const before = await readFile(join(videos, 'status-filter.mp4'));
  // Its own process group, signalled as a whole, as a terminal does on Ctrl-C. At full pace, so it is still
  // recording when the signal comes.
  const bin = fileURLToPath(new URL('../bin/pro-tour.js', import.meta.url));
  const child = spawn(process.execPath, [bin, 'run', tour, '--url', appUrl], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', data => {
    out += data;
  });
  child.stderr.on('data', data => {
    out += data;
  });
  const exited = new Promise<number | null>(resolve => child.on('close', resolve));
  // Wait for the browser to be recording: its temporary directory appears first.
  for (let i = 0; i < 100 && !(await readdir(videos)).some(file => file.startsWith('.recording-')); i++)
    await new Promise(resolve => setTimeout(resolve, 100));
  await new Promise(resolve => setTimeout(resolve, 2500));
  process.kill(-(child.pid ?? 0), 'SIGINT');
  assert.equal(await exited, 130, out);
  assert.match(out, /^INTERRUPTED: \.tours\/status-filter\.tour\.ts\n {2}Nothing was recorded; the previous recording is unchanged\.$/m);
  assert.deepEqual((await readdir(videos)).sort(), ['.gitignore', 'status-filter.mp4']);
  assert.deepEqual(await readFile(join(videos, 'status-filter.mp4')), before);
});

test('in a monorepo, each package keeps its tours in its own .tours/, and publish posts and clears them', async () => {
  const dir = await repo();
  git(dir, 'remote', 'add', 'origin', 'https://github.com/owner/app.git');
  const tours = join(dir, 'apps', 'web', '.tours');
  await mkdir(tours, { recursive: true });
  await writeFile(join(tours, 'status-filter.tour.ts'), FILTER_TOUR);
  assert.match((await cli(dir, ['check'])).out, /^Types OK: apps\/web\/\.tours\/status-filter\.tour\.ts$/);
  const run = await cli(join(dir, 'apps', 'web'), ['run', '.tours/status-filter.tour.ts', '--url', appUrl, '--json']);
  assert.equal(run.code, 0, run.out);
  assert.ok(JSON.parse(run.out)[0].video.endsWith('/.videos/apps/web/status-filter.mp4'), run.out);
  const { env, read } = await fakeGh();
  const dry = await cli(dir, ['publish', '--dry-run'], env);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /^--- apps\/web\/status-filter: comment that would be posted to /m);
  const named = await cli(dir, ['publish', 'apps/web/.tours/status-filter.tour.ts'], env);
  assert.match(named.out, /^Published apps\/web\/status-filter: /, named.out);
  assert.equal((await read()).posts, 1);
  await assert.rejects(access(join(dir, '.videos')), { code: 'ENOENT' });
});

test('check and run report type errors, a missing expect message among them, without recording anything', async () => {
  const { dir, tour, videos } = await withTour(
    `import { expect, test } from 'pro-tour';
test('Broken', async ({ page }) => {
  await test.step('Look', async () => {
    await expect(page.locator('h1')).toBeVisible();
    await page.getByRole('button').clik();
  });
});
`,
    'broken.tour.ts',
  );
  const checked = await cli(dir, ['check']);
  assert.equal(checked.code, 1);
  assert.match(
    checked.out,
    /\.tours\/broken\.tour\.ts\(4,11\): error TS2554: Expected 2 arguments, but got 1\.\n {2}expect needs a message as its second argument/,
  );
  assert.match(checked.out, /\.tours\/broken\.tour\.ts\(5,36\): error TS2551: Property 'clik' does not exist/);
  const ran = await cli(dir, ['run', tour, '--url', appUrl]);
  assert.equal(ran.code, 1);
  assert.match(ran.out, /Type errors, nothing recorded/);
  await assert.rejects(access(videos), { code: 'ENOENT' });
});

test('the sample tour type-checks', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../bin/pro-tour.js', import.meta.url)), 'check'], { encoding: 'utf8' });
});
