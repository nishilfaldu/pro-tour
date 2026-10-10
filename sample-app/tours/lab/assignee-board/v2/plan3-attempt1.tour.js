export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks assigned to a specific person or left unassigned.',
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const search = page.getByPlaceholder('Find a person');
  const cards = page.locator('li.card');

  await t.step('Open the assignee filter to see its people and task counts.', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Search people in the assignee list', search),
    t.visible('Priya’s task count is shown', page.getByRole('option', { name: /Priya Shah.*2 tasks/ })),
  ]);

  await t.step('Search for Priya and show only her tasks.', async () => {
    await t.fill(search, 'Priya');
    await t.click(page.getByRole('option', { name: /Priya Shah/ }));
  }, [
    t.visible('Draft release notes remains on the board', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Approve color palette remains on the board', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s task is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.text('The summary reports two matching tasks', page.locator('.summary'), '2 of 4 tasks'),
  ]);

  await t.step('Switch the filter to unassigned tasks.', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Unassigned/ }));
  }, [
    t.visible('The unassigned upload task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('The summary reports one matching task', page.locator('.summary'), '1 of 4 tasks'),
  ]);

  await t.step('Clear the filter and restore the full task board.', async () => {
    await t.click(page.getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('Priya’s task returns to the board', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('The unassigned task returns to the board', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('The clear filter control goes away', page.getByRole('button', { name: 'Clear filters' })),
    t.text('All four tasks are shown again', page.locator('.summary'), '4 of 4 tasks'),
  ]);
}
