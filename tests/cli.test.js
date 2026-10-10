import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { diffFiles, main } from '../src/cli.js';

test('diffFiles lists the files a unified diff adds or changes', () => {
  const diff = 'diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n'
    + 'diff --git a/old.js b/old.js\n--- a/old.js\n+++ /dev/null\n'
    + 'diff --git a/src/new tool.vue b/src/new tool.vue\n--- /dev/null\n+++ b/src/new tool.vue\n';
  assert.deepEqual(diffFiles(diff), ['src/a.js', 'src/new tool.vue']);
});

test('bad arguments are reported as usage errors, not crashes', async () => {
  const errors = [];
  const original = console.error;
  console.error = message => errors.push(String(message));
  try {
    assert.equal(await main(['tour', '--url', 'http://localhost:1', '--rounds', 'many']), 2);
    assert.equal(await main(['tour', '--url', 'ftp://example.com']), 2);
    assert.equal(await main(['tour', '--url', 'http://user:pw@localhost:1']), 2);
    assert.equal(await main(['run', 'missing.tour.js', '--url', 'http://localhost:1']), 2);
    assert.equal(await main(['nope']), 2);
  } finally {
    console.error = original;
  }
  assert.match(errors.join('\n'), /--rounds must be a whole number/);
  assert.match(errors.join('\n'), /http\(s\) URL/);
  assert.match(errors.join('\n'), /must not contain credentials/);
  assert.match(errors.join('\n'), /Tour file not found/);
});
