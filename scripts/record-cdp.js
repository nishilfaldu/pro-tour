import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const [cdpUrl, targetUrl, output] = process.argv.slice(2);
if (!cdpUrl || !targetUrl || !output) throw new Error('Usage: record-cdp CDP_URL APP_URL OUTPUT.mp4');
if (!process.env.DISPLAY) throw new Error('DISPLAY is required for screen recording');
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
