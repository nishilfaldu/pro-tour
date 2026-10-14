import { expect, test } from 'pro-tour';

test('Assign a task to a teammate', async ({ page }) => {
  const dialog = page.getByRole('dialog');
  const assignee = dialog.getByLabel('Assignee');
  const card = page.locator('article.task').filter({ hasText: 'Prepare launch checklist' });

  await test.step('Open a new task: teammates load from the directory', async () => {
    await page.getByRole('button', { name: 'New task' }).click();
    await expect(assignee, 'Teammates are loading').toBeDisabled();
    await expect(assignee, 'Teammates are listed').toBeEnabled();
    await expect(assignee.locator('option'), 'Unassigned and four teammates').toHaveText([
      'Unassigned',
      'Ana Lima',
      'Ben Okafor',
      'Chen Wei',
      'Dana Kim',
    ]);
  });

  await test.step('Assign the new task to Ana and save it', async () => {
    await dialog.getByLabel('Task name').fill('Prepare launch checklist');
    await assignee.selectOption('Ana Lima');
    await dialog.getByRole('button', { name: 'Save task' }).click();
    await expect(card.getByText('Assigned to Ana Lima'), 'The card says Assigned to Ana Lima').toBeVisible();
  });

  await test.step('Edit it: Ana is still selected', async () => {
    await card.getByRole('button', { name: 'Edit Prepare launch checklist' }).click();
    await expect(assignee, 'Ana Lima is selected').toHaveValue('Ana Lima');
  });

  await test.step('Reassign it to Ben', async () => {
    await assignee.selectOption('Ben Okafor');
    await dialog.getByRole('button', { name: 'Save task' }).click();
    await expect(card.getByText('Assigned to Ben Okafor'), 'The card says Assigned to Ben Okafor').toBeVisible();
  });
});
