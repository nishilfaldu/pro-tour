import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { markdown } from '../src/report.ts';
import type { TourResult } from '../src/types.ts';

const HEAD = '0123456789abcdef';
const result: TourResult = {
  title: 'Filter <b>by</b> assignee',
  status: 'failed',
  error: 'Card says <Empty> state',
  seconds: 12.5,
  commit: HEAD,
  dirty: false,
  steps: [
    {
      title: 'Pick Priya',
      at: 3.4,
      status: 'passed',
      checks: [
        { label: '2 of 4 tasks', passed: true },
        { label: 'Header & toolbar still shown', passed: true },
      ],
    },
    { title: 'Clear the filter', at: 71.9, status: 'failed', checks: [], error: 'locator.click: Timeout' },
  ],
};

test('the comment shows the result, which code it shows, the video and collapsed steps', () => {
  assert.equal(
    markdown(result, 'VIDEO', HEAD),
    [
      '### Feature tour: Filter &lt;b&gt;by&lt;/b&gt; assignee',
      '',
      "**✗ Failed** · 2 steps · 12.5s · recorded at `0123456`, this PR's head",
      '',
      '> ✗ Card says &lt;Empty&gt; state',
      '',
      'VIDEO',
      '',
      '<details><summary><b>Steps</b></summary>',
      '',
      '- ✓ **Pick Priya** · 0:03',
      '  - ✓ 2 of 4 tasks',
      '  - ✓ Header &amp; toolbar still shown',
      '- ✗ **Clear the filter** · 1:11',
      '  - ✗ locator.click: Timeout',
      '',
      '</details>',
      '',
    ].join('\n'),
  );
});

test('the comment says plainly when the video is not of the PR head, or had uncommitted changes', () => {
  const line = (change: Partial<TourResult>) => markdown({ ...result, status: 'passed', ...change }, 'VIDEO', HEAD).split('\n')[2];
  assert.equal(
    line({ commit: 'fedcba9876543210' }),
    "**✓ Passed** · 2 steps · 12.5s · recorded at `fedcba9`, not this PR's head (`0123456`)",
  );
  assert.equal(line({ dirty: true }), "**✓ Passed** · 2 steps · 12.5s · recorded at `0123456`, this PR's head, plus uncommitted changes");
  assert.equal(line({ commit: null, steps: [result.steps[0]] }), '**✓ Passed** · 1 step · 12.5s · recorded before the first commit');
});
