// `pro-tour init`: install the pro-tour skill for coding agents in an app repository.
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videosDir } from './repo.js';

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'skill', 'SKILL.md');

// Codex and Cursor read .agents/skills; Claude Code reads .claude/skills (and Cursor reads both).
export const SKILL_DIRS = ['.agents/skills/pro-tour', '.claude/skills/pro-tour'];

// Skills load when the agent judges them relevant; this line in the instruction files makes it reliable.
export const POINTER = `## Feature tours

After a change that users can see or do in the app, before opening or updating its pull request, use the
\`pro-tour\` skill to record a feature tour and attach it to the pull request.
`;

const exists = path => access(path).then(() => true, () => false);

export async function packageRunner(repo) {
  if (await exists(join(repo, 'pnpm-lock.yaml'))) return 'pnpm exec';
  if (await exists(join(repo, 'yarn.lock'))) return 'yarn';
  if (await exists(join(repo, 'bun.lockb')) || await exists(join(repo, 'bun.lock'))) return 'bunx';
  return 'npx';
}

// Idempotent: rewrites the skill copies (so upgrades refresh them) and adds the pointer only once.
export async function init(repo, { runner } = {}) {
  runner ??= await packageRunner(repo);
  const skill = (await readFile(TEMPLATE, 'utf8')).replaceAll('{{run}}', runner);
  const changes = [];
  for (const dir of SKILL_DIRS) {
    const file = join(repo, dir, 'SKILL.md');
    const before = await readFile(file, 'utf8').catch(() => null);
    if (before === skill) continue;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, skill);
    changes.push(`${before === null ? 'wrote' : 'updated'} ${join(dir, 'SKILL.md')}`);
  }
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(repo, name);
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text?.includes('`pro-tour` skill')) continue;
    if (text === null) await writeFile(file, POINTER);
    else await appendFile(file, `${text.endsWith('\n') ? '' : '\n'}\n${POINTER}`);
    changes.push(`${text === null ? 'created' : 'added a Feature tours section to'} ${name}`);
  }
  await videosDir(repo);
  return { runner, changes };
}
