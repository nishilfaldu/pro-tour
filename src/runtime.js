import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { markdown } from './report.js';

const OVERLAY = join(dirname(fileURLToPath(import.meta.url)), 'overlay.js');
const SIZE = { width: 1280, height: 800 };
const PACE = { move: 650, afterAction: 500, typeDelay: 45, stepIntro: 1000, stepOutro: 1200, checkTimeout: 5000, chip: 450, failHold: 1500, menu: 450 };

class TourCheckError extends Error {}

const firstLine = error => error.message.split('\n')[0];
// TOUR_TRACE=1 logs slow actions and checks to stderr.
async function traced(name, run) {
  if (!process.env.TOUR_TRACE) return run();
  const started = Date.now();
  try {
    return await run();
  } finally {
    const ms = Date.now() - started;
    if (ms > 2000) process.stderr.write(`[tour] slow ${name}: ${ms}ms\n`);
  }
}
const within = (ms, promise) => Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms, false))]);

export class Tour {
  constructor(page, { pace = {}, behaviors = {} } = {}) {
    this.page = page;
    this.pace = { ...PACE, ...pace };
    this.behaviors = behaviors;
    this.steps = [];
    this.sampling = null;
  }

  ui(name, ...args) {
    return this.page.evaluate(({ name, args }) => window.__tour[name](...args), { name, args });
  }

  pause(ms) {
    return ms > 0 ? this.page.waitForTimeout(ms) : Promise.resolve();
  }

  // A step is evidence only if its checks tell "after" apart from "before": each check is sampled
  // before the actions and after each one, then polled at the end. At least one check must have been
  // false at some sample and pass at the end, and a hidden check must have been visible at some sample.
  // `covers` names the meta.behaviors this step demonstrates; the tour fails if any behavior is left uncovered.
  async step(title, run, checks = [], { covers = [] } = {}) {
    const step = { index: this.steps.length + 1, title, status: 'running', covers, checks: [] };
    this.steps.push(step);
    const started = Date.now();
    await this.ui('clearChecks');
    await this.ui('caption', `STEP ${step.index}`, title);
    await this.pause(this.pace.stepIntro);
    try {
      if (!checks.length) throw new TourCheckError(`Step "${title}" has no checks. Pass the checks that prove what its actions change.`);
      const notCheck = checks.findIndex(check => typeof check?.test !== 'function');
      if (notCheck >= 0) throw new TourCheckError(`Check ${notCheck + 1} of step "${title}" is not a check (got ${typeof checks[notCheck]}). Build every check with t.visible, t.hidden, t.text, t.value or t.check.`);
      const unknown = covers.filter(id => !(id in this.behaviors));
      if (unknown.length) throw new TourCheckError(`Step "${title}" covers "${unknown[0]}", which is not in meta.behaviors (${Object.keys(this.behaviors).join(', ') || 'none'}).`);
      this.sampling = checks.map(check => ({ check, sawFalse: false }));
      await this.sample();
      await run();
      const sampled = this.sampling;
      this.sampling = null;
      // All checks are polled at once, right after the last action: transient feedback such as a toast or a
      // "Copied!" tooltip must not expire while earlier chips animate. Chips are then shown in order.
      const outcomes = await traced('checks', () => Promise.all(sampled.map(({ check }) => this.poll(check))));
      for (const [i, { check, sawFalse }] of sampled.entries()) await this.report(step, check, sawFalse, outcomes[i]);
      const stale = step.checks.filter(check => check.kind === 'hidden' && !check.changed);
      if (stale.length) {
        await this.ui('check', 'Hidden check was never visible', 'fail');
        throw new TourCheckError(`Check "${stale[0].label}" was hidden before and after every action in the step, so it shows nothing disappearing. Check something that is on screen at some point in the step and gone at the end.`);
      }
      if (!step.checks.some(check => check.changed)) {
        await this.ui('check', 'Nothing changed in this step', 'fail');
        throw new TourCheckError(`Step "${title}" changed nothing: every check already passed before its actions ran. Add a check for what the actions change.`);
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

  coverage() {
    return Object.entries(this.behaviors).map(([id, description]) => ({
      id, description, steps: this.steps.filter(step => step.status === 'passed' && step.covers.includes(id)).map(step => step.index),
    }));
  }

  async assertCovered() {
    const missing = this.coverage().filter(behavior => !behavior.steps.length);
    if (!missing.length) return;
    await this.ui('check', `Not shown: ${missing[0].description}`, 'fail');
    await this.pause(this.pace.failHold);
    throw new TourCheckError(`Behavior "${missing[0].id}" (${missing[0].description}) is not shown by any passing step`
      + `${missing.length > 1 ? `, nor are ${missing.slice(1).map(behavior => `"${behavior.id}"`).join(', ')}` : ''}.`
      + ` Add a step that demonstrates it and pass { covers: ['${missing[0].id}'] } as the fourth argument to t.step.`);
  }

  async sample() {
    for (const entry of this.sampling ?? []) {
      if (!entry.sawFalse) entry.sawFalse = !(await within(1500, entry.check.test()).catch(() => false));
    }
  }

  async poll(check) {
    const deadline = Date.now() + this.pace.checkTimeout;
    let passed = false;
    let cause;
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

  async report(step, check, sawFalse, { passed, cause }) {
    const changed = passed && sawFalse;
    step.checks.push({ label: check.label, kind: check.kind, passed, changed, ...(cause && !passed ? { detail: firstLine(cause) } : {}) });
    await this.ui('check', check.label, !passed ? 'fail' : changed ? 'pass' : 'same');
    await this.pause(this.pace.chip);
    if (!passed) throw new TourCheckError(`Check failed: ${check.label}${cause ? ` (${firstLine(cause)})` : ''}`, { cause });
  }

  async point(locator) {
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

  click(locator) {
    return traced(`click ${locator}`, async () => {
      await this.point(locator);
      await traced(`  locator.click ${locator}`, () => locator.click());
      await this.settle();
    });
  }

  async fill(locator, text) {
    await this.point(locator);
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(text, { delay: this.pace.typeDelay });
    await this.settle();
  }

  // Navigate to a path of the app (resolved against the app URL).
  async goto(path) {
    await this.page.goto(path);
    await this.settle();
  }

  // Press a key, such as 'Enter' or 'Escape', in the focused element.
  async press(key) {
    await this.page.keyboard.press(key);
    await this.settle();
  }

  async select(locator, label) {
    const box = await this.point(locator);
    const { labels, from } = await locator.evaluate(el => ({ labels: [...el.options].map(option => option.label), from: el.selectedIndex }));
    const to = labels.indexOf(label);
    if (to >= 0) {
      await this.ui('menu', box, labels, from);
      await this.pause(this.pace.menu);
      const item = await this.ui('menuItem', to);
      await this.ui('moveTo', item.x + Math.min(item.width / 2, 60), item.y + item.height / 2, this.pace.move);
      await this.ui('press', item.x + Math.min(item.width / 2, 60), item.y + item.height / 2);
      await this.pause(this.pace.menu / 2);
    }
    try {
      await locator.selectOption({ label });
    } finally {
      await this.ui('hideMenu');
    }
    await this.settle();
  }

  async settle() {
    await this.pause(this.pace.afterAction);
    await this.ui('clearRing');
    await this.sample();
  }

  // Check builders: describe a condition; the step decides when to evaluate it.
  check(label, test) {
    expectArgs('check', label, [typeof test === 'function', 'an async () => boolean function']);
    return { kind: 'custom', label, test };
  }

  visible(label, locator) {
    expectArgs('visible', label, [isLocator(locator), 'a Playwright locator']);
    return { kind: 'visible', label, test: () => locator.isVisible() };
  }

  hidden(label, locator) {
    expectArgs('hidden', label, [isLocator(locator), 'a Playwright locator']);
    return { kind: 'hidden', label, test: () => locator.isHidden() };
  }

  text(label, locator, text) {
    expectArgs('text', label, [isLocator(locator), 'a Playwright locator'], [typeof text === 'string', 'the expected text']);
    return { kind: 'text', label, test: async () => (await locator.count()) > 0 && (await locator.textContent({ timeout: 1000 }))?.trim() === text };
  }

  // Form controls: an input's value, or the visible label of a <select>'s chosen option (as t.select takes).
  value(label, locator, expected) {
    expectArgs('value', label, [isLocator(locator), 'a Playwright locator'], [typeof expected === 'string', 'the expected value']);
    return { kind: 'value', label, test: async () => (await locator.count()) > 0 && await locator.evaluate(
      el => (el.selectedOptions ? [...el.selectedOptions].map(option => option.label).join(', ') : el.value), null, { timeout: 1000 }) === expected };
  }
}

const isLocator = value => typeof value?.isVisible === 'function' && typeof value?.count === 'function';

function expectArgs(builder, label, ...args) {
  if (typeof label !== 'string') throw new TypeError(`t.${builder}() needs a label string as its first argument`);
  args.forEach(([ok, what], i) => {
    if (!ok) throw new TypeError(`t.${builder}("${label}", ...) needs ${what} as argument ${i + 2}`);
  });
}

// Repair context at a failure: visible elements with the attributes a locator can use. Runs in the page.
// Big pages would bury the relevant part, so the excerpt leads with the region around the element the
// tour last acted on and the last elements in <body>, where menus, popovers and dialogs usually mount.
function failureDom(target) {
  const keep = /^(id|class|role|name|type|placeholder|for|href|title|value|alt|aria-.*|data-test.*|data-state)$/;
  const excerpt = (root, limit) => {
    const lines = [];
    let size = 0;
    const add = line => {
      lines.push(line);
      size += line.length + 1;
    };
    const walk = (node, depth) => {
      if (size > limit) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) add(`${'  '.repeat(depth)}"${text.length > 200 ? `${text.slice(0, 200)}…` : text}"`);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE|SVG|TEMPLATE|svg)$/.test(node.tagName) || !node.checkVisibility()) return;
      const attrs = [...node.attributes].filter(attr => keep.test(attr.name)).map(attr => ` ${attr.name}="${attr.value.slice(0, 120)}"`).join('');
      add(`${'  '.repeat(depth)}<${node.tagName.toLowerCase()}${attrs}>`);
      for (const child of node.childNodes) walk(child, depth + 1);
    };
    walk(root, 0);
    return lines.join('\n').slice(0, limit);
  };
  const sections = [];
  let region = null;
  if (target?.isConnected) {
    region = target;
    while (region.parentElement && region.parentElement !== document.body && excerpt(region, 2000).length < 1500) region = region.parentElement;
    sections.push(`Around the element the tour last acted on:\n${excerpt(region, 4000)}`);
  }
  const tail = [...document.body.children].slice(-4).filter(el => el.checkVisibility() && !el.contains(region));
  if (tail.length) sections.push(`Last elements in <body> (menus, popovers and dialogs usually mount here):\n${tail.map(el => excerpt(el, 2500)).join('\n')}`);
  const used = sections.join('\n\n').length;
  sections.push(`Whole page, truncated:\n${excerpt(document.body, Math.max(2000, 12000 - used))}`);
  return sections.join('\n\n');
}

// Exclusive creation: concurrent runs of the same tour never write to one file.
async function reserveVideo(outDir, name) {
  for (let version = 1; ; version++) {
    const path = join(outDir, `${name}-v${version}.mp4`);
    if (existsSync(path.replace(/\.mp4$/, '.json'))) continue;
    try {
      await (await open(path, 'wx', 0o600)).close();
      return path;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

// channel: 'chromium' (Playwright's own build, the default) or an installed browser such as 'chrome'.
export async function recordTour(tour, { url, outDir, name, channel = 'chromium' }) {
  const work = await mkdtemp(join(tmpdir(), 'tour-'));
  const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true });
  const report = { title: tour.meta.title, summary: tour.meta.summary, url, status: 'failed', steps: [] };
  let page;
  let context;
  let trimSeconds = 0;
  try {
    context = await browser.newContext({ baseURL: url, viewport: SIZE, deviceScaleFactor: 1, bypassCSP: true, recordVideo: { dir: work, size: SIZE } });
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
      report.error = error.message.split('\n')[0];
      // Repair context for a planner: the full Playwright message (strict-mode errors list every match) and what the page exposed.
      report.failure = {
        message: [error.message, error.cause?.message].filter(Boolean).join('\n').slice(0, 4000),
        aria: await page.locator('body').ariaSnapshot({ timeout: 2000 }).catch(() => null),
        dom: await page.evaluate(failureDom, await t.lastTarget?.first().elementHandle({ timeout: 1000 }).catch(() => null) ?? null).catch(() => null),
      };
    }
    report.steps = t.steps;
    report.coverage = t.coverage();
    const passed = t.steps.filter(step => step.status === 'passed').length;
    await t.ui('clearCaption');
    await t.ui('clearChecks');
    await t.ui('card', report.status === 'passed' ? 'Tour passed' : 'Tour failed',
      `${passed}/${t.steps.length} steps passed`, report.error || tour.meta.title);
    await t.pause(2200);
  } finally {
    await context?.close();
    await browser.close();
  }

  await mkdir(outDir, { recursive: true });
  const video = await reserveVideo(outDir, name);
  const encode = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', trimSeconds.toFixed(2),
    '-i', await page.video().path(), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { encoding: 'utf8' });
  await rm(work, { recursive: true, force: true });
  if (encode.status !== 0) throw new Error(`ffmpeg failed: ${encode.stderr}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
  report.seconds = Math.round(Number(probe.stdout) * 10) / 10;
  report.video = video;
  await writeFile(video.replace(/\.mp4$/, '.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(video.replace(/\.mp4$/, '.md'), markdown(report));
  return report;
}
