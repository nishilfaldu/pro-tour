import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { constants } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { checkTours } from './check.ts';
import { doctor } from './doctor.ts';
import { init } from './init.ts';
import { publishTours, resolvePr } from './publish.ts';
import { type Recording, RecordingError, recordTour } from './record.ts';
import {
  allTours,
  currentBranch,
  exists,
  hasChanges,
  headCommit,
  isTourFile,
  message,
  recordings,
  removeVideosDirIfEmpty,
  repoRoot,
  TourError,
  tourName,
  videosDir,
  workingTree,
} from './repo.ts';

const USAGE = `Usage:
  pro-tour run <file.tour.ts>... --url <app url> [--fast] [--hide <css selector>]... [--json] [--channel chromium|chrome]
      Record each tour into .videos/<name>.mp4. A failure prints the error and the page's visible DOM.
      --fast runs the tour without recording it or pausing, to fix it quickly; it keeps the last recording.
      --hide hides elements in the video, such as a dev server's toolbar.
  pro-tour check [<file.tour.ts>...]
      Type-check tours (default: every tour in a .tours/ directory) without recording.
  pro-tour publish [<tour>...] [--pr <number|url>] [--dry-run] [--allow-stale]
      Post each recording in .videos/ (or the named tours) to the pull request, then delete it. A recording that
      does not show the code at the PR's head is refused, unless --allow-stale.
  pro-tour init
      Point AGENTS.md and CLAUDE.md at pro-tour's docs (only AGENTS.md when CLAUDE.md imports it).
  pro-tour install-browser [--with-deps]
      Download the Chromium build pro-tour records with (--with-deps also installs its system libraries on Linux).
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

const indent = (text: string, by: string) =>
  text
    .split('\n')
    .map(line => (line ? `${by}${line}` : line))
    .join('\n');

function printRecording({ result, video, error, dom, at }: Recording, shown: string, fast: boolean): void {
  const where = video
    ? `${relative(process.cwd(), video)} (${result.seconds}s)`
    : fast
      ? `${shown} (${result.seconds}s, not recorded: --fast)`
      : `${shown}, nothing recorded`;
  console.log(`${result.status.toUpperCase()}: ${result.title} · ${where}`);
  for (const step of result.steps) {
    console.log(`  ${step.status === 'passed' ? '✓' : '✗'} ${step.title}`);
    for (const check of step.checks) console.log(`      ${check.passed ? '✓' : '✗'} ${check.label}`);
  }
  if (error) console.log(`\n${indent(error, '  ')}`);
  if (!dom) return;
  console.log(`\n  Visible DOM where the tour stopped:\n${indent(dom, '    ')}`);
  // The DOM can be long, and the end of the output is what is often read: the failure again, in one line.
  const step = result.steps.find(step => step.status === 'failed');
  console.log(`\nFAILED: ${[step && `step "${step.title}"`, result.error, at].filter(Boolean).join(' · ')} (error above the DOM)`);
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
      fast: { type: 'boolean', default: false },
      hide: { type: 'string', multiple: true, default: [] },
      channel: { type: 'string', default: 'chromium' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length || !values.url) return usage(values.help);
  const url = appUrl(values.url);
  const files: string[] = [];
  for (const path of positionals) {
    if (!(await exists(path))) throw new TourError(`Tour file not found: ${resolve(path)}`);
    if (!isTourFile(path)) throw new TourError(`${path} is not a tour: tours are .tour.ts or .tour.js files`);
    // Real paths, as git prints them, even when named through a symlink such as /tmp on macOS.
    files.push(await realpath(path));
  }
  const stop = interruptible();
  try {
    return await record(files, url, { channel: values.channel, json: values.json, fast: values.fast, hide: values.hide }, stop);
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

type RunOutput = Omit<Partial<Recording['result']>, 'status' | 'error'> & {
  tour: string;
  status: string;
  video?: string | null;
  error?: string;
  dom?: string;
  at?: string;
};

async function record(
  files: string[],
  url: string,
  { channel, json, fast, hide }: { channel: string; json: boolean; fast: boolean; hide: string[] },
  stop: ReturnType<typeof interruptible>,
): Promise<number> {
  const results: RunOutput[] = [];
  const repos = new Set<string>();
  const finish = async (code: number) => {
    // A run that recorded nothing leaves nothing behind.
    for (const repo of repos) await removeVideosDirIfEmpty(repo);
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
  for (const file of files) {
    const shown = relative(process.cwd(), file);
    const repo = repoRoot(dirname(file));
    repos.add(repo);
    let recording: Recording;
    try {
      recording = await recordTour(file, {
        repo,
        url,
        outDir: await videosDir(repo),
        name: tourName(repo, file),
        channel,
        commit: headCommit(repo),
        dirty: hasChanges(repo),
        tree: fast ? null : workingTree(repo),
        fast,
        hide,
        signal: stop.signal,
      });
    } catch (cause) {
      const code = await stop.interrupted();
      if (code) {
        results.push({ tour: file, status: 'interrupted', error: 'Interrupted; the previous recording is unchanged.' });
        if (!json) console.log(`INTERRUPTED: ${shown}\n  Nothing was recorded; the previous recording is unchanged.`);
        return finish(code);
      }
      if (cause instanceof TourError) throw cause;
      // The app, the browser or the encoder failed, not the tour. A RecordingError says which, and what to do.
      const lines = message(cause).split('\n');
      const error = `Recording failed: ${cause instanceof RecordingError ? lines.join('\n  ') : `${lines[0]}\n  If it happens again, run pro-tour doctor.`}`;
      results.push({ tour: file, status: 'error', error });
      if (!json) console.log(`ERROR: ${shown}\n  ${error}\n  This is not a tour failure.`);
      continue;
    }
    const { video, error, dom, at } = recording;
    results.push({ tour: file, ...recording.result, video, error, dom, at });
    if (!json) printRecording(recording, shown, fast);
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
      'allow-stale': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return usage(true);
  const repo = repoRoot(process.cwd());
  // A tour is named by its file or by its name, such as login or apps/web/login (see tourName).
  const names = positionals.length
    ? positionals.map(tour => (isTourFile(tour) ? tourName(repo, resolve(tour)) : tour.replace(/\.mp4$/, '')))
    : await recordings(repo);
  if (!names.length) throw new TourError('There are no recordings in .videos/ to publish. Record a tour with pro-tour run first.');
  const env = process.env;
  const pr = await resolvePr(repo, { target: values.pr, branch: values.pr ? undefined : currentBranch(repo), env });
  const options = { env, dryRun: values['dry-run'], allowStale: values['allow-stale'] };
  for (const result of await publishTours(repo, pr, names, options)) {
    if ('body' in result) console.log(`--- ${result.name}: comment that would be posted to ${pr.url} ---\n${result.body}`);
    else console.log(`${result.reused ? 'Already published' : 'Published'} ${result.name}: ${result.url}`);
  }
  return 0;
}

async function initCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { help: { type: 'boolean', short: 'h' } } });
  if (values.help) return usage(true);
  const { changes, notes } = await init(repoRoot(process.cwd()), await realpath(process.cwd()));
  for (const line of [...changes, ...notes]) console.log(line);
  console.log(changes.length ? 'Agents will now find the feature tour docs.' : 'Already set up.');
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
  // Playwright prints nothing when the browser is already in its cache, so say what is there either way.
  const browser = chromium.executablePath();
  const had = existsSync(browser);
  if (spawnSync(process.execPath, args, { stdio: 'inherit' }).status !== 0) return 2;
  console.log(`Chromium is ready${had ? ', already installed' : ''}: ${browser}`);
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
