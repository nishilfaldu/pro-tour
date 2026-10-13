import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { checkTours } from './check.ts';
import { doctor } from './doctor.ts';
import { init } from './init.ts';
import { publishTours, resolvePr } from './publish.ts';
import {
  appTree,
  changedTours,
  currentBranch,
  exists,
  isTourFile,
  message,
  repoRoot,
  sha,
  TourError,
  tourName,
  videosDir,
} from './repo.ts';
import { recordTour } from './runtime.ts';
import type { Report, TourModule } from './types.ts';

// docs/ sits beside src/ and dist/ at the package root.
const API = new URL('../docs/tour-api.md', import.meta.url);

const USAGE = `Usage:
  pro-tour check [<file.tour.ts>...]
      Type-check tours (default: every tour in .tours/) without recording.
  pro-tour run <file.tour.ts>... --url <app url> [--json] [--channel chromium|chrome]
      Type-check, then record tours into .videos/. On failure, prints the file with the error and the page's
      visible DOM.
  pro-tour publish [<tour>...] [--pr <number|url>] [--dry-run]
      Comment on the pull request with each tour's video and behavior checklist. Without tour names, publishes
      the tours the pull request adds or changes. Refuses a recording that failed or does not show the code at
      the pull request's head. Deletes the local recordings once they are on the PR.
  pro-tour init
      Install the pro-tour skill for coding agents (.agents/skills, .claude/skills) and point AGENTS.md
      and CLAUDE.md at it.
  pro-tour api
      Print the tour API.
  pro-tour doctor
      Check the browser, ffmpeg and GitHub CLI, printing the command that fixes each problem.

Exit codes: 0 passed, 1 a tour failed, 2 usage or setup error, 3 recording failed (app unreachable, browser or encoder).`;

function appUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TourError('--url must be an http(s) URL of the running app');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TourError('--url must be an http(s) URL of the running app');
  if (url.username || url.password) throw new TourError('--url must not contain credentials');
  return url.href;
}

// Fresh import every time: a tour edited between runs in one process must not come from the module cache.
async function loadTour(file: string): Promise<{ tour?: TourModule; error?: string }> {
  let tour: Partial<TourModule>;
  try {
    tour = await import(`${pathToFileURL(file)}?v=${Date.now()}-${Math.random()}`);
  } catch (error) {
    return { error: `The tour failed to load: ${message(error).split('\n')[0]}` };
  }
  if (!tour.meta?.title || typeof tour.run !== 'function') return { error: 'A tour must export meta (with a title) and an async run(t).' };
  return { tour: tour as TourModule };
}

function printReport(report: Report, cwd: string): void {
  const shown = (path: string) => relative(cwd, path) || path;
  console.log(`${report.status.toUpperCase()}: ${report.title} · ${shown(report.video ?? '')} (${report.seconds}s)`);
  for (const step of report.steps) console.log(`  ${step.status === 'passed' ? '✓' : '✗'} ${step.title}`);
  for (const behavior of report.coverage ?? []) if (!behavior.steps.length) console.log(`  ✗ not shown: ${behavior.description}`);
  if (report.error) console.log(`  ${report.error}`);
  if (report.failureFile) console.log(`  Failure details: ${shown(report.failureFile)}`);
}

// The tours in .tours/ at the repository root, for commands given no tour files.
async function repoTours(): Promise<string[]> {
  const repo = repoRoot(process.cwd());
  return (await readdir(join(repo, '.tours')).catch(() => [] as string[])).filter(isTourFile).map(file => join(repo, '.tours', file));
}

async function check(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } });
  if (values.help) return usage(true);
  const files = positionals.length ? positionals.map(path => resolve(path)) : await repoTours();
  for (const file of files) if (!(await exists(file))) throw new TourError(`Tour file not found: ${file}`);
  const result = await checkTours(files);
  if (!result.checked.length) {
    console.log('No .tour.ts files to check (.tour.js tours are not type-checked).');
    return 0;
  }
  console.log(result.ok ? `Types OK: ${result.checked.map(file => relative(process.cwd(), file)).join(', ')}` : result.output);
  return result.ok ? 0 : 1;
}

async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      json: { type: 'boolean', default: false },
      channel: { type: 'string', default: 'chromium' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length || !values.url) return usage(values.help);
  const url = appUrl(values.url);
  const files = positionals.map(path => resolve(path));
  for (const file of files) if (!(await exists(file))) throw new TourError(`Tour file not found: ${file}`);
  // Type errors are reported in a second, before any recording starts.
  const checked = await checkTours(files);
  if (!checked.ok) {
    if (values.json) console.log(JSON.stringify([{ status: 'type-error', output: checked.output }], null, 2));
    else console.log(`Type errors, nothing recorded:\n${checked.output}`);
    return 1;
  }
  const results: { tour: string; status: string; video?: string; report?: string; failure?: string | null; error?: string | null }[] = [];
  for (const file of files) {
    const repo = repoRoot(dirname(file));
    const outDir = await videosDir(repo);
    const { tour, error } = await loadTour(file);
    if (!tour) {
      results.push({ tour: file, status: 'failed', error: error ?? null });
      if (!values.json) console.log(`FAILED: ${relative(process.cwd(), file)}\n  ${error}`);
      continue;
    }
    const options = {
      url,
      outDir,
      name: tourName(file),
      channel: values.channel,
      tourSha: sha(await readFile(file)),
      appTree: appTree(repo),
    };
    let report: Report;
    try {
      report = await recordTour(tour, options);
    } catch (cause) {
      // The app, the browser or the encoder failed, not the tour.
      const sandbox = /browserType\.launch/.test(message(cause))
        ? "\n  The browser could not start. Inside a coding agent's sandbox (such as Codex on macOS) a browser cannot run: run pro-tour outside the sandbox."
        : '';
      const error = `Recording failed: ${message(cause).split('\n')[0]}${sandbox}`;
      results.push({ tour: file, status: 'error', error });
      if (!values.json)
        console.log(
          `ERROR: ${relative(process.cwd(), file)}\n  ${error}\n  This is not a tour failure. Check that the app is reachable at --url and that pro-tour doctor passes.`,
        );
      continue;
    }
    results.push({
      tour: file,
      status: report.status,
      video: report.video,
      report: report.video?.replace(/\.mp4$/, '.json'),
      failure: report.failureFile ?? null,
      error: report.error ?? null,
    });
    if (!values.json) printReport(report, process.cwd());
  }
  if (values.json) console.log(JSON.stringify(results, null, 2));
  if (results.some(result => result.status === 'error')) return 3;
  return results.every(result => result.status === 'passed') ? 0 : 1;
}

async function publishCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      pr: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return usage(true);
  const repo = repoRoot(process.cwd());
  const env = process.env;
  const pr = await resolvePr(repo, { target: values.pr, branch: values.pr ? undefined : currentBranch(repo), env });

  // A tour named without a path is .tours/<name>.tour.ts, or .tour.js if that is what exists.
  const named = async (name: string) => {
    if (isTourFile(name)) return resolve(name);
    const ts = join(repo, '.tours', `${name}.tour.ts`);
    return (await exists(ts)) ? ts : join(repo, '.tours', `${name}.tour.js`);
  };
  let tours = await Promise.all(positionals.map(named));
  if (!tours.length) {
    tours = changedTours(repo, pr.base);
    if (!tours.length)
      throw new TourError(
        'This pull request adds or changes no tours in .tours/. Record one with pro-tour run, commit it, or name the tours to publish.',
      );
  }

  for (const result of await publishTours(repo, pr, tours, { env, dryRun: values['dry-run'] })) {
    if ('body' in result) console.log(`--- ${result.name}: comment that would be posted to ${pr.url} ---\n${result.body}`);
    else console.log(`${result.reused ? 'Already published' : 'Published'} ${result.name}: ${result.url}`);
  }
  return 0;
}

async function initCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { help: { type: 'boolean', short: 'h' } } });
  if (values.help) return usage(true);
  const { runner, changes } = await init(repoRoot(process.cwd()));
  for (const change of changes) console.log(change);
  console.log(
    changes.length
      ? `The pro-tour skill is installed; agents will run it as \`${runner} pro-tour\`.`
      : 'The pro-tour skill is already up to date.',
  );
  return 0;
}

async function apiCommand(): Promise<number> {
  console.log((await readFile(API, 'utf8')).trimEnd());
  return 0;
}

async function doctorCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { channel: { type: 'string', default: 'chromium' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) return usage(true);
  const checks = await doctor({ channel: values.channel });
  for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.ok ? '' : `\n    ${check.fix}`}`);
  return checks.every(check => check.ok) ? 0 : 2;
}

function usage(asked?: boolean): number {
  (asked ? console.log : console.error)(USAGE);
  return asked ? 0 : 2;
}

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  check,
  run,
  publish: publishCommand,
  init: initCommand,
  api: apiCommand,
  doctor: doctorCommand,
};

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS[command]) return usage(['-h', '--help', 'help'].includes(command ?? ''));
  try {
    return await COMMANDS[command](rest);
  } catch (error) {
    if (!(error instanceof TourError) && !String((error as NodeJS.ErrnoException)?.code).startsWith('ERR_PARSE_ARGS')) throw error;
    console.error(`pro-tour: ${message(error)}`);
    return 2;
  }
}
