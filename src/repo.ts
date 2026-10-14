// Git and filesystem handling for the app repository a tour belongs to.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { access, appendFile, lstat, mkdir, readFile } from 'node:fs/promises';
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

// The app's code as a git tree id, leaving out every .tours/: of a commit, or of the working tree (untracked
// files included, ignored ones not). A recording shows the code it was made from only while this id is the same.
export function appTree(repo: string, commit?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pro-tour-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  // With sparse checkout on, git add skips files outside the sparse patterns even when they are on disk.
  const index = (args: string[], input?: string) => git(['-c', 'core.sparseCheckout=false', ...args], repo, env, input);
  try {
    if (commit) index(['read-tree', commit]);
    else {
      // A copy of the real index, so git add only rehashes the files that changed.
      const real = resolve(repo, git(['rev-parse', '--git-path', 'index'], repo).trim());
      if (existsSync(real)) {
        copyFileSync(real, env.GIT_INDEX_FILE);
        unmark(repo, index);
      }
      index(['add', '-A', '--', '.']);
    }
    index(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', TOURS]);
    return index(['write-tree']).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// git add trusts an index entry marked assume-unchanged or skip-worktree and never reads the file, so an edit
// to it would be missing from the tree. Clears both marks in the copy of the index, except skip-worktree on a
// file that is not on disk (outside a sparse checkout), which would otherwise read as deleted.
function unmark(repo: string, index: (args: string[], input?: string) => string): void {
  const assumed: string[] = [];
  const skipped: string[] = [];
  for (const entry of index(['ls-files', '-v', '-z']).split('\0')) {
    const [tag, path] = [entry[0], entry.slice(2)];
    if (!path) continue;
    if (/[a-z]/.test(tag)) assumed.push(path);
    if (/^[Ss]$/.test(tag) && existsSync(join(repo, path))) skipped.push(path);
  }
  // update-index applies only one of these options per call.
  if (assumed.length) index(['update-index', '-z', '--no-assume-unchanged', '--stdin'], assumed.join('\0'));
  if (skipped.length) index(['update-index', '-z', '--no-skip-worktree', '--stdin'], skipped.join('\0'));
}

// Submodules with uncommitted or untracked files. The app's tree holds only each submodule's commit, so it
// cannot show those changes, and publish refuses a recording made while there were any.
export function changedSubmodules(repo: string): string[] {
  const entries = git(['status', '--porcelain=v2', '-z', '--untracked-files=no', '--ignore-submodules=none'], repo).split('\0');
  const changed: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const fields = entries[i].split(' ');
    // A rename entry (2) is followed by its original path.
    if (fields[0] === '2') i++;
    if (['1', '2'].includes(fields[0]) && /^S.(M.|.U)$/.test(fields[2] ?? ''))
      changed.push(fields.slice(fields[0] === '1' ? 8 : 9).join(' '));
  }
  return changed;
}

// A file's git blob id as git would commit it (line endings normalized), so it compares with HEAD:<path>.
export const blobId = (repo: string, file: string) => git(['hash-object', '--', file], repo).trim();

// Every tour in the repository, committed or not (ignored files aside).
export const allTours = (repo: string) =>
  git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', TOURS], repo)
    .split('\0')
    .filter(isTourFile)
    .map(file => join(repo, file));

// Tours a pull request adds or changes: committed .tour.{ts,js} files in a .tours/ that differ from its base.
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
  return git(['diff', '-z', '--name-only', '--diff-filter=d', `${ref}...HEAD`, '--', TOURS], repo)
    .split('\0')
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
