import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parsePlan } from '../scripts/plan-tours.js';
import { commentBody } from '../scripts/upload-tours.js';

test('Grok planner response is parsed and both goals required', () => {
  const result = { type: 'result', is_error: false, result: 'Here is the plan:\n{"full":["Click Reset demo first.","Create a task and edit it."],"focused":["Click Reset demo first.","Filter Done tasks and verify absence."]}' };
  assert.deepEqual(parsePlan(JSON.stringify(result)), { full: ['Click Reset demo first.', 'Create a task and edit it.'], focused: ['Click Reset demo first.', 'Filter Done tasks and verify absence.'] });
  assert.throws(() => parsePlan(JSON.stringify({ ...result, result: '{"full":["short"],"focused":["short"]}' })));
});

test('PR comment has exactly two video paragraphs and brief labels', () => {
  const body = commentBody('/tmp/full.mp4', '/tmp/focused.mp4');
  assert.equal(body, 'Full tour\n\n![](/tmp/full.mp4)\n\nFocused tour\n\n![](/tmp/focused.mp4)\n');
});
