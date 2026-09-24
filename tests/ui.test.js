import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chromium } from 'playwright';
import { createAppServer } from '../sample_app/server.js';

test('create, edit, change status, filter inclusion and exclusion, then reset', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.locator('.task').count(), 3);

    await page.getByRole('button', { name: '+ New task' }).click();
    await page.locator('#task-name').fill('Prepare demo');
    await page.locator('#task-details').fill('Show the new filter');
    await page.getByRole('button', { name: 'Save task' }).click();
    assert.equal(await page.locator('.task').count(), 4);

    await page.getByRole('button', { name: 'Edit Prepare demo' }).click();
    await page.locator('#task-name').fill('Prepare product demo');
    await page.getByRole('button', { name: 'Save task' }).click();
    assert.equal(await page.getByText('Prepare product demo').count(), 1);

    await page.getByRole('combobox', { name: 'Status for Prepare product demo' }).selectOption('done');
    await page.locator('#status-filter').selectOption('done');
    assert.equal(await page.locator('.task').count(), 2);
    assert.equal(await page.getByText('Prepare product demo').count(), 1);
    assert.equal(await page.getByText('Draft release notes').count(), 0);
    await page.locator('#status-filter').selectOption('todo');
    assert.equal(await page.getByText('Prepare product demo').count(), 0);

    await page.getByRole('button', { name: 'Reset demo' }).click();
    assert.equal(await page.locator('.task').count(), 3);
    assert.equal(await page.getByText('Prepare product demo').count(), 0);
    await page.reload();
    assert.equal(await page.locator('.task').count(), 3);
  } finally {
    await browser.close();
    server.close();
  }
});
