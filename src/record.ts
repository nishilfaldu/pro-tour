// Record a tour: run it with Playwright's test runner and pro-tour's config, then encode the video as an MP4
// that carries the run's result in its metadata. The MP4 is the only file a run leaves.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { message } from './repo.ts';
import type { RunResult, TourResult } from './types.ts';

// A checkout runs the TypeScript source; an installed package runs dist/.
const source = import.meta.url.endsWith('.ts');
const CONFIG = fileURLToPath(new URL(`./config.${source ? 'ts' : 'js'}`, import.meta.url));
const PLAYWRIGHT = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js');
const RESOLVE = new URL(`./resolve.${source ? 'ts' : 'js'}`, import.meta.url).href;
// The overlay is plain JavaScript injected into the page as is, so it ships beside this module.
const OVERLAY = fileURLToPath(new URL('./overlay.js', import.meta.url));

const plain = (value: unknown) => stripVTControlCharacters(String(value ?? ''));
const firstLine = (value: string) => value.split('\n')[0];

/** A recording that failed for a known reason: the first line says what happened, the second what to do. */
export class RecordingError extends Error {}

/** What to do about a browser that did not start; shared with doctor. */
export function browserFix(error: unknown, channel: string): string {
  if (/missing dependencies|install-deps|shared libraries/i.test(message(error)))
    return "Chromium's system libraries are missing: run pro-tour install-browser --with-deps.";
  if (/Executable doesn't exist|playwright install/i.test(message(error)))
    return channel === 'chromium'
      ? 'The browser is not installed: run pro-tour install-browser.'
      : `${channel} is not installed: install it, or use --channel chromium.`;
  return "The browser is installed but could not start. Inside a coding agent's sandbox (such as Codex on macOS) a browser cannot run: run pro-tour outside the sandbox.";
}

// Child processes run in their own process group only when asked: Ctrl-C reaches pro-tour, which stops them
// through the signal.
function tool(
  command: string,
  args: string[],
  { signal, env, cwd, detached = true }: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string; detached?: boolean } = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { detached, signal, env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => {
      stdout += data;
    });
    child.stderr.on('data', data => {
      stderr += data;
    });
    child.on('error', fail);
    child.on('close', status => done({ status, stdout, stderr }));
  });
}

/** A tour's recording in .videos/: `login` is .videos/login.mp4, `apps/web/login` is .videos/apps/web/login.mp4. */
export const recordingFile = (outDir: string, name: string) => join(outDir, `${name}.mp4`);

export async function removeRecording(outDir: string, name: string, { keepVideo = false } = {}): Promise<void> {
  if (!keepVideo) await rm(recordingFile(outDir, name), { force: true });
  // A monorepo tour's recording sits in folders of its own, such as .videos/apps/web/; drop them once empty.
  for (let dir = dirname(join(outDir, name)); dir.startsWith(`${outDir}/`); dir = dirname(dir))
    if (
      !(await rmdir(dir).then(
        () => true,
        () => false,
      ))
    )
      break;
}

/** The result a recording carries, or null if the file is not a pro-tour recording. */
export async function readRecording(video: string): Promise<TourResult | null> {
  const probe = await tool('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', video]);
  try {
    const result = JSON.parse(JSON.parse(probe.stdout).format.tags.comment);
    return typeof result?.title === 'string' && Array.isArray(result.steps) ? result : null;
  } catch {
    return null;
  }
}

export interface RecordOptions {
  repo: string;
  url: string;
  outDir: string;
  name: string;
  /** 'chromium' (Playwright's own build, the default) or an installed browser such as 'chrome'. */
  channel?: string;
  commit: string | null;
  dirty: boolean;
  /** Aborting it stops the recording, leaving the previous one as it was. */
  signal?: AbortSignal;
}

export interface Recording {
  result: TourResult;
  /** The MP4, or null when the tour failed before anything was recorded. */
  video: string | null;
  /** The full error of a failed tour, and the page's visible DOM where it stopped. */
  error?: string;
  dom?: string;
}

interface JsonError {
  message?: string;
  value?: string;
  stack?: string;
  location?: { file: string; line: number; column: number };
}
interface JsonSuite {
  specs?: { tests?: { results?: { status: string; error?: JsonError }[] }[] }[];
  suites?: JsonSuite[];
}

const tests = (suites: JsonSuite[] = []): { status: string; error?: JsonError }[] =>
  suites.flatMap(suite => [
    ...(suite.specs ?? []).flatMap(spec => (spec.tests ?? []).map(test => test.results?.[0] ?? { status: 'skipped' })),
    ...tests(suite.suites),
  ]);

// The tour's lines around where it stopped, as Playwright's reporters show them.
function codeFrame(file: string, line: number, column: number): string {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out: string[] = [];
  for (let at = Math.max(1, line - 2); at <= Math.min(lines.length, line + 2); at++) {
    out.push(`${at === line ? '>' : ' '} ${String(at).padStart(4)} | ${lines[at - 1]}`);
    if (at === line) out.push(`       | ${' '.repeat(Math.max(0, column - 1))}^`);
  }
  return out.join('\n');
}

// Playwright's error, with where it happened in the tour. Playwright would point at pro-tour's own wrappers
// when they are on the stack, so the location is the tour's own frame.
function describe(error: JsonError, tour: string, cwd: string): string {
  const frame = new RegExp(`${tour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+):(\\d+)`).exec(error.stack ?? '');
  const location = frame ? { line: Number(frame[1]), column: Number(frame[2]) } : error.location?.file === tour ? error.location : null;
  const text = plain(error.message ?? error.value).trim();
  if (!location) return text;
  return `${text}\n\n    at ${relative(cwd, tour)}:${location.line}:${location.column}\n\n${codeFrame(tour, location.line, location.column)}`;
}

/** Record the tour, replacing its previous recording in outDir. */
export async function recordTour(
  file: string,
  { repo, url, outDir, name, channel = 'chromium', commit, dirty, signal }: RecordOptions,
): Promise<Recording> {
  signal?.throwIfAborted();
  // Found now rather than after a 30-second recording.
  for (const encoder of ['ffmpeg', 'ffprobe'])
    if ((spawnSync(encoder, ['-version']).error as NodeJS.ErrnoException)?.code === 'ENOENT')
      throw new RecordingError(
        `${encoder} is not installed.\nInstall ffmpeg (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt-get install ffmpeg).`,
      );
  const video = recordingFile(outDir, name);
  await mkdir(dirname(video), { recursive: true });
  // Work beside the destination, so the finished video is renamed into place on the same file system.
  const work = await mkdtemp(join(outDir, '.recording-'));
  try {
    const env = {
      ...process.env,
      PRO_TOUR_FILE: file,
      PRO_TOUR_URL: url,
      PRO_TOUR_WORK: work,
      PRO_TOUR_CHANNEL: channel,
      PRO_TOUR_OVERLAY: OVERLAY,
      FORCE_COLOR: '0',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${RESOLVE}`.trim(),
    };
    // Not detached: Ctrl-C in a terminal reaches Playwright's runner as well, and it stops cleanly.
    const runner = await tool(process.execPath, [PLAYWRIGHT, 'test', '--config', CONFIG], {
      env,
      cwd: repo,
      signal,
      detached: false,
    }).catch(error => {
      if (signal?.aborted) throw signal.reason;
      throw error;
    });
    signal?.throwIfAborted();

    const failed = (error: string): Recording => ({
      result: { title: name, status: 'failed', steps: [], error: firstLine(error), seconds: 0, commit, dirty },
      video: null,
      error,
    });
    const report = JSON.parse(await readFile(join(work, 'report.json'), 'utf8').catch(() => 'null')) as {
      suites?: JsonSuite[];
      errors?: JsonError[];
    } | null;
    if (!report) {
      const output = plain(`${runner.stdout}${runner.stderr}`).trim().split('\n').slice(-20).join('\n');
      throw new RecordingError(`Playwright did not run the tour (exit code ${runner.status}).\n${output}`);
    }
    // The tour did not load: a syntax error, a failed import.
    if (report.errors?.length) return failed(`The tour failed to load: ${describe(report.errors[0], file, repo)}`);
    const all = tests(report.suites);
    if (!all.length) return failed("The tour has no test. A tour is one test('…', async ({ page }) => { … }) from pro-tour.");
    if (all.length > 1) return failed(`A tour is one test, and this file has ${all.length}. Put each tour in a file of its own.`);
    const [outcome] = all;
    // The raw error: the formatted ones in `errors` already hold a code frame and the stack.
    const playwrightError = outcome.error ? describe(outcome.error, file, repo) : undefined;

    const runs = (await readdir(work)).filter(entry => /^result-.*\.json$/.test(entry));
    const run: RunResult | null = runs.length ? JSON.parse(await readFile(join(work, runs[0]), 'utf8')) : null;
    if (!run) {
      if (playwrightError && /browserType\.launch|Executable doesn't exist|Failed to launch/i.test(playwrightError))
        throw new RecordingError(`${firstLine(playwrightError)}\n${browserFix(playwrightError, channel)}`);
      return failed(
        `The tour did not record: import test and expect from 'pro-tour', not from '@playwright/test'.${playwrightError ? `\n${playwrightError}` : ''}`,
      );
    }
    if (run.status === 'error') throw new RecordingError(run.error ?? 'The recording could not start.');

    const status = run.status === 'passed' && outcome.status === 'passed' ? 'passed' : 'failed';
    const error = status === 'failed' ? (playwrightError ?? run.error ?? `The tour ${outcome.status}.`) : undefined;

    const raw = (await readdir(join(work, 'video')).catch(() => [])).find(entry => entry.endsWith('.webm'));
    if (!raw) throw new Error('Playwright did not record a video');
    const encoded = join(work, 'encoded.mp4');
    const encode = await tool(
      'ffmpeg',
      [
        ...['-hide_banner', '-loglevel', 'error', '-y', '-i', join(work, 'video', raw)],
        ...['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', encoded],
      ],
      { signal },
    );
    if (encode.status !== 0) throw new Error(`ffmpeg failed: ${encode.stderr.trim()}`);
    const probe = await tool('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', encoded], { signal });
    const result: TourResult = {
      title: run.title,
      status,
      steps: run.steps,
      ...(error ? { error: firstLine(error) } : {}),
      seconds: Math.round(Number(probe.stdout) * 10) / 10,
      commit,
      dirty,
    };
    // The result goes into the video's own metadata, so there is no second file to keep in step with it.
    const tagged = join(work, 'tour.mp4');
    const tag = await tool(
      'ffmpeg',
      [
        ...['-hide_banner', '-loglevel', 'error', '-y', '-i', encoded, '-c', 'copy'],
        ...['-metadata', `comment=${JSON.stringify(result)}`, '-movflags', '+faststart', tagged],
      ],
      { signal },
    );
    if (tag.status !== 0) throw new Error(`ffmpeg failed: ${tag.stderr.trim()}`);
    signal?.throwIfAborted();
    await rename(tagged, video);
    return { result, video, ...(error ? { error, dom: run.dom } : {}) };
  } finally {
    await rm(work, { recursive: true, force: true });
    // A run that recorded nothing leaves nothing: no empty folders for a monorepo tour.
    await removeRecording(outDir, name, { keepVideo: true });
  }
}
