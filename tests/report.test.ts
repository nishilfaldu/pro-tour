import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { markdown } from '../src/report.ts';
import type { Report } from '../src/types.ts';

const report: Report = {
  title: 'Filter <b>by</b> assignee',
  summary: 'Narrow the board & focus.',
  url: 'http://localhost:3000',
  tourSha: 'tour',
  appTree: 'tree',
  status: 'failed',
  error: 'Check failed: <Empty> state',
  seconds: 12.5,
  steps: [
    {
      index: 1,
      title: 'Pick Priya',
      status: 'passed',
      covers: ['filter'],
      seconds: 4,
      checks: [
        { label: '2 of 4 tasks', kind: 'text', passed: true, changed: true },
        { label: 'Header still shown', kind: 'visible', passed: true, changed: false },
      ],
    },
    { index: 2, title: 'Clear the filter', status: 'failed', covers: [], seconds: 6, checks: [], error: 'locator.click: Timeout' },
  ],
  coverage: [
    { id: 'filter', description: 'Picking a person shows their tasks', steps: [1] },
    { id: 'empty', description: 'No match shows an empty state', steps: [] },
  ],
};

test('the comment shows the result, the video, the behavior checklist and collapsed steps', () => {
  const body = markdown(report, 'VIDEO', '0123456789abcdef');
  assert.equal(
    body,
    [
      '### Feature tour: Filter &lt;b&gt;by&lt;/b&gt; assignee',
      '',
      'Narrow the board &amp; focus.',
      '',
      '**Failed**: 1/2 steps · 12.5s video of 0123456',
      '',
      '> ✗ Check failed: &lt;Empty&gt; state',
      '',
      'VIDEO',
      '',
      '**What this PR does**',
      '',
      '- ✓ Picking a person shows their tasks (step 1)',
      '- ✗ No match shows an empty state (not shown)',
      '',
      '<details><summary><b>Steps and checks</b></summary>\n',
      '- ✓ **Pick Priya** (4s)',
      '  - ✓ 2 of 4 tasks',
      '  - ✓ Header still shown _(already true before)_',
      '- ✗ **Clear the filter** (6s)',
      '  - ✗ locator.click: Timeout',
      '',
      '</details>',
      '',
    ].join('\n'),
  );
});
