// Git and filesystem handling for the app repository a tour belongs to.
import { execFileSync } from 'node:child_process';
import { appendFile, lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class TourError extends Error {}

/** Tours are `.tour.ts` (type-checked) or `.tour.js` files. */
export const isTourFile = (path: string) => /\.tour\.[jt]s$/.test(path);
export const tourName = (path: string) => (path.split('/').at(-1) ?? path).replace(/\.tour\.[jt]s$/, '');

export function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const failure = error as { stderr?: string; message: string };
    throw new TourError(`git ${args.join(' ')} failed: ${failure.stderr?.trim() || failure.message}`);
  }
}

export function repoRoot(cwd: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd).trim();
}

// CI checkouts of a pull request are detached; GitHub Actions names the branch in the environment.
export function currentBranch(repo: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.GITHUB_HEAD_REF) return env.GITHUB_HEAD_REF;
  try {
    return git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo).trim();
  } catch {
    throw new TourError('HEAD is detached; check out the pull request branch, or pass --pr and tour names.');
  }
}

// Tours a pull request adds or changes: committed .tours/*.tour.{ts,js} files that differ from its base.
export function changedTours(repo: string, base: string): { tours: string[]; uncommitted: string[] } {
  const ref = [`origin/${base}`, base].find(candidate => {
    try {
      git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], repo);
      return true;
    } catch {
      return false;
    }
  });
  if (!ref) throw new TourError(`The PR base ${base} is not available locally; run git fetch origin ${base}, or name the tours to publish.`);
  const committed = git(['diff', '--name-only', '--diff-filter=d', `${ref}...HEAD`, '--', '.tours'], repo).split('\n').filter(isTourFile);
  const uncommitted = git(['status', '--porcelain', '--', '.tours'], repo).split('\n').filter(line => isTourFile(line.trim()));
  return { tours: committed.map(file => join(repo, file)), uncommitted: uncommitted.map(line => line.slice(3).trim()) };
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
