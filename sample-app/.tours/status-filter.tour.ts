import { expect, test } from 'pro-tour';

test('Mark a task Done and filter by status', async ({ page }) => {
  const filter = page.getByRole('combobox', { name: 'Status', exact: true });
  const heading = (name: string) => page.getByRole('heading', { name });

  await test.step('Create a new task', async () => {
    await page.getByRole('button', { name: 'New task' }).click();
    await page.getByLabel('Task name').fill('Prepare product tour');
    await page.getByLabel('Details').fill('Record a walkthrough for reviewers');
    await page.getByRole('button', { name: 'Save task' }).click();
    await expect(heading('Prepare product tour'), 'New task is on the board').toBeVisible();
    await expect(page.locator('#total-count'), 'Board now has 4 tasks').toHaveText('4');
  });

  await test.step('Mark it Done from the board', async () => {
    const status = page.getByRole('combobox', { name: 'Status for Prepare product tour' });
    await status.selectOption('Done');
    await expect(status, 'Task status is Done').toHaveValue('done');
  });

  await test.step('Filter the board to Done', async () => {
    await filter.selectOption('Done');
    await expect(page.locator('#visible-count'), '2 tasks in view').toHaveText('2');
    await expect(heading('Draft release notes'), 'Draft release notes is hidden').toBeHidden();
    await expect(heading('Prepare product tour'), 'Prepare product tour is included').toBeVisible();
  });

  await test.step('Switch to To do: the task drops out', async () => {
    await filter.selectOption('To do');
    await expect(heading('Prepare product tour'), 'Prepare product tour is hidden').toBeHidden();
    await expect(heading('Draft release notes'), 'Draft release notes is shown').toBeVisible();
  });
});
