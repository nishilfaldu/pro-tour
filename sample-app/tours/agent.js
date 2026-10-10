// Write, run and repair a feature tour for a PR.
//
//   node tours/agent.js --tour <path/name.tour.js> --url <running app> --src <app source dir>
//     (--diff <file> | --base <git ref>) [--rounds 3] [--model gpt-6-luna] [--effort high] [--replan] [--out .videos]
//
// An existing tour is replayed with no model; the model is only asked to repair it if it breaks.
// Otherwise the model lists the PR's behaviors, writes a tour for them, and repairs it from each failure
// (error plus visible DOM) up to --rounds times. The tour file is only written when an attempt passes.
// Tour code from the model runs in this process, as any tour does: run it where the app runs (CI).
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { exists, listBehaviors, prContext, writeTour } from './planner.js';
import { recordTour } from './runtime.js';

async function load(path) {
  return import(`${pathToFileURL(path)}?v=${Date.now()}-${Math.random()}`);
}

const failed = (error, message = error) => ({ status: 'failed', error, failure: { message } });

export async function runAgent({ tourPath, rounds = 3, replan = false, planner, record, log = () => {} }) {
  const name = basename(tourPath, '.tour.js');
  const work = await mkdtemp(join(tmpdir(), 'tour-agent-'));
  const history = [];
  const entry = item => {
    history.push(item);
    log(item);
  };
  let behaviors;
  let source;
  let report;
  try {
    if (!replan && await exists(tourPath)) {
      source = await readFile(tourPath, 'utf8');
      const tour = await load(tourPath);
      behaviors = tour.meta.behaviors;
      report = await record(tour, name);
      entry({ kind: 'replay', status: report.status, video: report.video, error: report.error });
      if (report.status === 'passed') return { status: 'passed', tourPath, report, history };
    }
    if (!behaviors) {
      const listed = await planner.listBehaviors();
      behaviors = listed.behaviors;
      entry({ kind: 'behaviors', behaviors, seconds: listed.seconds, usage: listed.usage });
    }

    let repairs = 0;
    for (;;) {
      const repairing = Boolean(source);
      if (repairing && repairs === rounds) break;
      if (repairing) repairs++;
      const written = await planner.writeTour(behaviors, repairing ? { previous: source, report } : {});
      source = written.source;
      const attempt = join(work, `${name}.tour.js`);
      await writeFile(attempt, source);
      let tour;
      try {
        tour = await load(attempt);
      } catch (error) {
        report = failed(`Tour module failed to load: ${error.message.split('\n')[0]}`, error.stack ?? error.message);
      }
      if (tour && !isDeepStrictEqual(tour.meta?.behaviors, behaviors)) {
        report = failed(`meta.behaviors must be exactly ${JSON.stringify(behaviors)}; do not add, drop or reword behaviors.`);
      } else if (tour) {
        report = await record(tour, name);
        if (report.video) await copyFile(attempt, report.video.replace(/\.mp4$/, '.tour.js'));
      }
      entry({ kind: repairing ? 'repair' : 'write', status: report.status, video: report.video, error: report.error,
        notes: written.notes, seconds: written.seconds, usage: written.usage });
      if (report.status === 'passed') {
        await mkdir(dirname(tourPath), { recursive: true });
        await writeFile(tourPath, source);
        return { status: 'passed', tourPath, report, history };
      }
    }
    return { status: 'failed', tourPath, report, history };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function totals(history) {
  const calls = history.filter(item => item.usage);
  const sum = key => calls.reduce((total, item) => total + item.usage[key], 0);
  return {
    modelCalls: calls.length,
    repairs: history.filter(item => item.kind === 'repair').length,
    modelSeconds: Math.round(calls.reduce((total, item) => total + item.seconds, 0) * 10) / 10,
    tokens: { input: sum('input'), cached: sum('cached'), output: sum('output'), reasoning: sum('reasoning') },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    tour: { type: 'string' }, url: { type: 'string' }, src: { type: 'string' }, diff: { type: 'string' }, base: { type: 'string' },
    rounds: { type: 'string', default: '3' }, model: { type: 'string', default: 'gpt-6-luna' }, effort: { type: 'string' },
    replan: { type: 'boolean', default: false }, out: { type: 'string', default: '.videos' }, log: { type: 'string' },
  } });
  if (!values.tour || !values.url || !values.src || !(values.diff || values.base)) {
    console.error('Usage: node tours/agent.js --tour <name.tour.js> --url <app url> --src <dir> (--diff <file> | --base <ref>) [--rounds 3] [--model m] [--effort e] [--replan] [--out .videos] [--log file.json]');
    process.exit(2);
  }
  const options = { model: values.model, effort: values.effort };
  const diff = values.diff ? await readFile(values.diff, 'utf8')
    : execFileSync('git', ['diff', `${values.base}...HEAD`, '--', '.'], { cwd: resolve(values.src), encoding: 'utf8', maxBuffer: 64 << 20 });
  let context;
  const planner = {
    async listBehaviors() {
      context ??= await prContext({ diff, src: resolve(values.src) });
      return listBehaviors(context, options);
    },
    async writeTour(behaviors, repair) {
      context ??= await prContext({ diff, src: resolve(values.src) });
      return writeTour(context, behaviors, repair, options);
    },
  };
  const outDir = resolve(values.out);
  const tourPath = resolve(values.tour);
  const name = basename(tourPath, '.tour.js');
  const started = Date.now();
  const result = await runAgent({
    tourPath,
    rounds: Number(values.rounds),
    replan: values.replan,
    planner,
    record: (tour, tourName) => recordTour(tour, { url: values.url, outDir, name: tourName }),
    log: item => console.log(`${item.kind.padEnd(9)} ${item.status ?? ''}${item.seconds ? ` (${item.seconds}s model)` : ''}`
      + `${item.video ? ` ${basename(item.video)}` : ''}${item.error ? `\n          ${item.error.slice(0, 200)}` : ''}`),
  });
  const summary = { tour: tourPath, model: values.model, effort: values.effort ?? null, status: result.status,
    video: result.report?.video ?? null, seconds: Math.round((Date.now() - started) / 1000), ...totals(result.history), history: result.history };
  const logPath = resolve(values.log ?? join(outDir, `${name}-agent.json`));
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(`${result.status.toUpperCase()}: ${result.status === 'passed' ? result.tourPath : 'tour not written'}`
    + ` · ${summary.modelCalls} model calls, ${summary.repairs} repairs, ${summary.seconds}s · log ${logPath}`);
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
