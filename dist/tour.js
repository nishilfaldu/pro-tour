// What tours import: Playwright's `test` and `expect`, recorded as a feature tour video.
//
// Runs in Playwright's worker process. The `context` and `page` fixtures record the video and show the title
// and end cards; every action a tour takes (click, fill, selectOption, …) first moves a visible cursor to its
// element, fill types visibly, and each test.step and expect shows as a notice. It only ever adds time, so the
// video shows the app as slow as it is. The run's result is written for `pro-tour run`, which encodes the video.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { test as base, expect as baseExpect } from 'playwright/test';
const SIZE = { width: 1280, height: 800 };
const PACE = {
    move: 650,
    afterAction: 500,
    typeDelay: 45,
    stepIntro: 1000,
    stepOutro: 1200,
    check: 450,
    failHold: 1500,
    menu: 450,
    titleCard: 2800,
    endCard: 2200,
};
const text = (error) => stripVTControlCharacters(error instanceof Error ? error.message : String(error));
const firstLine = (error) => text(error).split('\n')[0];
// Set by the recorder. This module has no import.meta: Playwright compiles it to CommonJS when the app's
// package.json has no "type": "module" and pro-tour runs from a checkout.
function settings() {
    const { PRO_TOUR_URL: url, PRO_TOUR_WORK: work, PRO_TOUR_OVERLAY: overlay, PRO_TOUR_PACE, PRO_TOUR_VIDEO, PRO_TOUR_HIDE } = process.env;
    if (!url || !work || !overlay)
        throw new Error('Record tours with pro-tour run <file.tour.ts> --url <app url>, not with playwright test.');
    const fast = Object.fromEntries(Object.keys(PACE).map(key => [key, 0]));
    const hide = JSON.parse(PRO_TOUR_HIDE || '[]');
    return { url, work, overlay, pace: PRO_TOUR_PACE === 'fast' ? fast : PACE, video: PRO_TOUR_VIDEO !== 'off', hide };
}
// Runs in the page before the app's scripts. Hides the elements --hide names, and the Next.js dev badge while
// it shows no error: either would sit in every frame of the video. The badge is in the open shadow root of
// <nextjs-portal>, which also holds Next's error overlay, so only the badge goes and an error still shows.
function hideDevTools(selectors) {
    const sheet = (css) => {
        const style = new CSSStyleSheet();
        style.replaceSync(css);
        return style;
    };
    // One rule each, so a selector the browser does not understand drops only itself.
    if (selectors.length)
        document.adoptedStyleSheets = [
            ...document.adoptedStyleSheets,
            sheet(selectors.map(s => `${s} { display: none !important; }`).join('\n')),
        ];
    const badge = sheet('#devtools-indicator:has([data-next-badge][data-error="false"]) { display: none !important; }');
    const portals = document.getElementsByTagName('nextjs-portal');
    const done = new WeakSet();
    new MutationObserver(() => {
        for (const portal of portals)
            if (portal.shadowRoot && !done.has(portal)) {
                done.add(portal);
                portal.shadowRoot.adoptedStyleSheets = [...portal.shadowRoot.adoptedStyleSheets, badge];
            }
    }).observe(document, { childList: true, subtree: true });
}
/** The tour being recorded: its steps so far, and the overlay that shows them. */
class Recorder {
    steps = [];
    current = null;
    lastTarget = null;
    // Set while an action runs, so the originals it calls (pressSequentially may call type) are not shown twice.
    busy = false;
    // Errors already shown as a failed check, so the failed step does not show them again.
    shown = new WeakSet();
    pending = Promise.resolve();
    page;
    pace;
    // The video starts with the page.
    started = Date.now();
    constructor(page, pace) {
        this.page = page;
        this.pace = pace;
    }
    // The overlay is decoration: a page that is navigating or closed must not fail the tour.
    ui(name, ...args) {
        return this.page.evaluate(({ name, args }) => window.__tour[name](...args), { name, args }).catch(() => undefined);
    }
    pause(ms) {
        return ms > 0 ? this.page.waitForTimeout(ms).catch(() => { }) : Promise.resolve();
    }
    // A synchronous expect cannot wait for its notice, so the notice waits for the next action or step.
    later(task) {
        this.pending = this.pending.then(task, task);
    }
    flush() {
        return this.pending;
    }
    requireStep(action) {
        if (!this.current)
            throw new Error(`${action} ran outside a test.step. Put every action inside test.step('…', async () => { … }): the step's title is shown in the video.`);
    }
    async beginStep(title) {
        await this.flush();
        const step = { title, at: Math.round((Date.now() - this.started) / 100) / 10, status: 'running', checks: [] };
        this.steps.push(step);
        this.current = step;
        await this.ui('step', this.steps.length, title);
        await this.pause(this.pace.stepIntro);
        return step;
    }
    async endStep(step, failure) {
        await this.flush();
        this.current = null;
        if (!failure) {
            step.status = 'passed';
            await this.pause(this.pace.stepOutro);
            return;
        }
        step.status = 'failed';
        step.error = firstLine(failure.error);
        if (!(failure.error instanceof Object && this.shown.has(failure.error)))
            await this.ui('check', step.error, 'fail');
        await this.pause(this.pace.failHold);
    }
    async check(label, passed, error) {
        this.current?.checks.push({ label, passed });
        if (error instanceof Object)
            this.shown.add(error);
        await this.ui('check', label, passed ? 'pass' : 'fail');
        await this.pause(this.pace.check);
    }
    /** Moves the cursor to the element, rings it and shows a press. Waits for it the way the action would. */
    async point(locator, { press = true, position } = {}) {
        this.lastTarget = locator;
        await this.flush();
        // Waits as the action would; a failure is named after the action (see named in patch).
        await locator.waitFor({ state: 'visible' });
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        if (!box)
            return null;
        const x = box.x + (position ? position.x : box.width / 2);
        const y = box.y + (position ? position.y : box.height / 2);
        await this.ui('ring', box);
        await this.ui('moveTo', x, y, this.pace.move);
        if (press)
            await this.ui('press', x, y);
        return box;
    }
    async settle() {
        await this.pause(this.pace.afterAction);
        await this.ui('clearRing');
        await this.flush();
    }
    // Headless Chromium does not paint a native <select>'s open menu, so the overlay draws one and the cursor
    // picks the option in it before the real selection happens.
    async menu(box, { labels, from, to }) {
        await this.ui('menu', box, labels, from);
        await this.pause(this.pace.menu);
        const item = (await this.ui('menuItem', to));
        if (!item)
            return;
        const x = item.x + Math.min(item.width / 2, 60);
        const y = item.y + item.height / 2;
        await this.ui('moveTo', x, y, this.pace.move);
        await this.ui('press', x, y);
        await this.pause(this.pace.menu / 2);
    }
}
let active = null;
let patched = false;
const options = (value) => (value && typeof value === 'object' ? value : {});
// Runs in the page: whether typing can fill the element the way fill would.
const typable = (el) => el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    (el instanceof HTMLInputElement &&
        ['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(el.getAttribute('type') ?? ''));
// Runs in the page: the native <select> option selectOption would pick, if it is a single one.
function pickOption(el, values) {
    if (!(el instanceof HTMLSelectElement) || el.multiple)
        return null;
    const list = Array.isArray(values) ? values : [values];
    if (list.length !== 1 || list[0] instanceof Element)
        return null;
    const want = list[0];
    const all = [...el.options];
    const to = all.findIndex((option, i) => typeof want === 'string'
        ? option.value === want || option.label === want
        : Boolean(want) &&
            (want.value === undefined || option.value === want.value) &&
            (want.label === undefined || option.label === want.label) &&
            (want.index === undefined || i === want.index));
    return to < 0 ? null : { labels: all.map(option => option.label), from: el.selectedIndex, to };
}
// Wraps Playwright's own Locator, Page and Keyboard methods once per worker. pro-tour pins the Playwright it
// runs tours with, so these are the methods of a known version.
function patch(page) {
    if (patched)
        return;
    patched = true;
    const locatorProto = Object.getPrototypeOf(page.locator('html'));
    const pageProto = Object.getPrototypeOf(page);
    const keyboardProto = Object.getPrototypeOf(page.keyboard);
    const original = { click: locatorProto.click, fill: locatorProto.fill, pressSequentially: locatorProto.pressSequentially };
    // Playwright names a call in its errors from the stack, which a wrapper calling the original through .apply
    // turns into `page.apply`: errors get the name the tour called.
    const named = (name) => (error) => {
        if (error instanceof Error)
            error.message = error.message.replace(/^(\w+)\.(apply|call|waitFor):/, `$1.${name}:`);
        throw error;
    };
    const wrap = (proto, name, around) => {
        const method = proto[name];
        if (typeof method !== 'function')
            return;
        proto[name] = async function (...args) {
            const tour = active;
            if (!tour || tour.busy)
                return method.apply(this, args).catch(named(name));
            tour.busy = true;
            try {
                return await around(tour, this, async (...given) => method.apply(this, given), args).catch(named(name));
            }
            finally {
                tour.busy = false;
            }
        };
    };
    // Locator actions: the cursor goes to the element first.
    for (const name of ['click', 'dblclick', 'tap', 'check', 'uncheck', 'setChecked', 'hover', 'press', 'clear', 'setInputFiles']) {
        wrap(locatorProto, name, async (tour, self, call, args) => {
            tour.requireStep(`locator.${name}()`);
            const given = options(name === 'setChecked' || name === 'press' || name === 'setInputFiles' ? args[1] : args[0]);
            if (!given.trial)
                await tour.point(self, { press: name !== 'hover', position: given.position });
            const result = await call(...args);
            await tour.settle();
            return result;
        });
    }
    wrap(locatorProto, 'fill', async (tour, self, call, [value, given]) => {
        tour.requireStep('locator.fill()');
        const locator = self;
        await tour.point(locator);
        const typing = typeof value === 'string' &&
            value.length > 0 &&
            value.length <= 400 &&
            !options(given).force &&
            (await locator.evaluate(typable).catch(() => false));
        if (!typing) {
            const result = await call(value, given);
            await tour.settle();
            return result;
        }
        // Typed key by key, as a person would, so what reacts to each key (autocomplete, validation) runs too.
        const timeout = options(given).timeout;
        await original.click.call(locator, { timeout });
        if (await locator.evaluate(el => (el instanceof HTMLElement && el.isContentEditable ? el.textContent : el.value)))
            await original.fill.call(locator, '', { timeout });
        await original.pressSequentially.call(locator, value, { delay: Math.min(tour.pace.typeDelay, 6000 / value.length), timeout });
        await tour.settle();
    });
    for (const name of ['pressSequentially', 'type']) {
        wrap(locatorProto, name, async (tour, self, call, [value, given]) => {
            tour.requireStep(`locator.${name}()`);
            await tour.point(self);
            const result = await call(value, { delay: tour.pace.typeDelay, ...options(given) });
            await tour.settle();
            return result;
        });
    }
    wrap(locatorProto, 'selectOption', async (tour, self, call, [values, given]) => {
        tour.requireStep('locator.selectOption()');
        const locator = self;
        const box = await tour.point(locator);
        const pick = box && !options(given).force ? await locator.evaluate(pickOption, values).catch(() => null) : null;
        if (box && pick)
            await tour.menu(box, pick);
        try {
            return await call(values, given);
        }
        finally {
            if (pick)
                await tour.ui('hideMenu');
            await tour.settle();
        }
    });
    // Navigation.
    for (const name of ['goto', 'reload', 'goBack', 'goForward']) {
        wrap(pageProto, name, async (tour, _self, call, args) => {
            tour.requireStep(`page.${name}()`);
            await tour.flush();
            const result = await call(...args);
            await tour.settle();
            return result;
        });
    }
    // page.click(selector) and the like act through a locator, so they look the same. Like Playwright's own,
    // they act on the first match unless { strict: true } is passed.
    for (const name of [
        'click',
        'dblclick',
        'tap',
        'check',
        'uncheck',
        'setChecked',
        'hover',
        'press',
        'fill',
        'type',
        'selectOption',
        'setInputFiles',
    ]) {
        const method = pageProto[name];
        if (typeof method !== 'function')
            continue;
        pageProto[name] = function (...args) {
            if (!active || active.busy || typeof args[0] !== 'string')
                return method.apply(this, args);
            const [selector, ...rest] = args;
            const locator = this.locator(selector);
            const target = options(rest.at(-1)).strict ? locator : locator.first();
            return target[name](...rest);
        };
    }
    // The keyboard acts on whatever has focus.
    for (const name of ['press', 'type', 'insertText']) {
        wrap(keyboardProto, name, async (tour, _self, call, [value, given]) => {
            tour.requireStep(`keyboard.${name}()`);
            await tour.flush();
            const result = await call(value, name === 'type' ? { delay: tour.pace.typeDelay, ...options(given) } : given);
            await tour.settle();
            return result;
        });
    }
}
// Repair context at a failure: visible elements with the attributes a locator can use. Runs in the page.
// Big pages would bury the relevant part, so the excerpt leads with the region around the element the
// tour last acted on and the last elements in <body>, where menus, popovers and dialogs usually mount.
function failureDom(node) {
    const target = node instanceof Element ? node : null;
    const keep = /^(id|class|role|name|type|placeholder|for|href|title|value|alt|aria-.*|data-test.*|data-state)$/;
    const excerpt = (root, limit) => {
        const lines = [];
        let size = 0;
        const add = (line) => {
            lines.push(line);
            size += line.length + 1;
        };
        const walk = (node, depth) => {
            if (size > limit)
                return;
            if (node.nodeType === Node.TEXT_NODE) {
                const text = (node.textContent ?? '').trim();
                if (text)
                    add(`${'  '.repeat(depth)}"${text.length > 200 ? `${text.slice(0, 200)}…` : text}"`);
                return;
            }
            if (!(node instanceof Element) || /^(SCRIPT|STYLE|SVG|TEMPLATE|svg)$/.test(node.tagName) || !node.checkVisibility())
                return;
            const attrs = [...node.attributes]
                .filter(attr => keep.test(attr.name))
                .map(attr => ` ${attr.name}="${attr.value.slice(0, 120)}"`)
                .join('');
            add(`${'  '.repeat(depth)}<${node.tagName.toLowerCase()}${attrs}>`);
            for (const child of node.childNodes)
                walk(child, depth + 1);
        };
        walk(root, 0);
        return lines.join('\n').slice(0, limit);
    };
    const sections = [];
    let region = null;
    if (target?.isConnected) {
        region = target;
        while (region.parentElement && region.parentElement !== document.body && excerpt(region, 1500).length < 1000)
            region = region.parentElement;
        sections.push(`Around the element the tour last acted on:\n${excerpt(region, 2500)}`);
    }
    const tail = [...document.body.children].slice(-4).filter(el => el.checkVisibility() && !el.contains(region));
    if (tail.length)
        sections.push(`Last elements in <body> (menus, popovers and dialogs usually mount here):\n${tail.map(el => excerpt(el, 1500)).join('\n')}`);
    const used = sections.join('\n\n').length;
    sections.push(`Whole page, truncated:\n${excerpt(document.body, Math.max(1500, 6000 - used))}`);
    return sections.join('\n\n');
}
export const test = base.extend({
    context: async ({ browser }, use) => {
        const { url, work, overlay, video, hide } = settings();
        const context = await browser.newContext({
            baseURL: url,
            viewport: SIZE,
            deviceScaleFactor: 1,
            // The overlay's styles must apply under any Content-Security-Policy the app sets.
            bypassCSP: true,
            ...(video ? { recordVideo: { dir: join(work, 'video'), size: SIZE } } : {}),
        });
        await context.addInitScript(hideDevTools, hide);
        await context.addInitScript({ path: overlay });
        await use(context);
        await context.close();
    },
    page: async ({ context }, use, testInfo) => {
        const { url, work, pace } = settings();
        const page = await context.newPage();
        patch(page);
        const tour = new Recorder(page, pace);
        const result = { status: 'failed', title: testInfo.title, steps: tour.steps };
        const write = () => writeFileSync(join(work, `result-${testInfo.testId}.json`), JSON.stringify(result));
        // The tour starts on the app's page, loaded as a user would see it first.
        try {
            await page.goto(url);
        }
        catch (error) {
            Object.assign(result, {
                status: 'error',
                error: `The app did not open at ${url}: ${firstLine(error)}\nStart the app, or pass the URL it runs at with --url.`,
            });
            write();
            throw error;
        }
        // Most apps fetch their data right after the load event. One that polls never goes quiet, so this wait is capped.
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        await tour.ui('card', 'Feature tour', testInfo.title, '');
        await tour.pause(pace.titleCard);
        await tour.ui('hideCard');
        await tour.pause(500);
        active = tour;
        try {
            await use(page);
        }
        finally {
            active = null;
        }
        await tour.flush();
        const unfinished = tour.steps.find(step => step.status !== 'passed');
        const failure = testInfo.errors[0];
        let error = failure
            ? text(failure.message ?? failure.value)
            : testInfo.status === 'passed'
                ? undefined
                : `The tour ${testInfo.status}.`;
        if (!error && !tour.steps.length)
            error = "The tour has no test.step. Show the change in steps, test.step('…', async () => { … }): each title is shown in the video.";
        if (!error && unfinished)
            error =
                unfinished.status === 'running'
                    ? `Step "${unfinished.title}" was still running when the test ended. Await every test.step.`
                    : `Step "${unfinished.title}" failed: ${unfinished.error}`;
        result.status = error ? 'failed' : 'passed';
        if (error) {
            result.error = error;
            const target = (await tour.lastTarget
                ?.first()
                .elementHandle({ timeout: 1000 })
                .catch(() => null)) ?? null;
            result.dom = await page.evaluate(failureDom, target).catch(() => undefined);
        }
        const passed = tour.steps.filter(step => step.status === 'passed').length;
        await tour.ui('clearNotices');
        await tour.ui('card', error ? 'Tour failed' : 'Tour passed', `${passed}/${tour.steps.length} steps passed`, error ? firstLine(error) : testInfo.title);
        await tour.pause(pace.endCard);
        write();
    },
    // Every tour is recorded, even one whose test never asks for the page.
    _record: [
        async ({ page }, use) => {
            void page;
            await use();
        },
        { auto: true },
    ],
});
// Each test.step shows its title as the step's notice. A step inside a step is part of it.
const step = test.step;
test.step = Object.assign((title, body, stepOptions) => step(title, async (info) => {
    const tour = active;
    if (!tour || tour.current)
        return body(info);
    const current = await tour.beginStep(title);
    try {
        const value = await body(info);
        await tour.endStep(current);
        return value;
    }
    catch (error) {
        await tour.endStep(current, { error });
        throw error;
    }
}, stepOptions), { skip: step.skip });
const label = (message) => (typeof message === 'string' ? message : options(message).message);
// Shows the expect's message as a check once its matcher passes or fails. A soft expect does not throw, so
// whether it failed is read from the errors the test has collected.
function shown(matchers, message) {
    return new Proxy(matchers, {
        get(target, property) {
            const value = Reflect.get(target, property);
            if (property === 'not' || property === 'resolves' || property === 'rejects')
                return shown(value, message);
            if (typeof value !== 'function')
                return value;
            return (...args) => {
                const tour = active;
                if (!tour)
                    return value.apply(target, args);
                const errors = test.info().errors.length;
                const failed = () => test.info().errors.length > errors;
                let result;
                try {
                    result = value.apply(target, args);
                }
                catch (error) {
                    tour.later(() => tour.check(message, false, error));
                    throw error;
                }
                if (!(result instanceof Promise)) {
                    tour.later(() => tour.check(message, !failed()));
                    return result;
                }
                return result.then(async (resolved) => {
                    await tour.check(message, !failed());
                    return resolved;
                }, async (error) => {
                    await tour.check(message, false, error);
                    throw error;
                });
            };
        },
    });
}
function withMessage(name, check) {
    return (actual, message) => {
        const text = label(message);
        if (typeof text !== 'string' || !text.trim())
            throw new TypeError(`${name}() needs a message as its second argument, such as ${name}(card, 'Card says Assigned to Ana').toBeVisible(): it is shown in the video.`);
        return shown(check(actual, message), text);
    };
}
export const expect = Object.assign(withMessage('expect', baseExpect), {
    soft: withMessage('expect.soft', baseExpect.soft),
    poll: withMessage('expect.poll', baseExpect.poll),
});
