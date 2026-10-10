import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgent } from '../tours/agent.js';

const behaviors = { 'filter-done': 'Filtering to Done shows only finished tasks' };
const tour = (title, extra = behaviors) => `export const meta = { title: '${title}', behaviors: ${JSON.stringify(extra)} };\nexport async function run() {}\n`;

// Planner stub: hands out the given sources in order and records what it was asked.
function planner(...sources) {
  const calls = [];
  return {
    calls,
    async listBehaviors() {
      calls.push('behaviors');
      return { behaviors, seconds: 1, usage: { input: 10, cached: 0, output: 1, reasoning: 0 } };
    },
    async writeTour(_, repair) {
      calls.push(repair.previous ? `repair after: ${repair.report.error}` : 'write');
      return { source: sources.shift(), notes: '', seconds: 1, usage: { input: 10, cached: 0, output: 1, reasoning: 0 } };
    },
  };
}

// Record stub: a tour passes when its title is "pass".
const record = async t => (t.meta.title === 'pass' ? { status: 'passed' } : { status: 'failed', error: `${t.meta.title} failed`, failure: { message: 'detail' } });

async function scratch() {
  return join(await mkdtemp(join(tmpdir(), 'agent-test-')), 'feature.tour.js');
}

test('a saved tour that still passes is replayed without calling the model', async () => {
  const tourPath = await scratch();
  await writeFile(tourPath, tour('pass'));
  const plan = planner();
  const result = await runAgent({ tourPath, planner: plan, record });
  assert.equal(result.status, 'passed');
  assert.deepEqual(plan.calls, []);
  assert.deepEqual(result.history.map(item => item.kind), ['replay']);
});

test('a new tour is planned, repaired from each failure, and written only once it passes', async () => {
  const tourPath = await scratch();
  const plan = planner(tour('first'), tour('second'), tour('pass'));
  const result = await runAgent({ tourPath, planner: plan, record });
  assert.equal(result.status, 'passed');
  assert.deepEqual(plan.calls, ['behaviors', 'write', 'repair after: first failed', 'repair after: second failed']);
  assert.equal(await readFile(tourPath, 'utf8'), tour('pass'));
});

test('repairs stop at the budget and leave the tour file untouched', async () => {
  const tourPath = await scratch();
  await writeFile(tourPath, tour('broken'));
  const plan = planner(tour('a'), tour('b'), tour('pass'));
  const result = await runAgent({ tourPath, rounds: 2, planner: plan, record });
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.history.map(item => item.kind), ['replay', 'repair', 'repair']);
  assert.equal(await readFile(tourPath, 'utf8'), tour('broken'), 'the saved tour is kept when no attempt passes');
});

test('a tour that edits the behavior list or does not load counts as a failed round', async () => {
  const tourPath = await scratch();
  const plan = planner(tour('pass', { 'filter-done': 'Something else' }), 'export const meta = {', tour('pass'));
  const result = await runAgent({ tourPath, planner: plan, record });
  assert.equal(result.status, 'passed');
  assert.match(plan.calls[2], /repair after: meta.behaviors must be exactly/);
  assert.match(plan.calls[3], /repair after: Tour module failed to load/);
});
