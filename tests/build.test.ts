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

// dist/ is committed, so an install from GitHub has nothing to build. It must be the build of src/ as committed.
test('the committed dist/ is the build of src/', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'pipe' });
  const changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'dist'], { encoding: 'utf8' });
  assert.equal(changed, '', `Run pnpm build and commit dist/:\n${changed}`);
});
