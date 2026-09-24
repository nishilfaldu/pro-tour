import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createAppServer } from '../sample_app/server.js';

test('serves the task board and its local assets', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [path, expected] of [['/', 'Task board'], ['/app.js', 'status-filter'], ['/style.css', '.task']]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), new RegExp(expected));
    }
    assert.equal((await fetch(base + '/missing')).status, 404);
    assert.equal((await fetch(base + '/.env.local')).status, 404);
  } finally {
    server.close();
  }
});
