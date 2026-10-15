import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// An installed package runs from dist/, not src/: check what the build emits.
test('the build ships the overlay unchanged, the config and resolve hook, .js imports in declarations, and a working CLI', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'pipe' });
  // The overlay is injected as a classic script; a module (`export {}`) would never run in the page.
  assert.equal(readFileSync('dist/overlay.js', 'utf8'), readFileSync('src/overlay.js', 'utf8'));
  // pro-tour run hands Playwright these two by path.
  for (const file of ['config.js', 'resolve.js']) assert.ok(readdirSync('dist').includes(file), file);
  for (const file of readdirSync('dist').filter(name => name.endsWith('.d.ts'))) {
    assert.doesNotMatch(readFileSync(`dist/${file}`, 'utf8'), /from '\.\.?\/[^']+\.ts'/, file);
  }
  const help = "import('./dist/cli.js').then(cli => cli.main(['--help']))";
  assert.match(execFileSync(process.execPath, ['--input-type=module', '-e', help], { encoding: 'utf8' }), /pro-tour run/);
});

// dist/ is committed, so an install from GitHub has nothing to build: it must be the build of src/. Read before
// any test here rebuilds it; in CI, it is the committed dist/.
const dist = () => Object.fromEntries(readdirSync('dist').map(file => [file, readFileSync(`dist/${file}`, 'utf8')]));
const before = dist();

test('dist/ is the build of src/', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'pipe' });
  assert.deepEqual(before, dist(), 'dist/ is not the build of src/: run pnpm build and commit dist/');
});

// The README and the website's setup install the release package.json names.
test('the install commands name the current version', () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const file of ['README.md', 'site/index.html']) {
    const tags = readFileSync(file, 'utf8').match(/github:nishilfaldu\/pro-tour#v[\w.-]+/g) ?? [];
    assert.ok(tags.length, `${file} has no install command with a version`);
    for (const tag of tags) assert.equal(tag, `github:nishilfaldu/pro-tour#v${version}`, file);
  }
});
