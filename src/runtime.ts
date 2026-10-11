import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from 'playwright';
import { markdown } from './report.ts';
import type { Check, CheckKind, Coverage, Report, StepOptions, StepResult, TourModule } from './types.ts';

// The overlay is plain JavaScript injected into the page as is, so it ships beside this module.
const OVERLAY = fileURLToPath(new URL('./overlay.js', import.meta.url));
const SIZE = { width: 1280, height: 800 };
const PACE = {
  move: 650,
  afterAction: 500,
  typeDelay: 45,
  stepIntro: 1000,
  stepOutro: 1200,
  checkTimeout: 5000,
  chip: 450,
  failHold: 1500,
  menu: 450,
};

export type Pace = typeof PACE;
type Box = { x: number; y: number; width: number; height: number };

declare global {
  interface Window {
    // Installed by overlay.js.
    __tour: Record<string, (...args: unknown[]) => unknown>;
  }
}

class TourCheckError extends Error {}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const firstLine = (error: unknown) => message(error).split('\n')[0];

// TOUR_TRACE=1 logs slow actions and checks to stderr.
async function traced<T>(name: string, run: () => Promise<T>): Promise<T> {
  if (!process.env.TOUR_TRACE) return run();
  const started = Date.now();
  try {
    return await run();
  } finally {
    const ms = Date.now() - started;
    if (ms > 2000) process.stderr.write(`[tour] slow ${name}: ${ms}ms\n`);
  }
}

const within = <T>(ms: number, promise: Promise<T>) =>
  Promise.race([promise, new Promise<false>(resolve => setTimeout(resolve, ms, false))]);

interface Sample {
  check: Check;
  sawFalse: boolean;
}

/** The object a tour's `run(t)` receives. */
export class Tour {
  /** The Playwright page showing the app. */
  readonly page: Page;
  readonly steps: StepResult[] = [];
  /** @internal */
  lastTarget: Locator | null = null;
  private readonly pace: Pace;
  private readonly behaviors: Record<string, string>;
  private sampling: Sample[] | null = null;

  constructor(page: Page, { pace = {}, behaviors = {} }: { pace?: Partial<Pace>; behaviors?: Record<string, string> } = {}) {
    this.page = page;
    this.pace = { ...PACE, ...pace };
    this.behaviors = behaviors;
  }

  /** @internal Calls the in-page overlay. */
  ui<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(({ name, args }) => window.__tour[name](...args), { name, args }) as Promise<T>;
  }

  /** @internal */
  pause(ms: number): Promise<void> {
    return ms > 0 ? this.page.waitForTimeout(ms) : Promise.resolve();
  }

  /**
   * One captioned step: the user actions, then the checks that prove what they did.
   *
   * A step is evidence only if its checks tell "after" apart from "before": each check is sampled
   * before the actions and after each one, then polled at the end. At least one check must have been
   * false at some sample and pass at the end, and a hidden check must have been visible at some sample.
   * `covers` names the meta.behaviors this step demonstrates; the tour fails if any is left uncovered.
   */
  async step(title: string, run: () => Promise<void>, checks: Check[] = [], { covers = [] }: StepOptions = {}): Promise<void> {
    const step: StepResult = { index: this.steps.length + 1, title, status: 'running', covers, checks: [] };
    this.steps.push(step);
    const started = Date.now();
    await this.ui('clearChecks');
    await this.ui('caption', `STEP ${step.index}`, title);
    await this.pause(this.pace.stepIntro);
    try {
      if (!checks.length) throw new TourCheckError(`Step "${title}" has no checks. Pass the checks that prove what its actions change.`);
      const notCheck = checks.findIndex(check => typeof check?.test !== 'function');
      if (notCheck >= 0)
        throw new TourCheckError(
          `Check ${notCheck + 1} of step "${title}" is not a check (got ${typeof checks[notCheck]}). Build every check with t.visible, t.hidden, t.text, t.value or t.check.`,
        );
      const unknown = covers.filter(id => !(id in this.behaviors));
      if (unknown.length)
        throw new TourCheckError(
          `Step "${title}" covers "${unknown[0]}", which is not in meta.behaviors (${Object.keys(this.behaviors).join(', ') || 'none'}).`,
        );
      const sampled: Sample[] = checks.map(check => ({ check, sawFalse: false }));
      this.sampling = sampled;
      await this.sample();
      await run();
      this.sampling = null;
      // All checks are polled at once, right after the last action: transient feedback such as a toast or a
      // "Copied!" tooltip must not expire while earlier chips animate. Chips are then shown in order.
      const outcomes = await traced('checks', () => Promise.all(sampled.map(({ check }) => this.poll(check))));
      for (const [i, { check, sawFalse }] of sampled.entries()) await this.report(step, check, sawFalse, outcomes[i]);
      const stale = step.checks.filter(check => check.kind === 'hidden' && !check.changed);
      if (stale.length) {
        await this.ui('check', 'Hidden check was never visible', 'fail');
        throw new TourCheckError(
          `Check "${stale[0].label}" was hidden before and after every action in the step, so it shows nothing disappearing. Check something that is on screen at some point in the step and gone at the end.`,
        );
      }
      if (!step.checks.some(check => check.changed)) {
        await this.ui('check', 'Nothing changed in this step', 'fail');
        throw new TourCheckError(
          `Step "${title}" changed nothing: every check already passed before its actions ran. Add a check for what the actions change.`,
        );
      }
      step.status = 'passed';
      await this.pause(this.pace.stepOutro);
    } catch (error) {
      this.sampling = null;
      step.status = 'failed';
      step.error = firstLine(error);
      await this.pause(this.pace.failHold);
      throw error;
    } finally {
      step.seconds = Math.round((Date.now() - started) / 100) / 10;
    }
  }

  /** @internal */
  coverage(): Coverage[] {
    return Object.entries(this.behaviors).map(([id, description]) => ({
      id,
      description,
      steps: this.steps.filter(step => step.status === 'passed' && step.covers.includes(id)).map(step => step.index),
    }));
  }

  /** @internal */
  async assertCovered(): Promise<void> {
    const missing = this.coverage().filter(behavior => !behavior.steps.length);
    if (!missing.length) return;
    await this.ui('check', `Not shown: ${missing[0].description}`, 'fail');
    await this.pause(this.pace.failHold);
    throw new TourCheckError(
      `Behavior "${missing[0].id}" (${missing[0].description}) is not shown by any passing step` +
        `${
          missing.length > 1
            ? `, nor are ${missing
                .slice(1)
                .map(behavior => `"${behavior.id}"`)
                .join(', ')}`
            : ''
        }.` +
        ` Add a step that demonstrates it and pass { covers: ['${missing[0].id}'] } as the fourth argument to t.step.`,
    );
  }

  private async sample(): Promise<void> {
    for (const entry of this.sampling ?? []) {
      if (!entry.sawFalse) entry.sawFalse = !(await within(1500, Promise.resolve(entry.check.test())).catch(() => false));
    }
  }

  private async poll(check: Check): Promise<{ passed: boolean; cause?: unknown }> {
    const deadline = Date.now() + this.pace.checkTimeout;
    let passed = false;
    let cause: unknown;
    while (!passed) {
      try {
        passed = Boolean(await check.test());
      } catch (error) {
        cause = error;
      }
      if (passed || Date.now() >= deadline) break;
      await this.pause(100);
    }
    return { passed, cause };
  }

  private async report(
    step: StepResult,
    check: Check,
    sawFalse: boolean,
    { passed, cause }: { passed: boolean; cause?: unknown },
  ): Promise<void> {
    const changed = passed && sawFalse;
    step.checks.push({ label: check.label, kind: check.kind, passed, changed, ...(cause && !passed ? { detail: firstLine(cause) } : {}) });
    await this.ui('check', check.label, !passed ? 'fail' : changed ? 'pass' : 'same');
    await this.pause(this.pace.chip);
    if (!passed) throw new TourCheckError(`Check failed: ${check.label}${cause ? ` (${firstLine(cause)})` : ''}`, { cause });
  }

  private async point(locator: Locator): Promise<Box> {
    this.lastTarget = locator;
    await traced(`  waitFor ${locator}`, () => locator.waitFor({ state: 'visible' }));
    await traced(`  scrollIntoView ${locator}`, () => locator.scrollIntoViewIfNeeded());
    const box = await locator.boundingBox();
    if (!box) throw new Error(`No bounding box for ${locator}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.ui('ring', box);
    await traced('  moveTo', () => this.ui('moveTo', x, y, this.pace.move));
    await this.ui('press', x, y);
    return box;
  }

  /** Move the cursor to the element and click it. */
  click(locator: Locator): Promise<void> {
    return traced(`click ${locator}`, async () => {
      await this.point(locator);
      await traced(`  locator.click ${locator}`, () => locator.click());
      await this.settle();
    });
  }

  /** Type text visibly into an input, replacing what it held. */
  async fill(locator: Locator, text: string): Promise<void> {
    await this.point(locator);
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(text, { delay: this.pace.typeDelay });
    await this.settle();
  }

  /** Navigate to a path of the app (resolved against the app URL). */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.settle();
  }

  /** Press a key, such as 'Enter' or 'Escape', in the focused element. */
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
    await this.settle();
  }

  /**
   * Pick the option with this visible label in a native `<select>`. Headless Chromium does not paint a
   * select's open menu, so the overlay draws one and the cursor clicks the option in it.
   */
  async select(locator: Locator, label: string): Promise<void> {
    const box = await this.point(locator);
    const { labels, from } = await locator.evaluate((el: HTMLSelectElement) => ({
      labels: [...el.options].map(option => option.label),
      from: el.selectedIndex,
    }));
    const to = labels.indexOf(label);
    if (to >= 0) {
      await this.ui('menu', box, labels, from);
      await this.pause(this.pace.menu);
      const item = await this.ui<Box>('menuItem', to);
      const x = item.x + Math.min(item.width / 2, 60);
      const y = item.y + item.height / 2;
      await this.ui('moveTo', x, y, this.pace.move);
      await this.ui('press', x, y);
      await this.pause(this.pace.menu / 2);
    }
    try {
      await locator.selectOption({ label });
    } finally {
      await this.ui('hideMenu');
    }
    await this.settle();
  }

  private async settle(): Promise<void> {
    await this.pause(this.pace.afterAction);
    await this.ui('clearRing');
    await this.sample();
  }

  /** A custom check: passes when `test` resolves to true. */
  check(label: string, test: () => boolean | Promise<boolean>): Check {
    expectArgs('check', label, [typeof test === 'function', 'an async () => boolean function']);
    return { kind: 'custom', label, test };
  }

  /** Passes when the element is visible. */
  visible(label: string, locator: Locator): Check {
    expectArgs('visible', label, [isLocator(locator), 'a Playwright locator']);
    return builtCheck('visible', label, () => locator.isVisible());
  }

  /** Passes when the element is hidden or absent; it must have been visible at some point in the step. */
  hidden(label: string, locator: Locator): Check {
    expectArgs('hidden', label, [isLocator(locator), 'a Playwright locator']);
    return builtCheck('hidden', label, () => locator.isHidden());
  }

  /** Passes when the element's trimmed textContent equals `text`. */
  text(label: string, locator: Locator, text: string): Check {
    expectArgs('text', label, [isLocator(locator), 'a Playwright locator'], [typeof text === 'string', 'the expected text']);
    return builtCheck(
      'text',
      label,
      async () => (await locator.count()) > 0 && (await locator.textContent({ timeout: 1000 }))?.trim() === text,
    );
  }

  /** Passes when an input's value, or the visible label of a `<select>`'s chosen option, equals `expected`. */
  value(label: string, locator: Locator, expected: string): Check {
    expectArgs('value', label, [isLocator(locator), 'a Playwright locator'], [typeof expected === 'string', 'the expected value']);
    return builtCheck(
      'value',
      label,
      async () =>
        (await locator.count()) > 0 &&
        (await locator.evaluate(
          (el: HTMLInputElement | HTMLSelectElement) =>
            'selectedOptions' in el ? [...el.selectedOptions].map(option => option.label).join(', ') : el.value,
          null,
          { timeout: 1000 },
        )) === expected,
    );
  }
}

const builtCheck = (kind: CheckKind, label: string, test: () => Promise<boolean>): Check => ({ kind, label, test });

const isLocator = (value: unknown): boolean =>
  typeof (value as Locator)?.isVisible === 'function' && typeof (value as Locator)?.count === 'function';

// Tours are often model-written or plain JavaScript, so arguments are checked at run time too.
function expectArgs(builder: string, label: unknown, ...args: [boolean, string][]): void {
  if (typeof label !== 'string') throw new TypeError(`t.${builder}() needs a label string as its first argument`);
  args.forEach(([ok, what], i) => {
    if (!ok) throw new TypeError(`t.${builder}("${label}", ...) needs ${what} as argument ${i + 2}`);
  });
}

// Repair context at a failure: visible elements with the attributes a locator can use. Runs in the page.
// Big pages would bury the relevant part, so the excerpt leads with the region around the element the
// tour last acted on and the last elements in <body>, where menus, popovers and dialogs usually mount.
function failureDom(node: Node | null): string {
  const target = node instanceof Element ? node : null;
  const keep = /^(id|class|role|name|type|placeholder|for|href|title|value|alt|aria-.*|data-test.*|data-state)$/;
  const excerpt = (root: Node, limit: number) => {
    const lines: string[] = [];
    let size = 0;
    const add = (line: string) => {
      lines.push(line);
      size += line.length + 1;
    };
    const walk = (node: Node, depth: number) => {
      if (size > limit) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').trim();
        if (text) add(`${'  '.repeat(depth)}"${text.length > 200 ? `${text.slice(0, 200)}…` : text}"`);
        return;
      }
      if (!(node instanceof Element) || /^(SCRIPT|STYLE|SVG|TEMPLATE|svg)$/.test(node.tagName) || !node.checkVisibility()) return;
      const attrs = [...node.attributes]
        .filter(attr => keep.test(attr.name))
        .map(attr => ` ${attr.name}="${attr.value.slice(0, 120)}"`)
        .join('');
      add(`${'  '.repeat(depth)}<${node.tagName.toLowerCase()}${attrs}>`);
      for (const child of node.childNodes) walk(child, depth + 1);
    };
    walk(root, 0);
    return lines.join('\n').slice(0, limit);
  };
  const sections: string[] = [];
  let region: Element | null = null;
  if (target?.isConnected) {
    region = target;
    while (region.parentElement && region.parentElement !== document.body && excerpt(region, 2000).length < 1500)
      region = region.parentElement;
    sections.push(`Around the element the tour last acted on:\n${excerpt(region, 4000)}`);
  }
  const tail = [...document.body.children].slice(-4).filter(el => el.checkVisibility() && !el.contains(region));
  if (tail.length)
    sections.push(
      `Last elements in <body> (menus, popovers and dialogs usually mount here):\n${tail.map(el => excerpt(el, 2500)).join('\n')}`,
    );
  const used = sections.join('\n\n').length;
  sections.push(`Whole page, truncated:\n${excerpt(document.body, Math.max(2000, 12000 - used))}`);
  return sections.join('\n\n');
}

// Exclusive creation: concurrent runs of the same tour never write to one file.
async function reserveVideo(outDir: string, name: string): Promise<string> {
  for (let version = 1; ; version++) {
    const path = join(outDir, `${name}-v${version}.mp4`);
    if (existsSync(path.replace(/\.mp4$/, '.json'))) continue;
    try {
      await (await open(path, 'wx', 0o600)).close();
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

const SIDECARS = ['.json', '.md', '.failure.md', '.upload.json'];
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Recordings of one tour in outDir, oldest first: `<name>-v<N>.mp4`. */
export async function recordings(outDir: string, name: string): Promise<string[]> {
  const pattern = new RegExp(`^${escapeRegExp(name)}-v(\\d+)\\.mp4$`);
  const files = await readdir(outDir).catch(() => [] as string[]);
  return files
    .map(file => [file, pattern.exec(file)?.[1]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([file]) => join(outDir, file));
}

/** Delete a recording and the report files beside it. */
export async function removeRecording(video: string): Promise<void> {
  const base = video.replace(/\.mp4$/, '');
  await Promise.all([video, ...SIDECARS.map(suffix => base + suffix)].map(file => rm(file, { force: true })));
}

function failureText(report: Report): string {
  return [
    `# ${report.title}: failed`,
    '',
    `Error: ${report.failure?.message}`,
    '',
    'Visible DOM at the failure:',
    '',
    '```',
    report.failure?.dom ?? '(not available)',
    '```',
    '',
  ].join('\n');
}

export interface RecordOptions {
  url: string;
  outDir: string;
  name: string;
  /** 'chromium' (Playwright's own build, the default) or an installed browser such as 'chrome'. */
  channel?: string;
  /** Fingerprint of the tour script, so publish can tell a video recorded from an older script. */
  sourceSha?: string | null;
  /** Keep the tour's older recordings (by default they are deleted once this one is written). */
  keep?: boolean;
}

export async function recordTour(
  tour: TourModule,
  { url, outDir, name, channel = 'chromium', sourceSha = null, keep = false }: RecordOptions,
): Promise<Report> {
  const work = await mkdtemp(join(tmpdir(), 'tour-'));
  const browser: Browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true });
  const report: Report = { title: tour.meta.title, summary: tour.meta.summary, url, tourSha: sourceSha, status: 'failed', steps: [] };
  let page: Page | undefined;
  let context: BrowserContext | undefined;
  let trimSeconds = 0;
  try {
    context = await browser.newContext({
      baseURL: url,
      viewport: SIZE,
      deviceScaleFactor: 1,
      bypassCSP: true,
      recordVideo: { dir: work, size: SIZE },
    });
    await context.addInitScript({ path: OVERLAY });
    page = await context.newPage();
    const opened = Date.now();
    await page.goto(url, { waitUntil: 'networkidle' });
    const t = new Tour(page, { behaviors: tour.meta.behaviors });
    await t.ui('card', 'Feature tour', tour.meta.title, tour.meta.summary);
    trimSeconds = (Date.now() - opened) / 1000;
    await t.pause(2800);
    await t.ui('hideCard');
    await t.pause(500);
    try {
      await tour.run(t);
      await t.assertCovered();
      report.status = 'passed';
    } catch (error) {
      report.error = firstLine(error);
      // Repair context: the full Playwright message (strict-mode errors list every match) and what the page showed.
      const target =
        (await t.lastTarget
          ?.first()
          .elementHandle({ timeout: 1000 })
          .catch(() => null)) ?? null;
      report.failure = {
        message: [message(error), (error as Error)?.cause ? message((error as Error).cause) : ''].filter(Boolean).join('\n').slice(0, 4000),
        dom: await page.evaluate(failureDom, target).catch(() => null),
      };
    }
    report.steps = t.steps;
    report.coverage = t.coverage();
    const passed = t.steps.filter(step => step.status === 'passed').length;
    await t.ui('clearCaption');
    await t.ui('clearChecks');
    await t.ui(
      'card',
      report.status === 'passed' ? 'Tour passed' : 'Tour failed',
      `${passed}/${t.steps.length} steps passed`,
      report.error || tour.meta.title,
    );
    await t.pause(2200);
  } finally {
    await context?.close();
    await browser.close();
  }

  await mkdir(outDir, { recursive: true });
  const video = await reserveVideo(outDir, name);
  const raw = await page?.video()?.path();
  if (!raw) throw new Error('Playwright did not record a video');
  const encode = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      trimSeconds.toFixed(2),
      '-i',
      raw,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      video,
    ],
    { encoding: 'utf8' },
  );
  await rm(work, { recursive: true, force: true });
  if (encode.status !== 0) throw new Error(`ffmpeg failed: ${encode.stderr}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
  report.seconds = Math.round(Number(probe.stdout) * 10) / 10;
  report.video = video;
  if (report.failure) {
    report.failureFile = video.replace(/\.mp4$/, '.failure.md');
    await writeFile(report.failureFile, failureText(report));
  }
  await writeFile(video.replace(/\.mp4$/, '.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(video.replace(/\.mp4$/, '.md'), markdown(report));
  if (!keep) for (const older of await recordings(outDir, name)) if (older !== video) await removeRecording(older);
  return report;
}
