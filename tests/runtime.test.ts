import { strict as assert } from 'node:assert';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from 'playwright';
import { createAppServer } from '../sample-app/server.js';
import { type Pace, Tour } from '../src/runtime.ts';
import type { Check } from '../src/types.ts';

const overlay = fileURLToPath(new URL('../src/overlay.js', import.meta.url));
const fast = {
  move: 0,
  afterAction: 0,
  typeDelay: 0,
  stepIntro: 0,
  stepOutro: 0,
  checkTimeout: 600,
  chip: 0,
  failHold: 0,
  menu: 0,
  actionTimeout: 1000,
};
let server: Server;
let browser: Browser;

before(async () => {
  server = createAppServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser.close();
  server.close();
});

async function board(pace: Partial<Pace> = {}) {
  const context = await browser.newContext({ bypassCSP: true, baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  await context.addInitScript({ path: overlay });
  const page = await context.newPage();
  await page.goto('/');
  const t = new Tour(page, {
    pace: { ...fast, ...pace },
    behaviors: {
      'filter-done': 'Filtering to Done shows only finished tasks',
      'filter-progress': 'Filtering to In progress shows active work',
    },
  });
  return {
    t,
    page,
    filter: page.getByRole('combobox', { name: 'Status', exact: true }),
    heading: (name: string) => page.getByRole('heading', { name }),
  };
}

test('a step passes when a check changes, and records which checks were already true', async () => {
  const { t, page, filter, heading } = await board();
  await t.step('Filter to Done', () => t.select(filter, 'Done'), [
    t.text('1 task in view', page.locator('#visible-count'), '1'),
    t.visible('Done task is shown', heading('Approve color palette')),
    t.hidden('To do task is hidden', heading('Draft release notes')),
  ]);
  assert.deepEqual(
    t.steps[0].checks.map(check => [check.label, check.passed, check.changed]),
    [
      ['1 task in view', true, true],
      ['Done task is shown', true, false],
      ['To do task is hidden', true, true],
    ],
  );
  await page.context().close();
});

test("a check cannot see the overlay's caption or chips, only the app", async () => {
  const { t, page, filter } = await board();
  await assert.rejects(
    t.step('Filter to Done: a Nice work notice appears', () => t.select(filter, 'Done'), [
      t.text('1 task in view', page.locator('#visible-count'), '1'),
      t.visible('Nice work notice', page.getByText('Nice work')),
    ]),
    /Check failed: Nice work notice/,
  );
  await page.context().close();
});

test('a step whose checks were all true before its actions fails', async () => {
  const { t, filter, heading } = await board();
  await assert.rejects(
    t.step('Filter to Done', () => t.select(filter, 'Done'), [t.visible('Done task is shown', heading('Approve color palette'))]),
    /changed nothing/,
  );
  assert.equal(t.steps[0].status, 'failed');
  await t.page.context().close();
});

test('a hidden check on something that was never visible fails', async () => {
  const { t, page, filter, heading } = await board();
  await assert.rejects(
    t.step('Filter to Done', () => t.select(filter, 'Done'), [
      t.text('1 task in view', page.locator('#visible-count'), '1'),
      t.hidden('Misspelled task is hidden', heading('Draft relase notes')),
    ]),
    /hidden before and after every action in the step/,
  );
  await page.context().close();
});

test('something shown and dismissed within one step counts as a change', async () => {
  const { t, page } = await board();
  await t.step('Open and cancel the new task dialog', async () => {
    await t.click(page.getByRole('button', { name: 'New task' }));
    await t.click(page.getByRole('button', { name: 'Cancel' }));
  }, [t.hidden('Dialog is closed again', page.getByRole('dialog'))]);
  assert.equal(t.steps[0].checks[0].changed, true);
  await page.context().close();
});

test('value reads a select by its visible label, and builders reject missing arguments', async () => {
  const { t, filter } = await board();
  await t.step('Filter to Done', () => t.select(filter, 'Done'), [t.value('Filter reads Done', filter, 'Done')]);
  const missingText = () =>
    // @ts-expect-error: the missing expected text is caught by the type checker and at run time.
    t.text('Board shows two tasks', filter);
  assert.throws(missingText, /t.text\("Board shows two tasks", ...\) needs the expected text as argument 3/);
  // @ts-expect-error: a string is not a locator.
  assert.throws(() => t.visible('Done task', 'Approve color palette'), /needs a Playwright locator as argument 2/);
  await t.page.context().close();
});

test('a step whose check list holds something other than a check fails clearly', async () => {
  const { t, filter } = await board();
  // @ts-expect-error: undefined is not a check.
  const notChecks: Check[] = [undefined];
  await assert.rejects(
    t.step('Filter to Done', () => t.select(filter, 'Done'), notChecks),
    /Check 1 of step "Filter to Done" is not a check/,
  );
  await t.page.context().close();
});

test('checks are evaluated together right after the actions, so short-lived feedback is caught', async () => {
  const { t, page, filter } = await board({ chip: 400 });
  // A banner that appears on filtering and disappears 600ms later, like a "Copied!" tooltip.
  await page.evaluate(() =>
    document.querySelector('#status-filter')?.addEventListener('change', () => {
      const note = Object.assign(document.createElement('p'), { id: 'flash', textContent: 'Filtered' });
      document.body.append(note);
      setTimeout(() => note.remove(), 600);
    }),
  );
  await t.step('Filter to Done', () => t.select(filter, 'Done'), [
    t.text('1 task in view', page.locator('#visible-count'), '1'),
    t.value('Filter reads Done', filter, 'Done'),
    t.visible('Filtered banner', page.locator('#flash')),
  ]);
  assert.equal(t.steps[0].status, 'passed');
  await page.context().close();
});

test('a check too slow to sample is not counted as changed, and a check that throws counts as false', async () => {
  const { t, filter } = await board();
  const slowAndTrue = t.check('Always true, slowly', () => new Promise<boolean>(resolve => setTimeout(resolve, 1700, true)));
  await assert.rejects(
    t.step('Filter to Done', () => t.select(filter, 'Done'), [slowAndTrue]),
    /changed nothing/,
  );
  let picked = false;
  const throwsUntilPicked = t.check('Picked', () => {
    if (!picked) throw new Error('not yet');
    return true;
  });
  await t.step('Filter to To do', async () => {
    await t.select(filter, 'To do');
    picked = true;
  }, [throwsUntilPicked]);
  assert.equal(t.steps[1].status, 'passed');
  await t.page.context().close();
});

test('an action on an element that never appears fails after the action timeout', async () => {
  const { t, page } = await board();
  const started = Date.now();
  await assert.rejects(
    t.step('Dismiss the banner', () => t.click(page.getByRole('button', { name: 'Dismiss' })), [
      t.hidden('Banner', page.locator('#banner')),
    ]),
    /Timeout 1000ms exceeded/,
  );
  assert.ok(Date.now() - started < 3000);
  await page.context().close();
});

test('goto and press are actions the runner samples after', async () => {
  const { t, page } = await board();
  await t.step('Open and dismiss the new task dialog with the keyboard', async () => {
    await t.goto('/');
    await t.click(page.getByRole('button', { name: 'New task' }));
    await t.press('Escape');
  }, [t.hidden('Dialog is dismissed', page.getByRole('dialog'))]);
  assert.equal(t.steps[0].checks[0].changed, true);
  await page.context().close();
});

test('a step without checks fails, and a missing element fails a text check quickly', async () => {
  const { t, page, filter } = await board();
  await assert.rejects(
    t.step('Filter to Done', () => t.select(filter, 'Done')),
    /has no checks/,
  );
  const started = Date.now();
  await assert.rejects(
    t.step('Filter to To do', () => t.select(filter, 'To do'), [t.text('Missing counter reads 2', page.locator('#nope'), '2')]),
    /Check failed: Missing counter reads 2/,
  );
  assert.ok(Date.now() - started < 5000, 'text check on a missing element should not wait for the 30s default');
  await page.context().close();
});

test('a tour fails if it ran no steps, left a step running, or caught a failed step', async () => {
  const { t, page, filter } = await board();
  await assert.rejects(t.finish(), /ran no steps/);
  const count = page.locator('#visible-count');
  const pending = t.step('Filter to Done', () => t.select(filter, 'Done'), [t.text('1 task in view', count, '1')], {
    covers: ['filter-done'],
  });
  await assert.rejects(t.finish(), /"Filter to Done" was still running when run\(\) returned/);
  await pending;
  await t
    .step('Filter to To do', () => t.select(filter, 'To do'), [t.text('Nothing in view', count, '0')], { covers: ['filter-progress'] })
    .catch(() => {});
  await assert.rejects(t.finish(), /Step "Filter to To do" failed: Check failed: Nothing in view/);
  await page.context().close();
});

test('coverage: every behavior needs a passing step that covers it', async () => {
  const { t, page, filter } = await board();
  const count = page.locator('#visible-count');
  await t.step('Filter to Done', () => t.select(filter, 'Done'), [t.text('1 task in view', count, '1')], { covers: ['filter-done'] });
  await assert.rejects(t.finish(), /Behavior "filter-progress" .* is not shown by any passing step/);
  await t.step(
    'Filter to In progress',
    () => t.select(filter, 'In progress'),
    [t.hidden('Done task is hidden', page.getByRole('heading', { name: 'Approve color palette' }))],
    { covers: ['filter-progress'] },
  );
  await t.finish();
  assert.deepEqual(
    t.coverage().map(behavior => [behavior.id, behavior.steps]),
    [
      ['filter-done', [1]],
      ['filter-progress', [2]],
    ],
  );
  await page.context().close();
});

test('a step may not cover an id missing from meta.behaviors', async () => {
  const { t, page, filter } = await board();
  await assert.rejects(
    t.step('Filter to To do', () => t.select(filter, 'To do'), [t.text('1 task in view', page.locator('#visible-count'), '1')], {
      covers: ['filter-todo'],
    }),
    /covers "filter-todo", which is not in meta.behaviors/,
  );
  await page.context().close();
});
