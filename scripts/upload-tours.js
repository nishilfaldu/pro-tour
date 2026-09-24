import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export function commentBody(full, focused) {
  return `Full tour\n\n![](${full})\n\nFocused tour\n\n![](${focused})\n`;
}

function gh(args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('gh', args, { env, stdio: ['ignore', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise() : reject(new Error(`GitHub upload failed (${code})`)));
  });
}

export async function uploadTours(repo, number, fullPath, focusedPath) {
  if (!process.env.GH_MEDIA_TOKEN) throw new Error('GH_MEDIA_TOKEN is required');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(String(number))) throw new Error('Invalid PR target');
  const files = [resolve(fullPath), resolve(focusedPath)];
  if (files[0] === files[1]) throw new Error('Expected two separate videos');
  for (const file of files) {
    if (!file.endsWith('.mp4') || (await stat(file)).size < 1024) throw new Error('Expected a nonempty MP4 video');
  }
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: process.env.GH_MEDIA_TOKEN };
  const help = await new Promise((resolvePromise, reject) => {
    const child = spawn('gh', ['pr', 'comment', '--help'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('close', code => code === 0 ? resolvePromise(output) : reject(new Error('GitHub CLI unavailable')));
    child.on('error', reject);
  });
  if (!help.includes('--attach')) throw new Error('GitHub CLI version lacks media --attach support');
  const directory = await mkdtemp(join(tmpdir(), 'pro-tour-comment-'));
  try {
    const body = join(directory, 'body.md');
    await writeFile(body, commentBody(files[0], files[1]));
    await gh(['pr', 'comment', String(number), '--repo', repo, '--body-file', body, '--attach', files[0], '--attach', files[1]], env);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await uploadTours(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
}
