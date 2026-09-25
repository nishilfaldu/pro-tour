import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createAppOnlyProxy } from '../scripts/app-only-proxy.js';
import { loadConfig, probeApp } from '../scripts/app-container.js';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));

test('PR URL remains data in the workflow shell', async () => {
  const workflow = await readFile('.github/workflows/pro-tour.yml', 'utf8');
  assert.doesNotMatch(workflow, /run:.*\$\{\{\s*steps\.app\.outputs\.url/);
  assert.match(workflow, /APP_URL: \$\{\{ steps\.app\.outputs\.url \}\}/);
  assert.match(workflow, /run: printf 'PR app ready at %s\\n' "\$APP_URL"/);
  const directory = await mkdtemp(join(tmpdir(), 'tour-shell-'));
  try {
    await writeFile(join(directory, 'pro-tour.config.json'), JSON.stringify({ install: 'true', start: 'true', url: 'http://127.0.0.1:4173/?x=$(touch /tmp/attack)' }));
    const url = (await loadConfig(directory)).url.href;
    assert.match(url, /\$\(touch/);
    const marker = join(directory, 'executed');
    const attackUrl = `http://127.0.0.1:4173/?x=$(touch ${marker})`;
    const result = spawnSync('bash', ['-c', `printf 'PR app ready at %s\\n' "$APP_URL"`],
      { env: { PATH: process.env.PATH, APP_URL: attackUrl }, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `PR app ready at ${attackUrl}\n`);
    await assert.rejects(readFile(marker));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('readiness does not follow a redirect to an internal service', async () => {
  let internalHits = 0;
  const internal = createServer((_req, res) => { internalHits++; res.writeHead(200).end('secret'); });
  await listen(internal);
  const app = createServer((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${internal.address().port}/` }).end();
  });
  await listen(app);
  try {
    await assert.rejects(probeApp(new URL(`http://127.0.0.1:${app.address().port}/`)));
    assert.equal(internalHits, 0);
  } finally { await close(app); await close(internal); }
});

test('browser proxy permits app requests and denies internal targets and CONNECT', async () => {
  let hits = 0;
  const app = createServer((_req, res) => { hits++; res.writeHead(200).end('app'); });
  const internal = createServer((_req, res) => { hits++; res.writeHead(200).end('internal'); });
  await listen(app); await listen(internal);
  const proxy = createAppOnlyProxy(`http://127.0.0.1:${app.address().port}/`);
  await listen(proxy);
  const through = target => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: proxy.address().port, path: target }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    }); req.on('error', reject); req.end();
  });
  try {
    assert.equal(await through(`http://127.0.0.1:${app.address().port}/`), 200);
    assert.equal(await through(`http://127.0.0.1:${internal.address().port}/`), 403);
    assert.equal(await through('http://127.0.0.1:9223/json/version'), 403);
    assert.equal(hits, 1);
    const workflow = await readFile('.github/workflows/pro-tour.yml', 'utf8');
    assert.match(workflow, /--proxy-bypass-list='<-loopback>'/);
    assert.match(workflow, /iptables -I OUTPUT 1 -m owner --uid-owner "\$BROWSER_UID" -j REJECT/);
  } finally { await close(proxy); await close(app); await close(internal); }
});

test('runner browser firewall fails closed for IPv4, IPv6, and changed network UID', async () => {
  const workflow = await readFile('.github/workflows/pro-tour.yml', 'utf8');
  const step = workflow.split('      - name: Start app-only browser proxy and credential-free Chrome\n')[1]
    .split('      - name: Install Cursor CLI')[0];
  assert.match(step, /run: \|\n          set -euo pipefail/);
  assert.match(step, /sudo iptables -I OUTPUT 1 -m owner --uid-owner "\$BROWSER_UID" -j REJECT/);
  assert.match(step, /sudo ip6tables -I OUTPUT 1 -m owner --uid-owner "\$BROWSER_UID" -j REJECT/);
  assert.match(step, /bash scripts\/verify-browser-network\.sh "\$BROWSER_UID" "\$CHROME_HOME"/);
  assert.ok(step.indexOf('sudo ip6tables -I OUTPUT') < step.indexOf('google-chrome'));
  assert.ok(step.indexOf('verify-browser-network.sh') < step.indexOf('ensure_daemon'));
  const check = await readFile('scripts/verify-browser-network.sh', 'utf8');
  assert.match(check, /network\.mojom\.NetworkService/);
  assert.match(check, /\$real.*\$browser_uid.*\$effective.*\$browser_uid/);
  assert.match(check, /sudo -u pro-tour-browser curl.*127\.0\.0\.1:9223/);
  assert.match(check, /sudo -u pro-tour-browser curl.*\[::1\]:9225/);
});
