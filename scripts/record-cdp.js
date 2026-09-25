import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const [cdpUrl, targetUrl, output] = process.argv.slice(2);
if (!cdpUrl || !targetUrl || !output) throw new Error('Usage: record-cdp CDP_URL APP_URL OUTPUT.mp4');
if (!process.env.DISPLAY) throw new Error('DISPLAY is required for screen recording');
let target;
const deadline = Date.now() + 15_000;
while (!target && Date.now() < deadline) {
  const pages = await (await fetch(`${cdpUrl}/json/list`)).json();
  target = pages.find(page => page.type === 'page' && page.url.startsWith(targetUrl));
  if (!target) await new Promise(resolve => setTimeout(resolve, 100));
}
if (!target) throw new Error('Jev tab not found for screen recording');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Could not activate Jev tab')), 5000);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout);
    if (message.error) reject(new Error(message.error.message));
    else resolve();
  });
  socket.send(JSON.stringify({ id: 1, method: 'Page.bringToFront' }));
});
socket.close();
const ffmpeg = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'x11grab', '-video_size', '1280x800', '-framerate', '5', '-i', process.env.DISPLAY,
  '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
], { env: { PATH: process.env.PATH, DISPLAY: process.env.DISPLAY }, stdio: ['ignore', 'ignore', 'pipe'] });
let error = '';
ffmpeg.stderr.on('data', chunk => { error += chunk; });
ffmpeg.on('error', cause => { error += cause.message; });
const stop = new Promise(resolve => process.stdin.once('data', resolve));
process.stdout.write('READY\n');
await stop;
ffmpeg.kill('SIGINT');
const code = ffmpeg.exitCode ?? await new Promise(resolve => ffmpeg.once('close', resolve));
if (code !== 0 && code !== 255) throw new Error(`Recorder ffmpeg failed: ${error.slice(0, 500)}`);
if ((await stat(output)).size < 1024) throw new Error('Recorder produced an empty video');
process.stdout.write('DONE\n');
