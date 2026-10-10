// Git and filesystem handling for the app repository a tour belongs to.
import { execFileSync } from 'node:child_process';
import { appendFile, lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class TourError extends Error {}

export function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new TourError(`git ${args.join(' ')} failed: ${error.stderr?.trim() || error.message}`);
  }
}

export function repoRoot(cwd) {
  return git(['rev-parse', '--show-toplevel'], cwd).trim();
}

// CI checkouts of a pull request are detached; GitHub Actions names the branch in the environment.
export function currentBranch(repo, env = process.env) {
  if (env.GITHUB_HEAD_REF) return env.GITHUB_HEAD_REF;
  try {
    return git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo).trim();
  } catch {
    throw new TourError('HEAD is detached; check out a branch or pass --tour <path>.');
  }
}

export function sanitizedBranch(branch) {
  return branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 120) || 'branch';
}

const UNSAFE_PARTS = new Set(['.videos', '.git', 'node_modules', '.npmrc', '.netrc', 'auth.json', '.ssh', '.aws', '.kube', 'id_rsa', 'id_ed25519']);

// Never put credentials, lockfiles or recordings into a model prompt.
export function isSafePath(path) {
  return !path.split('/').some(part => part.startsWith('.env') || UNSAFE_PARTS.has(part)
    || /(credential|secret|token|\.pem$|\.key$|lock\.)/i.test(part));
}

export function baseFromEnvironment(repo, env = process.env) {
  if (!env.GITHUB_BASE_REF) return null;
  const base = `origin/${env.GITHUB_BASE_REF}`;
  verifyCommit(repo, base);
  return base;
}

export function defaultBase(repo) {
  try {
    return git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], repo).trim().replace(/^refs\/remotes\//, '');
  } catch {
    throw new TourError('Cannot infer the base: no origin/HEAD. Pass --base <ref>.');
  }
}

function verifyCommit(repo, ref) {
  if (ref.startsWith('-')) throw new TourError('Invalid base ref');
  try {
    git(['rev-parse', '--verify', `${ref}^{commit}`], repo);
  } catch {
    throw new TourError(`Base ${ref} is not available locally. Fetch it (for CI, use actions/checkout with fetch-depth: 0) or pass --base.`);
  }
}

const MAX_DIFF_CHARS = 100_000;

export function branchDiff(repo, base) {
  verifyCommit(repo, base);
  const files = git(['diff', '--name-only', '-z', `${base}...HEAD`, '--'], repo).split('\0').filter(Boolean);
  const safe = files.filter(isSafePath);
  const diff = safe.length ? git(['diff', '--no-ext-diff', '--no-textconv', '--unified=3', `${base}...HEAD`, '--', ...safe], repo) : '';
  if (!diff.trim()) throw new TourError(`No committed changes between ${base} and HEAD to tour.`);
  if (diff.length > MAX_DIFF_CHARS) throw new TourError(`Diff exceeds ${MAX_DIFF_CHARS / 1000} KB; use a closer base ref.`);
  return { diff, files: safe };
}

// Recordings go in an ignored .videos/ directory at the repository root.
export async function videosDir(repo) {
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
