import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

const people = ['Ana Lima', 'Ben Okafor', 'Chen Wei', 'Dana Kim'];

export function createAppServer() {
  return createServer(async (request, response) => {
    if (request.url === '/api/people' && request.method === 'GET') {
      // The directory service is slow.
      await new Promise(resolve => setTimeout(resolve, 1200));
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(people));
      return;
    }
    let item;
    try {
      item = files.get(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }
    if (!item || request.method !== 'GET') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    try {
      const body = await readFile(join(root, item[0]));
      response.writeHead(200, {
        'content-type': item[1],
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'",
      });
      response.end(body);
    } catch {
      response.writeHead(500);
      response.end('Unable to load app');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  createAppServer().listen(port, host, () => {
    process.stdout.write(`Task board ready at http://${host}:${port}\n`);
  });
}
