// The PR comment for a tour's recording.
// Tour text comes from model-written scripts, so HTML in it is escaped.
import type { Report } from './types.ts';

const text = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function markdown(report: Report, video: string, commit: string): string {
  const passed = report.steps.filter(step => step.status === 'passed').length;
  const lines = [
    `### Feature tour: ${text(report.title)}`,
    '',
    text(report.summary),
    '',
    `**${report.status === 'passed' ? 'Passed' : 'Failed'}**: ${passed}/${report.steps.length} steps · ${report.seconds}s video of ${commit.slice(0, 7)}`,
    '',
  ];
  if (report.status !== 'passed' && report.error) lines.push(`> ✗ ${text(report.error)}`, '');
  lines.push(video, '');
  if (report.coverage?.length) {
    lines.push('**What this PR does**', '');
    for (const behavior of report.coverage) {
      const where = behavior.steps.length ? `step ${behavior.steps.join(', ')}` : 'not shown';
      lines.push(`- ${behavior.steps.length ? '✓' : '✗'} ${text(behavior.description)} (${where})`);
    }
    lines.push('');
  }
  lines.push('<details><summary><b>Steps and checks</b></summary>\n');
  for (const step of report.steps) {
    lines.push(`- ${step.status === 'passed' ? '✓' : '✗'} **${text(step.title)}** (${step.seconds}s)`);
    for (const check of step.checks)
      lines.push(`  - ${check.passed ? '✓' : '✗'} ${text(check.label)}${check.passed && !check.changed ? ' _(already true before)_' : ''}`);
    if (step.error && !step.checks.some(check => !check.passed)) lines.push(`  - ✗ ${text(step.error)}`);
  }
  lines.push('', '</details>');
  return `${lines.join('\n')}\n`;
}
