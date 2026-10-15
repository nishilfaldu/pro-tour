import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { failedLocator } from '../src/record.ts';

test("a failure names the locator it is about, from an expect's Locator line or what an action waited for", () => {
  assert.deepEqual(
    failedLocator(
      "TimeoutError: locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for getByRole('link', { name: 'See how it works' }) to be visible\n",
    ),
    { locator: "getByRole('link', { name: 'See how it works' })" },
  );
  assert.deepEqual(
    failedLocator(
      'Error: 1 task in view\n\nexpect(locator).toHaveText(expected) failed\n\nLocator:  locator(\'#visible-count\')\nExpected: "7"',
    ),
    { locator: "locator('#visible-count')" },
  );
  // Named in the first line already.
  assert.deepEqual(
    failedLocator(
      "Error: locator.click: Error: strict mode violation: getByText('Saved') resolved to 2 elements:\nCall log:\n  - waiting for getByText('Saved')",
    ),
    {},
  );
  assert.deepEqual(failedLocator('Error: The tour has no test.step.'), {});
});
