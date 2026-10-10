// Write, run and repair a feature tour for a PR.
//
// An existing tour is replayed with no model; the model is only asked to repair it if it breaks.
// Otherwise the model lists the PR's behaviors, writes a tour for them, and repairs it from each failure
// (error plus visible DOM) up to `rounds` times. The tour file is only written when an attempt passes.
// Tour code from the model runs in this process, as any tour does: run it where the app runs (CI).
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { exists } from './planner.js';

// Fresh import every time: the same path holds a new attempt after each repair.
export async function load(path) {
  return import(`${pathToFileURL(path)}?v=${Date.now()}-${Math.random()}`);
}

const failed = (error, message = error) => ({ status: 'failed', error, failure: { message } });

// The browser or encoder failing is not the tour's fault: retry without spending a repair, then give up.
export class InfrastructureError extends Error {}

async function recordSafely(record, tour, name, attempts) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await record(tour, name);
    } catch (error) {
      if (attempt >= attempts) throw new InfrastructureError(`Recording failed ${attempts} times: ${error.message.split('\n')[0]}`, { cause: error });
    }
  }
}

export async function runAgent({ tourPath, rounds = 3, replan = false, planner, record, log = () => {}, recordAttempts = 2 }) {
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
      const tour = await load(tourPath).catch(error => error);
      if (tour instanceof Error || !tour.meta || typeof tour.run !== 'function') {
        const why = tour instanceof Error ? tour.message.split('\n')[0] : 'it must export meta and an async run(t)';
        report = failed(`Saved tour failed to load: ${why}`, tour instanceof Error ? tour.stack ?? tour.message : why);
      } else {
        behaviors = tour.meta.behaviors;
        report = await recordSafely(record, tour, name, recordAttempts);
      }
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
        if (typeof tour.run !== 'function') throw new Error('it must export an async run(t)');
      } catch (error) {
        tour = null;
        report = failed(`Tour module failed to load: ${error.message.split('\n')[0]}`, error.stack ?? error.message);
      }
      if (tour && !isDeepStrictEqual(tour.meta?.behaviors, behaviors)) {
        report = failed(`meta.behaviors must be exactly ${JSON.stringify(behaviors)}; do not add, drop or reword behaviors.`);
      } else if (tour) {
        report = await recordSafely(record, tour, name, recordAttempts);
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

export function totals(history) {
  const calls = history.filter(item => item.usage);
  const sum = key => calls.reduce((total, item) => total + item.usage[key], 0);
  return {
    modelCalls: calls.length,
    repairs: history.filter(item => item.kind === 'repair').length,
    modelSeconds: Math.round(calls.reduce((total, item) => total + item.seconds, 0) * 10) / 10,
    tokens: { input: sum('input'), cached: sum('cached'), output: sum('output'), reasoning: sum('reasoning') },
  };
}
