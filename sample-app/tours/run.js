import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createAppServer } from '../server.js';
import { recordTour } from './runtime.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: 'string' }, out: { type: 'string', default: '.videos' } },
});
if (positionals.length !== 1) {
  console.error('Usage: node tours/run.js <file.tour.js> [--url http://localhost:3000] [--out .videos]');
  process.exit(2);
}

const file = resolve(positionals[0]);
const tour = await import(pathToFileURL(file));
let server;
let url = values.url;
if (!url) {
  server = createAppServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${server.address().port}`;
}

try {
  const report = await recordTour(tour, { url, outDir: resolve(values.out), name: basename(file, '.tour.js') });
  console.log(`${report.status.toUpperCase()}: ${report.video} (${report.seconds}s)`);
  for (const step of report.steps) console.log(`  ${step.status === 'passed' ? '✓' : '✗'} ${step.title}`);
  if (report.error) console.log(`  ${report.error}`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
} finally {
  server?.close();
}
