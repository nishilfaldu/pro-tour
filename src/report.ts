// The PR comment for a tour's recording.
// Agents write the tour text, so HTML in it is escaped.
import type { TourResult } from './types.ts';

const text = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Which code the video shows. showsHead says the code it was recorded with is the head's, even if it was not
// committed yet; without it, the commit decides.
function recordedAt({ commit, dirty }: TourResult, head: string, showsHead?: boolean): string {
  if (showsHead) return `recorded at \`${head.slice(0, 7)}\`, this PR's head`;
  const at = !commit
    ? 'recorded before the first commit'
    : commit === head
      ? `recorded at \`${commit.slice(0, 7)}\`, this PR's head`
      : `recorded at \`${commit.slice(0, 7)}\`, not this PR's head (\`${head.slice(0, 7)}\`)`;
  return dirty ? `${at}, plus uncommitted changes` : at;
}

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function markdown(result: TourResult, video: string, head: string, showsHead?: boolean): string {
  const passed = result.status === 'passed';
  const steps = result.steps.length;
  const lines = [
    `### Feature tour: ${text(result.title)}`,
    '',
    `**${passed ? '✓ Passed' : '✗ Failed'}** · ${steps} ${steps === 1 ? 'step' : 'steps'} · ${result.seconds}s · ${recordedAt(result, head, showsHead)}`,
    '',
  ];
  if (!passed && result.error) lines.push(`> ✗ ${text(result.error)}`, '');
  lines.push(video, '');
  if (steps) {
    lines.push('<details><summary><b>Steps</b></summary>', '');
    for (const step of result.steps) {
      lines.push(`- ${step.status === 'passed' ? '✓' : '✗'} **${text(step.title)}**${step.at === undefined ? '' : ` · ${time(step.at)}`}`);
      for (const check of step.checks) lines.push(`  - ${check.passed ? '✓' : '✗'} ${text(check.label)}`);
      if (step.error && !step.checks.some(check => !check.passed)) lines.push(`  - ✗ ${text(step.error)}`);
    }
    lines.push('', '</details>');
  }
  return `${lines.join('\n')}\n`;
}
