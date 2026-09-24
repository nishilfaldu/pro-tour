import { readFileSync } from 'node:fs';

export function needsTour(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Expected a nonempty PR file list');
  return files.some(name => {
    if (typeof name !== 'string' || !name) throw new Error('Invalid PR filename');
    return !(
      name.startsWith('docs/') ||
      name.startsWith('.github/ISSUE_TEMPLATE/') ||
      /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE)(\.[^/]*)?$/i.test(name) ||
      /\.(md|mdx|txt)$/i.test(name)
    );
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const files = JSON.parse(readFileSync(0, 'utf8'));
  process.stdout.write(`run=${needsTour(files)}\n`);
}
