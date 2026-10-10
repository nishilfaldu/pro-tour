import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { load, runAgent, totals } from './agent.js';
import { listBehaviors, prContext, writeTour } from './planner.js';
import { baseFromEnvironment, branchDiff, currentBranch, defaultBase, repoRoot, sanitizedBranch, TourError, videosDir } from './repo.js';
import { recordTour } from './runtime.js';

const USAGE = `Usage:
  pro-tour tour --url <app url> [--tour <file.tour.js>] [--base <ref> | --diff <file>] [--src <dir>]
                [--model <m>] [--effort <e>] [--rounds 3] [--replan] [--out <dir>] [--channel chromium|chrome]
      Replay the branch's saved tour, or plan, record and repair one with the model.
  pro-tour run <file.tour.js> --url <app url> [--out <dir>] [--channel chromium|chrome]
      Record a saved tour with no model.

Defaults: --tour .tours/<branch>.tour.js, --src the repository root, --out .videos/,
--base $GITHUB_BASE_REF or origin/HEAD, --model $PRO_TOUR_MODEL or gpt-6-sol, --effort $PRO_TOUR_EFFORT or high.`;

const COMMON = {
  url: { type: 'string' }, out: { type: 'string' }, channel: { type: 'string', default: process.env.PRO_TOUR_BROWSER || 'chromium' },
  help: { type: 'boolean', short: 'h' },
};

function appUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TourError('--url must be an http(s) URL of the running app');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TourError('--url must be an http(s) URL of the running app');
  if (url.username || url.password) throw new TourError('--url must not contain credentials');
  return url.href;
}

function printReport(report) {
  console.log(`${report.status.toUpperCase()}: ${report.video} (${report.seconds}s)`);
  for (const step of report.steps) console.log(`  ${step.status === 'passed' ? '✓' : '✗'} ${step.title}`);
  for (const behavior of report.coverage ?? []) if (!behavior.steps.length) console.log(`  ✗ not shown: ${behavior.description}`);
  if (report.error) console.log(`  ${report.error}`);
}

async function run(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: COMMON });
  if (values.help || positionals.length !== 1 || !values.url) return usage(values.help);
  const file = resolve(positionals[0]);
  const outDir = values.out ? resolve(values.out) : await videosDir(repoRoot(dirname(file)));
  const report = await recordTour(await load(file), { url: appUrl(values.url), outDir, name: basename(file, '.tour.js'), channel: values.channel });
  printReport(report);
  return report.status === 'passed' ? 0 : 1;
}

async function tour(argv) {
  const { values } = parseArgs({ args: argv, options: {
    ...COMMON, tour: { type: 'string' }, base: { type: 'string' }, diff: { type: 'string' }, src: { type: 'string' },
    model: { type: 'string', default: process.env.PRO_TOUR_MODEL || 'gpt-6-sol' },
    effort: { type: 'string', default: process.env.PRO_TOUR_EFFORT || 'high' },
    rounds: { type: 'string', default: '3' }, replan: { type: 'boolean', default: false }, log: { type: 'string' },
  } });
  if (values.help || !values.url) return usage(values.help);
  const url = appUrl(values.url);
  const repo = repoRoot(process.cwd());
  const tourPath = resolve(values.tour ?? join(repo, '.tours', `${sanitizedBranch(currentBranch(repo))}.tour.js`));
  const name = basename(tourPath, '.tour.js');
  const outDir = values.out ? resolve(values.out) : await videosDir(repo);
  const src = resolve(values.src ?? repo);
  const options = { model: values.model, effort: values.effort || undefined };

  // The diff is only computed when the model is needed, so replaying a saved tour works without a base ref.
  let context;
  const planContext = async () => {
    if (context) return context;
    let diff;
    let changed = [];
    if (values.diff) diff = await readFile(values.diff, 'utf8');
    else ({ diff, files: changed } = branchDiff(repo, values.base ?? baseFromEnvironment(repo) ?? defaultBase(repo)));
    context = await prContext({ diff, src, changed: changed.map(file => join(repo, file)) });
    return context;
  };
  const planner = {
    listBehaviors: async () => listBehaviors(await planContext(), options),
    writeTour: async (behaviors, repair) => writeTour(await planContext(), behaviors, repair, options),
  };

  const started = Date.now();
  const result = await runAgent({
    tourPath,
    rounds: Number(values.rounds),
    replan: values.replan,
    planner,
    record: (tourModule, tourName) => recordTour(tourModule, { url, outDir, name: tourName, channel: values.channel }),
    log: item => console.log(`${item.kind.padEnd(9)} ${item.status ?? ''}${item.seconds ? ` (${item.seconds}s model)` : ''}`
      + `${item.video ? ` ${basename(item.video)}` : ''}${item.error ? `\n          ${item.error.slice(0, 200)}` : ''}`),
  });
  const summary = { tour: tourPath, model: values.model, effort: options.effort ?? null, status: result.status,
    video: result.report?.video ?? null, seconds: Math.round((Date.now() - started) / 1000), ...totals(result.history), history: result.history };
  const logPath = resolve(values.log ?? join(outDir, `${name}-agent.json`));
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(summary, null, 2) + '\n');
  if (result.report?.steps) printReport(result.report);
  console.log(`${result.status === 'passed' ? `Tour saved: ${tourPath}` : 'No passing tour; the saved tour was left unchanged'}`
    + ` · ${summary.modelCalls} model calls, ${summary.repairs} repairs, ${summary.seconds}s · log ${logPath}`);
  return result.status === 'passed' ? 0 : 1;
}

function usage(asked) {
  (asked ? console.log : console.error)(USAGE);
  return asked ? 0 : 2;
}

const COMMANDS = { tour, run };

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!COMMANDS[command]) return usage(['-h', '--help', 'help'].includes(command));
  try {
    return await COMMANDS[command](rest);
  } catch (error) {
    if (!(error instanceof TourError) && error?.code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw error;
    console.error(`pro-tour: ${error.message}`);
    return 2;
  }
}
