// Read-only setup checks with the command that fixes each problem. No app startup, nothing published.
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';
import { browserFix } from './record.js';
const run = (command, args, env) => new Promise(done => {
    execFile(command, args, { env, timeout: 30_000, encoding: 'utf8' }, (error, stdout, stderr) => done({ ok: !error, out: `${stdout}${stderr}` }));
});
export async function doctor({ channel = 'chromium' } = {}) {
    const checks = [];
    const add = (name, ok, fix) => checks.push({ name, ok, fix });
    // Tours are .ts files that Node loads by stripping their types, which needs 22.18.
    const [major, minor] = process.versions.node.split('.').map(Number);
    add(`Node.js ${process.versions.node}`, major > 22 || (major === 22 && minor >= 18), 'Install Node.js 22.18 or newer.');
    const browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true }).catch(error => error);
    if (browser instanceof Error)
        add(`Browser (${channel})`, false, `${browser.message.split('\n')[0]}\n    ${browserFix(browser, channel)}`);
    else {
        add(`Browser (${channel})`, true);
        await browser.close();
    }
    for (const tool of ['ffmpeg', 'ffprobe']) {
        add(tool, (await run(tool, ['-version'])).ok, 'Install ffmpeg (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt-get install ffmpeg).');
    }
    const help = await run('gh', ['pr', 'comment', '--help']);
    add('GitHub CLI with --attach', help.ok && help.out.includes('--attach'), 'Install or update gh (https://cli.github.com) until `gh pr comment --help` lists --attach.');
    const auth = await run('gh', ['auth', 'status']);
    add('GitHub CLI logged in', auth.ok, 'Run gh auth login.');
    return checks;
}
