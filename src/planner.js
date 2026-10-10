// Model calls for tour planning: list a PR's behaviors, then write or repair a *.tour.js.
// The planner never sees the live page up front: it gets the diff, the app source and the tour API,
// and on repair the failure message plus the visible DOM at the failure.
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { isSafePath } from './repo.js';
import { fileURLToPath } from 'node:url';

const API = join(dirname(fileURLToPath(import.meta.url)), 'tour-api.md');
const SOURCE = ['.html', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.videos', '.tours', 'coverage']);
const MAX_SOURCE_CHARS = 250_000;
const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

const fence = (name, body) => `--- ${name} ---\n${body.trimEnd()}\n--- end ${name} ---`;

async function sourceFiles(root, dir = root) {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    const rel = relative(root, path);
    if (!isSafePath(rel)) continue;
    if (entry.isDirectory() && !SKIP.has(entry.name)) files.push(...await sourceFiles(root, path));
    else if (entry.isFile() && SOURCE.includes(extname(entry.name)) && !/\.(tour|test|spec)\.[jt]sx?$/.test(entry.name)) files.push(rel);
  }
  return files;
}

// Relative imports of one file, resolved against the known source files.
function imports(file, body, known) {
  const found = [];
  for (const [, spec] of body.matchAll(IMPORT)) {
    const base = normalize(join(dirname(file), spec));
    const candidates = [base, ...SOURCE.map(ext => base + ext), ...SOURCE.map(ext => join(base, `index${ext}`))];
    const hit = candidates.find(candidate => known.has(candidate));
    if (hit) found.push(hit);
  }
  return found;
}

// The planner's view of the PR: the diff plus app source under `src`. When all of it fits the budget it is
// sent whole; otherwise the files the PR changed come first, then the files they import and that import them.
export async function prContext({ diff, src, changed = [] }) {
  const files = await sourceFiles(src);
  const bodies = new Map(await Promise.all(files.map(async file => [file, await readFile(join(src, file), 'utf8')])));
  const total = [...bodies.values()].reduce((sum, body) => sum + body.length, 0);
  let chosen = files;
  let note = 'App source after the PR:';
  if (total > MAX_SOURCE_CHARS) {
    const known = new Set(files);
    const touched = changed.map(file => relative(src, resolve(src, file))).filter(file => known.has(file));
    const importedBy = new Map(files.map(file => [file, []]));
    for (const file of files) for (const target of imports(file, bodies.get(file), known)) importedBy.get(target).push(file);
    const ordered = [...new Set([
      ...touched,
      ...touched.flatMap(file => imports(file, bodies.get(file), known)),
      ...touched.flatMap(file => importedBy.get(file)),
    ])];
    chosen = [];
    let used = 0;
    for (const file of ordered) {
      if (used + bodies.get(file).length > MAX_SOURCE_CHARS) continue;
      chosen.push(file);
      used += bodies.get(file).length;
    }
    if (!chosen.length) throw new Error(`The app source under ${src} is ${total} chars and none of the PR's changed source files fit in ${MAX_SOURCE_CHARS}.`);
    note = `App source after the PR: the ${chosen.length} files the PR changed and their direct import neighbors (the whole app is ${files.length} files).`;
  }
  return [fence('PR diff', diff), note, ...chosen.map(file => fence(file, bodies.get(file)))];
}

// One structured call through `codex exec`, isolated in an empty read-only directory.
export async function ask(parts, schema, { model, effort }) {
  const work = await mkdtemp(join(tmpdir(), 'tour-plan-'));
  try {
    await writeFile(join(work, 'schema.json'), JSON.stringify(schema));
    const args = ['exec', '-m', model, ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
      '-s', 'read-only', '-C', work, '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--json',
      '--output-schema', join(work, 'schema.json'), '-o', join(work, 'last.json'), '-'];
    const started = Date.now();
    const { code, stdout, stderr } = await new Promise((resolve, reject) => {
      const child = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, stdout, stderr }));
      child.stdin.end(parts.join('\n\n'));
    });
    if (code !== 0) throw new Error(`codex exec failed (${code}): ${stderr.slice(-2000)}`);
    const usage = { input: 0, cached: 0, output: 0, reasoning: 0 };
    for (const line of stdout.split('\n')) {
      if (!line.includes('"turn.completed"')) continue;
      const turn = JSON.parse(line).usage ?? {};
      usage.input += turn.input_tokens ?? 0;
      usage.cached += turn.cached_input_tokens ?? 0;
      usage.output += turn.output_tokens ?? 0;
      usage.reasoning += turn.reasoning_output_tokens ?? 0;
    }
    const answer = JSON.parse(await readFile(join(work, 'last.json'), 'utf8'));
    return { answer, usage, seconds: Math.round((Date.now() - started) / 100) / 10 };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const PREAMBLE = [
  'You are preparing a feature tour: a short captioned video that shows PR reviewers what a change does.',
  'Do not run commands or read files. Everything you have is below. Reply with JSON only.',
];

export async function listBehaviors(context, options) {
  const result = await ask([
    ...PREAMBLE,
    'List the user-visible behaviors this PR adds or changes: each thing a reviewer would want to see working in the video.'
      + ' Each item is one observable outcome that a single tour step can show; do not bundle outcomes'
      + ' (for example, searching a list and filtering by a choice are two items). Include new states the change introduces,'
      + ' such as empty states or reset controls. Leave out behavior the app already had before the PR.'
      + ' Only list behaviors a user can reach in the running app starting from its seed data. Use 2 to 6 items.',
    ...context,
  ], {
    type: 'object',
    additionalProperties: false,
    required: ['behaviors'],
    properties: { behaviors: { type: 'array', items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'description'],
      properties: {
        id: { type: 'string', description: 'Short kebab-case id.' },
        description: { type: 'string', description: 'One sentence, as a reviewer reads it in a checklist.' },
      },
    } } },
  }, options);
  return { ...result, behaviors: Object.fromEntries(result.answer.behaviors.map(behavior => [behavior.id, behavior.description])) };
}

// Write a tour for `behaviors`, or repair `previous` given the failed run's report.
export async function writeTour(context, behaviors, { previous, report } = {}, options) {
  const parts = [
    ...PREAMBLE,
    'Write the tour: a Playwright script in the tour API below. It must demonstrate every behavior listed here.'
      + ' Set meta.behaviors to exactly this object, and mark the step that shows each one with { covers: [...] }.',
    fence('behaviors', JSON.stringify(behaviors, null, 2)),
    fence('tour API', await readFile(API, 'utf8')),
    ...context,
  ];
  if (previous) {
    parts.push(
      'Your previous tour failed. Fix it and return the complete corrected module.',
      fence('previous tour', previous),
      fence('failure', report.failure?.message ?? report.error),
    );
    if (report.failure?.dom) parts.push(fence('visible DOM of the page at the failure', report.failure.dom));
  }
  const result = await ask(parts, {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'notes'],
    properties: {
      source: { type: 'string', description: 'The complete ES module: export const meta and export async function run(t).' },
      notes: { type: 'string', description: 'One or two sentences on locator choices and assumptions.' },
    },
  }, options);
  return { ...result, source: result.answer.source.trimEnd() + '\n', notes: result.answer.notes };
}

export async function exists(path) {
  return stat(path).then(() => true, () => false);
}
