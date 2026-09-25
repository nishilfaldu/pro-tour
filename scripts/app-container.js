import { readFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export async function loadConfig(prDirectory) {
  const root = await realpath(prDirectory);
  for (const name of ['.env', '.env.local', '.npmrc']) {
    try {
      await lstat(join(root, name));
      throw new Error(`PR app directory contains prohibited credential file: ${name}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const path = join(root, 'pro-tour.config.json');
  const meta = await lstat(path);
  if (!meta.isFile() || meta.isSymbolicLink()) throw new Error('Configuration must be a regular file');
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (typeof config.install !== 'string' || !config.install.trim() ||
      typeof config.start !== 'string' || !config.start.trim() ||
      typeof config.url !== 'string') throw new Error('Invalid tour configuration');
  const url = new URL(config.url);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username || url.password || url.hash ||
      !Number.isInteger(Number(url.port)) || Number(url.port) < 1024 || Number(url.port) > 65535) {
    throw new Error('Tour URL must be local HTTP with an explicit unprivileged port');
  }
  return { root, install: config.install, start: config.start, url, port: Number(url.port) };
}

export function containerArgs(config) {
  const script = `${config.install}\nexec ${config.start}`;
  return [
    'run', '--detach', '--rm', '--init', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=256', '--memory=1g', '--network=bridge',
    '--publish', `127.0.0.1:${config.port}:${config.port}`,
    '--mount', `type=bind,source=${resolve(config.root)},target=/workspace`,
    '--workdir', '/workspace', '--env', `HOST=0.0.0.0`, '--env', `PORT=${config.port}`,
    'node:25-alpine', 'sh', '-lc', script,
  ];
}

function docker(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(`Docker exited ${code}: ${stderr.trim()}`)));
  });
}

export async function probeApp(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
  return response.ok;
}

export async function startApp(prDirectory, timeoutMs = 90_000) {
  const config = await loadConfig(prDirectory);
  const id = await docker(containerArgs(config));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await probeApp(config.url)) return { id, url: config.url.href };
    } catch { /* App is still starting. */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  }
  await docker(['rm', '-f', id]);
  throw new Error(`App did not become ready at ${config.url.href}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { id, url } = await startApp(process.argv[2]);
  process.stdout.write(JSON.stringify({ id, url }) + '\n');
}
