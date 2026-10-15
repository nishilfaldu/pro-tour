// Git and filesystem handling for the app repository a tour belongs to.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { access, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

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

// Tours live in a .tours/ directory: at the repository root, or in each app's package in a monorepo.
const TOURS = ':(glob)**/.tours/**';

// A file's path in the repository, with forward slashes as git writes it.
export function repoPath(repo: string, file: string): string {
  // Either may have been named through a symlink, such as /tmp on macOS.
  const real = (path: string) => (existsSync(path) ? realpathSync(path) : path);
  const path = relative(real(repo), real(file));
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new TourError(`${file} is not in the repository at ${repo}`);
  return path.split(sep).join('/');
}

/**
 * A tour's name, unique in the repository: its path without `.tours/` and the extension, so
 * `.tours/login.tour.ts` is `login` and `apps/web/.tours/login.tour.ts` is `apps/web/login`.
 * It names the tour's recording in .videos/ and its comments on the PR.
 */
export const tourName = (repo: string, file: string) =>
  repoPath(repo, file)
    .split('/')
    .filter(part => part !== '.tours')
    .join('/')
    .replace(/\.tour\.[jt]s$/, '');

export function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv, input?: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      env,
      input,
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
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

// HEAD, or null in a repository without commits.
export function headCommit(repo: string): string | null {
  try {
    return git(['rev-parse', '--verify', '--quiet', 'HEAD'], repo).trim();
  } catch {
    return null;
  }
}

// Whether anything outside .tours/ differs from HEAD, untracked files included: a recording made then shows
// code that is not committed.
export const hasChanges = (repo: string) =>
  git(['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude,glob)**/.tours/**'], repo).trim().length > 0;

// The tree a commit of everything in the working copy would have: uncommitted and untracked files in, ignored
// files out. Built in a copy of the index, so the real one is untouched. Null if git cannot make it.
export function workingTree(repo: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'pro-tour-index-'));
  try {
    const index = join(dir, 'index');
    // The copy keeps the index's file stats, so git hashes only what changed.
    const own = resolve(repo, git(['rev-parse', '--git-path', 'index'], repo).trim());
    if (existsSync(own)) copyFileSync(own, index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(['add', '--all', '--', '.'], repo, env);
    return git(['write-tree'], repo, env).trim();
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Whether two commits or trees hold the same code outside .tours/: true, false, or null when git cannot tell
// (one of them is not in this checkout).
export function sameCode(repo: string, from: string, to: string): boolean | null {
  const diff = spawnSync('git', ['diff', '--quiet', from, to, '--', '.', ':(exclude,glob)**/.tours/**'], { cwd: repo });
  return diff.status === 0 ? true : diff.status === 1 ? false : null;
}

// Whether the commit is in this checkout.
export const hasCommit = (repo: string, commit: string) =>
  spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: repo }).status === 0;

// Every tour in the repository, committed or not (ignored files aside).
export const allTours = (repo: string) =>
  git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', TOURS], repo)
    .split('\0')
    .filter(isTourFile)
    .map(file => join(repo, file));

// Recordings go in .videos/ at the repository root, which ignores itself: git never sees it, the app's own
// .gitignore is left alone, and deleting the folder removes every trace of pro-tour.
export async function videosDir(repo: string): Promise<string> {
  const dir = join(repo, '.videos');
  const info = await lstat(dir).catch(() => null);
  if (info?.isSymbolicLink()) throw new TourError(`${dir} must not be a symlink`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, '.gitignore'), '*\n');
  return dir;
}

// Every recording in .videos/, by tour name.
export async function recordings(repo: string): Promise<string[]> {
  const dir = join(repo, '.videos');
  const entries = await readdir(dir, { recursive: true }).catch(() => [] as string[]);
  return entries
    .filter(entry => entry.endsWith('.mp4') && !entry.split(sep).some(part => part.startsWith('.')))
    .map(entry =>
      entry
        .split(sep)
        .join('/')
        .replace(/\.mp4$/, ''),
    )
    .sort();
}

// Removes .videos/ once it holds nothing but its own .gitignore.
export async function removeVideosDirIfEmpty(repo: string): Promise<void> {
  const dir = join(repo, '.videos');
  const entries = await readdir(dir).catch(() => null);
  if (entries?.every(entry => entry === '.gitignore')) await rm(dir, { recursive: true, force: true });
}
