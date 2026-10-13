// Git and filesystem handling for the app repository a tour belongs to.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { access, appendFile, lstat, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export class TourError extends Error {}

export const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
export const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Tours are `.tour.ts` (type-checked) or `.tour.js` files. */
export const isTourFile = (path: string) => /\.tour\.[jt]s$/.test(path);
export const tourName = (path: string) => (path.split('/').at(-1) ?? path).replace(/\.tour\.[jt]s$/, '');

export function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  try {
    return execFileSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const failure = error as { stderr?: string; message: string };
    throw new TourError(`git ${args.join(' ')} failed: ${failure.stderr?.trim() || failure.message}`);
  }
}

export function repoRoot(cwd: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd).trim();
}

export function currentBranch(repo: string): string {
  try {
    return git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo).trim();
  } catch {
    throw new TourError('HEAD is detached; check out the pull request branch, or pass --pr and tour names.');
  }
}

// The app's code as a git tree id, leaving out .tours/: of a commit, or of the working tree (untracked files
// included, ignored ones not). A recording shows the code it was made from only while this id is the same.
export function appTree(repo: string, commit?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pro-tour-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  try {
    if (commit) git(['read-tree', commit], repo, env);
    else {
      // A copy of the real index, so git add only rehashes the files that changed.
      const index = resolve(repo, git(['rev-parse', '--git-path', 'index'], repo).trim());
      if (existsSync(index)) copyFileSync(index, env.GIT_INDEX_FILE);
      git(['add', '-A', '--', '.'], repo, env);
    }
    git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', '.tours'], repo, env);
    return git(['write-tree'], repo, env).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Tours a pull request adds or changes: committed .tours/*.tour.{ts,js} files that differ from its base.
export function changedTours(repo: string, base: string): string[] {
  const ref = [`origin/${base}`, base].find(candidate => {
    try {
      git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], repo);
      return true;
    } catch {
      return false;
    }
  });
  if (!ref)
    throw new TourError(`The PR base ${base} is not available locally; run git fetch origin ${base}, or name the tours to publish.`);
  return git(['diff', '--name-only', '--diff-filter=d', `${ref}...HEAD`, '--', '.tours'], repo)
    .split('\n')
    .filter(isTourFile)
    .map(file => join(repo, file));
}

// Recordings go in an ignored .videos/ directory at the repository root.
export async function videosDir(repo: string): Promise<string> {
  const ignore = join(repo, '.gitignore');
  const dir = join(repo, '.videos');
  for (const path of [ignore, dir]) {
    const info = await lstat(path).catch(() => null);
    if (info?.isSymbolicLink()) throw new TourError(`${path} must not be a symlink`);
  }
  const text = await readFile(ignore, 'utf8').catch(() => '');
  if (!text.split('\n').some(line => ['.videos/', '/.videos/', '.videos', '/.videos'].includes(line.trim()))) {
    await appendFile(ignore, `${text && !text.endsWith('\n') ? '\n' : ''}.videos/\n`);
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
