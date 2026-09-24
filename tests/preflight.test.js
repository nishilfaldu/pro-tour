import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { needsTour } from '../scripts/classify-pr.js';
import { loadConfig, containerArgs } from '../scripts/app-container.js';

test('docs-only changes skip; app, config, and workflow changes run', () => {
  assert.equal(needsTour(['README.md', 'docs/guide.mdx']), false);
  assert.equal(needsTour(['docs/guide.md', 'sample_app/app.js']), true);
  assert.equal(needsTour(['pro-tour.config.json']), true);
  assert.equal(needsTour(['.github/workflows/pro-tour.yml']), true);
  assert.throws(() => needsTour([]));
});

test('container config has a local URL and never inherits host credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pro-tour-config-'));
  try {
    await writeFile(join(directory, 'pro-tour.config.json'), JSON.stringify({ install: 'npm ci', start: 'npm start', url: 'http://127.0.0.1:4173/' }));
    const config = await loadConfig(directory);
    const args = containerArgs(config);
    assert.ok(args.includes('--cap-drop=ALL'));
    assert.ok(args.includes('--security-opt=no-new-privileges'));
    assert.deepEqual(args.filter(arg => arg.startsWith('TYPESAFE_API_KEY=') || arg.startsWith('CURSOR_API_KEY=') || arg.startsWith('GH_MEDIA_TOKEN=')), []);
    assert.ok(args.includes('127.0.0.1:4173:4173'));
    await writeFile(join(directory, '.env.local'), 'TEST_MARKER=present\n');
    await assert.rejects(loadConfig(directory), /prohibited credential file/);
    await rm(join(directory, '.env.local'));
    await writeFile(join(directory, 'pro-tour.config.json'), JSON.stringify({ install: 'npm ci', start: 'npm start', url: 'https://example.com/' }));
    await assert.rejects(loadConfig(directory), /local HTTP/);
    await rm(join(directory, 'pro-tour.config.json'));
    await symlink('/etc/passwd', join(directory, 'pro-tour.config.json'));
    await assert.rejects(loadConfig(directory), /regular file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
