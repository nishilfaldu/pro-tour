import { createServer, request as httpRequest } from 'node:http';

export function createAppOnlyProxy(appUrl) {
  const allowed = new URL(appUrl);
  if (allowed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(allowed.hostname) ||
      !allowed.port || Number(allowed.port) < 1024 || Number(allowed.port) > 65535) {
    throw new Error('Proxy requires a local app URL with an unprivileged port');
  }
  const server = createServer((incoming, outgoing) => {
    let target;
    try {
      target = new URL(incoming.url);
    } catch {
      outgoing.writeHead(403).end('Destination denied');
      return;
    }
    if (target.origin !== allowed.origin || target.username || target.password || target.hash) {
      outgoing.writeHead(403).end('Destination denied');
      return;
    }
    const headers = { ...incoming.headers, host: allowed.host };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    const upstream = httpRequest({ hostname: '127.0.0.1', port: allowed.port, path: target.pathname + target.search,
      method: incoming.method, headers }, response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  server.on('connect', (_request, socket) => socket.destroy());
  server.on('upgrade', (_request, socket) => socket.destroy());
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createAppOnlyProxy(process.env.APP_URL).listen(9224, '127.0.0.1');
}
