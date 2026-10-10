import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { doctor } from './doctor.js';
import { init } from './init.js';
import { githubEnv, publish, resolvePr } from './publish.js';
import { changedTours, currentBranch, repoRoot, TourError, videosDir } from './repo.js';
import { recordings, recordTour } from './runtime.js';

const API = join(dirname(fileURLToPath(import.meta.url)), 'tour-api.md');

const USAGE = `Usage:
  pro-tour run <file.tour.js>... --url <app url> [--json] [--keep] [--out <dir>] [--channel chromium|chrome]
      Record tours into .videos/. On failure, prints the file with the error and the page's visible DOM.
  pro-tour publish [<tour>...] [--pr <number|url>] [--dry-run] [--keep] [--allow-failed] [--retry-upload]
      Comment on the pull request with each tour's latest video and behavior checklist. Without tour names,
      publishes the tours the pull request adds or changes. Deletes the local video once it is on the PR.
  pro-tour init
      Install the pro-tour skill for coding agents (.agents/skills, .claude/skills) and point AGENTS.md
      and CLAUDE.md at it.
  pro-tour api
      Print the tour API.
  pro-tour doctor
      Check the browser, ffmpeg and GitHub CLI, printing the command that fixes each problem.

Exit codes: 0 passed, 1 a tour failed, 2 usage or setup error, 3 recording failed (app unreachable, browser or encoder).`;

const exists = path => access(path).then(() => true, () => false);
const sha = text => createHash('sha256').update(text).digest('hex');
const tourName = path => basename(path).replace(/\.tour\.js$/, '');

class RecordingError extends TourError {}

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

// Fresh import every time: a tour edited between runs in one process must not come from the module cache.
async function loadTour(file) {
  let tour;
  try {
    tour = await import(`${pathToFileURL(file)}?v=${Date.now()}-${Math.random()}`);
  } catch (error) {
    return { error: `The tour failed to load: ${error.message.split('\n')[0]}` };
  }
  if (!tour.meta?.title || typeof tour.run !== 'function') return { error: 'A tour must export meta (with a title) and an async run(t).' };
  return { tour };
}

function printReport(report, cwd) {
  const shown = path => relative(cwd, path) || path;
  console.log(`${report.status.toUpperCase()}: ${report.title} · ${shown(report.video)} (${report.seconds}s)`);
  for (const step of report.steps) console.log(`  ${step.status === 'passed' ? '✓' : '✗'} ${step.title}`);
  for (const behavior of report.coverage ?? []) if (!behavior.steps.length) console.log(`  ✗ not shown: ${behavior.description}`);
  if (report.error) console.log(`  ${report.error}`);
  if (report.failureFile) console.log(`  Failure details: ${shown(report.failureFile)}`);
}

async function run(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    url: { type: 'string' }, out: { type: 'string' }, json: { type: 'boolean', default: false }, keep: { type: 'boolean', default: false },
    channel: { type: 'string', default: process.env.PRO_TOUR_BROWSER || 'chromium' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !positionals.length || !values.url) return usage(values.help);
  const url = appUrl(values.url);
  const results = [];
  for (const path of positionals) {
    const file = resolve(path);
    if (!await exists(file)) throw new TourError(`Tour file not found: ${file}`);
    const outDir = values.out ? resolve(values.out) : await videosDir(repoRoot(dirname(file)));
    const { tour, error } = await loadTour(file);
    if (error) {
      results.push({ tour: file, status: 'failed', error });
      if (!values.json) console.log(`FAILED: ${relative(process.cwd(), file)}\n  ${error}`);
      continue;
    }
    const options = { url, outDir, name: tourName(file), channel: values.channel, keep: values.keep, sourceSha: sha(await readFile(file)) };
    let report;
    // A browser or encoder failure is retried once; it says nothing about the tour.
    for (let attempt = 1; !report; attempt++) {
      try {
        report = await recordTour(tour, options);
      } catch (cause) {
        if (attempt >= 2) throw new RecordingError(`Recording ${tourName(file)} failed twice: ${cause.message.split('\n')[0]}`);
      }
    }
    results.push({ tour: file, status: report.status, video: report.video, report: report.video.replace(/\.mp4$/, '.md'),
      failure: report.failureFile ?? null, error: report.error ?? null });
    if (!values.json) printReport(report, process.cwd());
  }
  if (values.json) console.log(JSON.stringify(results, null, 2));
  return results.every(result => result.status === 'passed') ? 0 : 1;
}

async function publishCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    pr: { type: 'string' }, out: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, keep: { type: 'boolean', default: false },
    'allow-failed': { type: 'boolean', default: false }, 'retry-upload': { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) return usage(true);
  const repo = repoRoot(process.cwd());
  const env = githubEnv();
  const pr = await resolvePr(repo, { target: values.pr, branch: values.pr ? undefined : currentBranch(repo), env });
  const outDir = values.out ? resolve(values.out) : join(repo, '.videos');

  let tours = positionals.map(name => (name.endsWith('.tour.js') ? resolve(name) : join(repo, '.tours', `${name}.tour.js`)));
  if (!tours.length) {
    const changed = changedTours(repo, pr.base);
    if (changed.uncommitted.length) console.warn(`pro-tour: uncommitted tour changes are not published until committed: ${changed.uncommitted.join(', ')}`);
    tours = changed.tours;
    if (!tours.length) throw new TourError('This pull request adds or changes no tours in .tours/. Record one with pro-tour run, commit it, or name the tours to publish.');
  }

  // Check every tour before posting anything, so a problem does not leave the PR half published.
  const ready = [];
  for (const file of tours) {
    const name = tourName(file);
    const video = (await recordings(outDir, name)).at(-1);
    if (!video) throw new TourError(`No recording of ${name} in ${relative(repo, outDir) || outDir}; run pro-tour run ${relative(repo, file)} --url <app url> first.`);
    const report = JSON.parse(await readFile(video.replace(/\.mp4$/, '.json'), 'utf8'));
    if (report.status !== 'passed' && !values['allow-failed']) throw new TourError(`The latest recording of ${name} failed; fix the tour or the change and record it again (or pass --allow-failed).`);
    if (report.tourSha && await exists(file) && report.tourSha !== sha(await readFile(file))) {
      throw new TourError(`${relative(repo, file)} changed after its latest recording; record it again before publishing.`);
    }
    ready.push({ name, video });
  }

  for (const { name, video } of ready) {
    const result = await publish(video, pr, { env, retryUpload: values['retry-upload'], keep: values.keep, dryRun: values['dry-run'] });
    if (result.status === 'dry-run') console.log(`--- ${name}: comment that would be posted to ${pr.url} ---\n${result.body}`);
    else console.log(`${result.reused ? 'Already published' : 'Published'} ${name}: ${result.commentUrl}`
      + `${result.hidden ? ` (hid ${result.hidden} older recording${result.hidden > 1 ? 's' : ''})` : ''}`);
  }
  return 0;
}

async function initCommand(argv) {
  const { values } = parseArgs({ args: argv, options: { runner: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return usage(true);
  const repo = repoRoot(process.cwd());
  const { runner, changes } = await init(repo, { runner: values.runner });
  for (const change of changes) console.log(change);
  console.log(changes.length ? `The pro-tour skill is installed; agents will run it as \`${runner ? `${runner} ` : ''}pro-tour\`.` : 'The pro-tour skill is already up to date.');
  return 0;
}

async function apiCommand() {
  console.log((await readFile(API, 'utf8')).trimEnd());
  return 0;
}

async function doctorCommand(argv) {
  const { values } = parseArgs({ args: argv, options: { channel: { type: 'string', default: process.env.PRO_TOUR_BROWSER || 'chromium' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return usage(true);
  const checks = await doctor({ channel: values.channel });
  for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.ok ? '' : `\n    ${check.fix}`}`);
  return checks.every(check => check.ok) ? 0 : 2;
}

function usage(asked) {
  (asked ? console.log : console.error)(USAGE);
  return asked ? 0 : 2;
}

const COMMANDS = { run, publish: publishCommand, init: initCommand, api: apiCommand, doctor: doctorCommand };

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!COMMANDS[command]) return usage(['-h', '--help', 'help'].includes(command));
  try {
    return await COMMANDS[command](rest);
  } catch (error) {
    if (error instanceof RecordingError) {
      console.error(`pro-tour: ${error.message}\n(not a tour failure: check that the app is reachable at --url and that pro-tour doctor passes)`);
      return 3;
    }
    if (!(error instanceof TourError) && !String(error?.code).startsWith('ERR_PARSE_ARGS')) throw error;
    console.error(`pro-tour: ${error.message}`);
    return 2;
  }
}
