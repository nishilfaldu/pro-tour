import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// The published package runs from dist/, not src/: check what the build emits.
test('the build ships the overlay unchanged, .js imports in declarations, and a working CLI', () => {
  execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'pipe' });
  // The overlay is injected as a classic script; a module (`export {}`) would never run in the page.
  assert.equal(readFileSync('dist/overlay.js', 'utf8'), readFileSync('src/overlay.js', 'utf8'));
  for (const file of readdirSync('dist').filter(name => name.endsWith('.d.ts'))) {
    assert.doesNotMatch(readFileSync(`dist/${file}`, 'utf8'), /from '\.\.?\/[^']+\.ts'/, file);
  }
  const help = "import('./dist/cli.js').then(cli => cli.main(['--help']))";
  assert.match(execFileSync(process.execPath, ['--input-type=module', '-e', help], { encoding: 'utf8' }), /pro-tour check/);
});
