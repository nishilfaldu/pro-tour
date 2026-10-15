// `pro-tour init`: point the app repository's agent instructions at pro-tour's docs.
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = join('docs', 'feature-tours.md');
// docs/ sits beside src/ and dist/ at the package root.
const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
// Earlier versions installed a skill; its copies would teach the old tour API.
const OLD_SKILLS = ['.agents/skills/pro-tour', '.claude/skills/pro-tour'];

// The docs as the agent finds them: through node_modules (a symlink under pnpm), so the path survives upgrades.
function docsPath(repo: string, cwd: string): string {
  for (let dir = cwd; dir.startsWith(repo); dir = dirname(dir)) {
    const installed = join(dir, 'node_modules', 'pro-tour', DOCS);
    if (existsSync(installed)) return relative(repo, installed).split(sep).join('/');
    if (dir === repo) break;
  }
  const own = join(PACKAGE, DOCS);
  return own.startsWith(`${repo}${sep}`) ? relative(repo, own).split(sep).join('/') : own;
}

const section = (docs: string) => `## Feature tours

After changing something users can see in the app, or when asked for a feature tour, read \`${docs}\` and follow it.
`;

// Replaces the "## Feature tours" section, up to the next heading of its level, or adds it at the end. An empty
// body removes the section.
function withSection(text: string | null, body: string): string | null {
  if (text === null) return body || null;
  const start = text.search(/^## Feature tours\s*$/m);
  if (start < 0) return body ? `${text}${text.endsWith('\n') ? '' : '\n'}\n${body}` : text;
  const next = text.slice(start + 1).search(/^## /m);
  const end = next < 0 ? text.length : start + 1 + next;
  if (!body) return `${text.slice(0, start).replace(/\n+$/, '\n')}${next < 0 ? '' : `\n${text.slice(end)}`}`;
  return `${text.slice(0, start)}${body}${next < 0 ? '' : '\n'}${text.slice(end)}`;
}

// A CLAUDE.md that imports AGENTS.md (a line `@AGENTS.md`) already gives Claude its section.
const importsAgents = (text: string | null) => text !== null && /^@(\.\/)?AGENTS\.md\s*$/m.test(text);

export interface InitResult {
  /** What was written or removed. */
  changes: string[];
  /** What was left alone on purpose, and why. */
  notes: string[];
}

// Idempotent: run it again after an upgrade and only what changed is rewritten.
export async function init(repo: string, cwd = repo): Promise<InitResult> {
  const body = section(docsPath(repo, cwd));
  const changes: string[] = [];
  const notes: string[] = [];
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(repo, name);
    const text = await readFile(file, 'utf8').catch(() => null);
    const imports = name === 'CLAUDE.md' && importsAgents(text);
    if (imports) notes.push('CLAUDE.md imports AGENTS.md, so only AGENTS.md has the Feature tours section.');
    const next = withSection(text, imports ? '' : body);
    if (next === text || next === null) continue;
    await writeFile(file, next);
    changes.push(`${text === null ? 'created' : imports ? 'removed the Feature tours section from' : 'updated'} ${name}`);
  }
  for (const dir of OLD_SKILLS) {
    if (!existsSync(join(repo, dir))) continue;
    await rm(join(repo, dir), { recursive: true, force: true });
    changes.push(`removed the old skill in ${dir}`);
  }
  return { changes, notes };
}
