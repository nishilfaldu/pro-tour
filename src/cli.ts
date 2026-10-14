import { spawnSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { constants } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { checkTours } from './check.ts';
import { doctor } from './doctor.ts';
import { init } from './init.ts';
import { publishTours, resolvePr } from './publish.ts';
import {
  allTours,
  appTree,
  blobId,
  changedSubmodules,
  changedTours,
  currentBranch,
  exists,
  isTourFile,
  message,
  repoRoot,
  TourError,
  tourName,
  videosDir,
} from './repo.ts';
import { RecordingError, recordTour } from './runtime.ts';
import type { Report, TourModule } from './types.ts';

// docs/ sits beside src/ and dist/ at the package root.
const API = new URL('../docs/tour-api.md', import.meta.url);

const USAGE = `Usage:
  pro-tour check [<file.tour.ts>...]
      Type-check tours (default: every tour in a .tours/ directory) without recording.
  pro-tour run <file.tour.ts>... --url <app url> [--json] [--channel chromium|chrome]
      Type-check, then record tours into .videos/. On failure, prints the file with the error and the page's
      visible DOM. Ctrl-C stops the recording and keeps the tour's previous one.
  pro-tour publish [<tour>...] [--pr <number|url>] [--dry-run]
      Comment on the pull request with each tour's video and behavior checklist. Without tour names, publishes
      the tours the pull request adds or changes. Refuses a recording that failed or does not show the code at
      the pull request's head. Deletes the local recordings once they are on the PR.
  pro-tour init
      Install the pro-tour skill for coding agents (.agents/skills, .claude/skills) and point AGENTS.md
      and CLAUDE.md at it.
  pro-tour install-browser [--with-deps]
      Download the Chromium build pro-tour records with (--with-deps also installs its system libraries on Linux).
  pro-tour api
      Print the tour API.
  pro-tour doctor [--channel chromium|chrome]
      Check the browser, ffmpeg and GitHub CLI, printing the command that fixes each problem.

Exit codes: 0 passed, 1 a tour failed, 2 usage or setup error, 3 recording failed (app unreachable, browser or
encoder), 130 interrupted.`;

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

// Tours are ES modules whatever the app's package.json says: in a package with "type": "commonjs" a tour
// would fail on its first export, and in one with no "type" Node would print a warning for every tour.
let toursAreModules = false;
function loadToursAsModules(): void {
  if (toursAreModules) return;
  toursAreModules = true;
  registerHooks({
    resolve(specifier, context, next) {
      const resolved = next(specifier, context);
      const path = resolved.url.split('?')[0];
      return isTourFile(path) ? { ...resolved, format: path.endsWith('.ts') ? 'module-typescript' : 'module' } : resolved;
    },
  });
}

// Fresh import every time: a tour edited between runs in one process must not come from the module cache.
async function loadTour(file: string): Promise<{ tour?: TourModule; error?: string }> {
  loadToursAsModules();
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

// Ctrl-C (or SIGTERM) during run aborts the signal: the recording in progress stops, its browser closes and the
// tour keeps its previous recording. A second Ctrl-C quits at once.
function interruptible() {
  const controller = new AbortController();
  let code = 0;
  const stop = (name: NodeJS.Signals) => {
    if (code) process.exit(code);
    code = 128 + constants.signals[name];
    controller.abort();
  };
  for (const name of ['SIGINT', 'SIGTERM'] as const) process.on(name, stop);
  return {
    signal: controller.signal,
    // The exit code if interrupted, else 0. A child process such as git gets the same Ctrl-C and its error can
    // be caught before the signal handler has run, so this lets pending events run first.
    async interrupted(): Promise<number> {
      await new Promise(done => setTimeout(done, 50));
      return code;
    },
    dispose: () => {
      for (const name of ['SIGINT', 'SIGTERM'] as const) process.off(name, stop);
    },
  };
}

async function check(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } });
  if (values.help) return usage(true);
  const files = positionals.length ? positionals.map(path => resolve(path)) : allTours(repoRoot(process.cwd()));
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
  const files: string[] = [];
  for (const path of positionals) {
    if (!(await exists(path))) throw new TourError(`Tour file not found: ${resolve(path)}`);
    // Real paths, as git prints them, even when named through a symlink such as /tmp on macOS.
    files.push(await realpath(path));
  }
  const stop = interruptible();
  try {
    return await record(files, url, values.channel, values.json, stop);
  } catch (error) {
    // A git command that got the same Ctrl-C failed first.
    const code = await stop.interrupted();
    if (!code) throw error;
    console.error('Interrupted.');
    return code;
  } finally {
    stop.dispose();
  }
}

type RunResult = { tour: string; status: string; video?: string; report?: string; failure?: string | null; error?: string | null };

async function record(
  files: string[],
  url: string,
  channel: string,
  json: boolean,
  stop: ReturnType<typeof interruptible>,
): Promise<number> {
  const results: RunResult[] = [];
  const finish = (code: number) => {
    if (json) console.log(JSON.stringify(results, null, 2));
    return code;
  };
  // Type errors are reported in a second, before any recording starts.
  const checked = await checkTours(files);
  if (!checked.ok) {
    // Ctrl-C reaches the type checker too.
    const code = await stop.interrupted();
    if (code) {
      console.error('Interrupted.');
      return code;
    }
    if (json) console.log(JSON.stringify([{ status: 'type-error', output: checked.output }], null, 2));
    else console.log(`Type errors, nothing recorded:\n${checked.output}`);
    return 1;
  }
  // Setup problems (not in a git repository, a symlinked .videos) stop the run before any tour records.
  const repos = new Map<string, { repo: string; outDir: string; name: string }>();
  for (const file of files) {
    const repo = repoRoot(dirname(file));
    repos.set(file, { repo, outDir: await videosDir(repo), name: tourName(repo, file) });
  }
  for (const file of files) {
    const shown = relative(process.cwd(), file);
    const { repo, outDir, name } = repos.get(file) ?? { repo: '', outDir: '', name: '' };
    const { tour, error } = await loadTour(file);
    if (!tour) {
      results.push({ tour: file, status: 'failed', error: error ?? null });
      if (!json) console.log(`FAILED: ${shown}\n  ${error}`);
      continue;
    }
    let report: Report;
    try {
      report = await recordTour(tour, {
        url,
        outDir,
        name,
        channel,
        signal: stop.signal,
        tourBlob: blobId(repo, file),
        appTree: appTree(repo),
        changedSubmodules: changedSubmodules(repo),
      });
    } catch (cause) {
      const code = await stop.interrupted();
      if (code) {
        results.push({ tour: file, status: 'interrupted', error: 'Interrupted; the previous recording is unchanged.' });
        if (!json) console.log(`INTERRUPTED: ${shown}\n  Nothing was recorded; the previous recording is unchanged.`);
        return finish(code);
      }
      // The app, the browser or the encoder failed, not the tour. A RecordingError says which, and what to do.
      const lines = message(cause).split('\n');
      const error = `Recording failed: ${cause instanceof RecordingError ? lines.join('\n  ') : `${lines[0]}\n  If it happens again, run pro-tour doctor.`}`;
      results.push({ tour: file, status: 'error', error });
      if (!json) console.log(`ERROR: ${shown}\n  ${error}\n  This is not a tour failure.`);
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
    if (!json) {
      printReport(report, process.cwd());
      if (report.changedSubmodules)
        console.log(
          `  Submodule ${report.changedSubmodules.join(', ')} has uncommitted changes: commit them and record again before publishing.`,
        );
    }
  }
  if (results.some(result => result.status === 'error')) return finish(3);
  return finish(results.every(result => result.status === 'passed') ? 0 : 1);
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

  // A tour named by its name rather than its file, such as login or apps/web/login (see tourName), is
  // <dir>/.tours/<name>.tour.ts, or .tour.js if that is what exists.
  const named = async (name: string) => {
    if (isTourFile(name)) return resolve(name);
    const ts = join(repo, dirname(name), '.tours', `${name.split('/').at(-1)}.tour.ts`);
    return (await exists(ts)) ? ts : ts.replace(/\.ts$/, '.js');
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

// Installs the browser with pro-tour's own Playwright: the app's package manager may not expose Playwright's
// command (pnpm does not), and the app's own Playwright, if any, may be a version that needs another build.
async function installBrowser(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { 'with-deps': { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) return usage(true);
  const playwright = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js');
  const args = [playwright, 'install', ...(values['with-deps'] ? ['--with-deps'] : []), 'chromium'];
  return spawnSync(process.execPath, args, { stdio: 'inherit' }).status === 0 ? 0 : 2;
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
  'install-browser': installBrowser,
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
