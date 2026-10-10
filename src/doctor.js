// Read-only setup checks with the command that fixes each problem. No app startup, nothing published.
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';
import { githubEnv } from './publish.js';

const run = (command, args, env) => new Promise(done => {
  execFile(command, args, { env, timeout: 30_000, encoding: 'utf8' }, (error, stdout, stderr) => done({ ok: !error, out: `${stdout}${stderr}` }));
});

export async function doctor({ channel = 'chromium' } = {}) {
  const checks = [];
  const add = (name, ok, fix) => checks.push({ name, ok, fix });

  const [major] = process.versions.node.split('.').map(Number);
  add(`Node.js ${process.versions.node}`, major >= 20, 'Install Node.js 20 or newer.');

  const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true }).catch(error => error);
  if (browser instanceof Error) add(`Browser (${channel})`, false, channel === 'chromium' ? 'pnpm exec playwright install --with-deps chromium' : `Install ${channel}, or use --channel chromium.`);
  else {
    add(`Browser (${channel})`, true);
    await browser.close();
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    add(tool, (await run(tool, ['-version'])).ok, 'Install ffmpeg (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt-get install ffmpeg).');
  }

  const env = githubEnv();
  const help = await run('gh', ['pr', 'comment', '--help'], env);
  add('GitHub CLI with --attach', help.ok && help.out.includes('--attach'), 'Install or update gh (https://cli.github.com) until `gh pr comment --help` lists --attach.');
  const auth = await run('gh', ['auth', 'status'], env);
  add(`GitHub auth (${process.env.GH_MEDIA_TOKEN ? 'GH_MEDIA_TOKEN' : 'gh login'})`, auth.ok, 'Run gh auth login.');
  return checks;
}
