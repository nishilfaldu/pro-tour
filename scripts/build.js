// Build dist/: compile src/ with tsc, then point the declaration files' relative imports at .js, since
// tsc rewrites .ts specifiers in the JavaScript it emits but not in .d.ts files. The overlay is copied
// as is: it is injected into the page as a classic script, and tsc would turn it into a module.
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc');
rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });
for (const file of readdirSync('dist').filter(name => name.endsWith('.d.ts'))) {
  const path = join('dist', file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/(from '\.\.?\/[^']+)\.ts'/g, "$1.js'"));
}
copyFileSync('src/overlay.js', 'dist/overlay.js');
