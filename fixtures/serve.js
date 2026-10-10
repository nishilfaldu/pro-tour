// Static server for lab fixtures: node tours/lab/serve.js <dir> [port]

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const root = resolve(process.argv[2]);
const port = Number(process.argv[3] || 4180);

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !types[extname(file)]) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': `${types[extname(file)]}; charset=utf-8`,
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => process.stdout.write(`Serving ${root} at http://127.0.0.1:${port}\n`));
