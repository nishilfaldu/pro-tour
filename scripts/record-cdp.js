import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const [cdpUrl, targetUrl, output] = process.argv.slice(2);
if (!cdpUrl || !targetUrl || !output) throw new Error('Usage: record-cdp CDP_URL APP_URL OUTPUT.mp4');
const browser = await chromium.connectOverCDP(cdpUrl);
let page;
const deadline = Date.now() + 15_000;
while (!page && Date.now() < deadline) {
  page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith(targetUrl));
  if (!page) await new Promise(resolve => setTimeout(resolve, 100));
}
if (!page) throw new Error('Jev tab not found for recorder');
const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'mjpeg', '-r', '5', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], {
  env: { PATH: process.env.PATH }, stdio: ['pipe', 'ignore', 'pipe'],
});
let ffmpegError = '';
ffmpeg.stderr.on('data', chunk => { ffmpegError += chunk; });
let running = true;
process.stdin.on('data', () => { running = false; });
process.stdout.write('READY\n');
let frames = 0;
while (running || frames < 2) {
  const started = Date.now();
  const frame = await page.screenshot({ type: 'jpeg', quality: 85, timeout: 5000 });
  if (!ffmpeg.stdin.write(frame)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
  frames++;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 200 - (Date.now() - started))));
  if (!running && frames >= 2) break;
}
ffmpeg.stdin.end();
const code = await new Promise(resolve => ffmpeg.on('close', resolve));
await browser.close();
if (code !== 0) throw new Error(`Recorder ffmpeg failed: ${ffmpegError.slice(0, 300)}`);
await writeFile(`${output}.frames`, String(frames));
process.stdout.write(`DONE ${frames}\n`);
