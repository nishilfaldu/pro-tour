// Read-only setup checks with the command that fixes each problem. No app startup, nothing published.
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';
import { githubEnv } from './publish.ts';

const run = (command: string, args: string[], env?: NodeJS.ProcessEnv) =>
  new Promise<{ ok: boolean; out: string }>(done => {
    execFile(command, args, { env, timeout: 30_000, encoding: 'utf8' }, (error, stdout, stderr) =>
      done({ ok: !error, out: `${stdout}${stderr}` }),
    );
  });

export interface DoctorCheck {
  name: string;
  ok: boolean;
  fix?: string;
}

export async function doctor({ channel = 'chromium' }: { channel?: string } = {}): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const add = (name: string, ok: boolean, fix?: string) => checks.push({ name, ok, fix });

  const [major] = process.versions.node.split('.').map(Number);
  add(`Node.js ${process.versions.node}`, major >= 20, 'Install Node.js 20 or newer.');

  const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true }).catch(error => error);
  if (browser instanceof Error) {
    const missing = /Executable doesn't exist|install/i.test(browser.message);
    add(
      `Browser (${channel})`,
      false,
      missing
        ? channel === 'chromium'
          ? 'pnpm exec playwright install --with-deps chromium'
          : `Install ${channel}, or use --channel chromium.`
        : `It is installed but could not start: ${browser.message.split('\n')[0]}. Inside a coding agent's sandbox (such as Codex on macOS) a browser cannot run; run pro-tour outside the sandbox.`,
    );
  } else {
    add(`Browser (${channel})`, true);
    await browser.close();
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    add(
      tool,
      (await run(tool, ['-version'])).ok,
      'Install ffmpeg (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt-get install ffmpeg).',
    );
  }

  const env = githubEnv();
  const help = await run('gh', ['pr', 'comment', '--help'], env);
  add(
    'GitHub CLI with --attach',
    help.ok && help.out.includes('--attach'),
    'Install or update gh (https://cli.github.com) until `gh pr comment --help` lists --attach.',
  );
  const auth = await run('gh', ['auth', 'status'], env);
  add(`GitHub auth (${process.env.GH_MEDIA_TOKEN ? 'GH_MEDIA_TOKEN' : 'gh login'})`, auth.ok, 'Run gh auth login.');
  return checks;
}
