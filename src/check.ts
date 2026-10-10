// `pro-tour check`: type-check .tour.ts files with the TypeScript compiler pro-tour ships, in about a
// second and without recording, so a misused API is caught before a 30-second run.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// `import type { Tour } from 'pro-tour'` resolves to this package's own types, whether or not the app
// repository installed pro-tour: index.d.ts beside the built module, or index.ts when run from source.
// From source, those types include pro-tour's own .ts files, which need Node's types.
function typesOptions(): Record<string, unknown> {
  const built = fileURLToPath(new URL('./index.d.ts', import.meta.url));
  if (existsSync(built)) return { types: [], paths: { 'pro-tour': [built] } };
  return {
    types: ['node'],
    typeRoots: [fileURLToPath(new URL('../node_modules/@types', import.meta.url))],
    paths: { 'pro-tour': [fileURLToPath(new URL('./index.ts', import.meta.url))] },
  };
}

export interface CheckResult {
  ok: boolean;
  /** Compiler errors, with paths relative to cwd. */
  output: string;
  checked: string[];
}

export async function checkTours(files: string[], cwd = process.cwd()): Promise<CheckResult> {
  const checked = files.filter(file => file.endsWith('.ts'));
  if (!checked.length) return { ok: true, output: '', checked };
  const work = await mkdtemp(join(tmpdir(), 'pro-tour-check-'));
  try {
    const config = join(work, 'tsconfig.json');
    await writeFile(config, JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2023',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        allowImportingTsExtensions: true,
        skipLibCheck: true,
        ...typesOptions(),
      },
      files: checked,
    }));
    const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
    const result = spawnSync(process.execPath, [tsc, '-p', config, '--pretty', 'false'], { cwd, encoding: 'utf8' });
    const output = `${result.stdout}${result.stderr}`.trim().split('\n')
      .map(line => line.replace(/^(\/[^(]+)(\(\d+,\d+\))/, (_, path, at) => `${relative(cwd, path)}${at}`)).join('\n');
    return { ok: result.status === 0, output, checked };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
