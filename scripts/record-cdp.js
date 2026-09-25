import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const [cdpUrl, targetUrl, output] = process.argv.slice(2);
if (!cdpUrl || !targetUrl || !output) throw new Error('Usage: record-cdp CDP_URL APP_URL OUTPUT.mp4');
let target;
const deadline = Date.now() + 15_000;
while (!target && Date.now() < deadline) {
  const pages = await (await fetch(`${cdpUrl}/json/list`)).json();
  target = pages.find(page => page.type === 'page' && page.url.startsWith(targetUrl));
  if (!target) await new Promise(resolve => setTimeout(resolve, 100));
}
if (!target) throw new Error('Jev tab not found for recorder');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timeout);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function command(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out`));
    }, 10_000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'mjpeg', '-r', '5', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], {
  env: { PATH: process.env.PATH }, stdio: ['pipe', 'ignore', 'pipe'],
});
let ffmpegError = '';
ffmpeg.stderr.on('data', chunk => { ffmpegError += chunk; });
ffmpeg.on('error', error => { ffmpegError += error.message; });
let running = true;
process.stdin.on('data', () => { running = false; });
process.stdout.write('READY\n');
let frames = 0;
try {
  while (running || frames < 2) {
    const started = Date.now();
    const { data } = await command('Page.captureScreenshot', { format: 'jpeg', quality: 85, fromSurface: true });
    if (!ffmpeg.stdin.write(Buffer.from(data, 'base64'))) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    frames++;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 200 - (Date.now() - started))));
  }
} finally {
  socket.close();
  ffmpeg.stdin.end();
}
const code = ffmpeg.exitCode ?? await new Promise(resolve => ffmpeg.once('close', resolve));
if (code !== 0) throw new Error(`Recorder ffmpeg failed: ${ffmpegError.slice(0, 300)}`);
await writeFile(`${output}.frames`, String(frames));
process.stdout.write(`DONE ${frames}\n`);
// Chrome does not always complete the CDP WebSocket close handshake on CI.
process.exit(0);
