export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, filter the task board, and clear filters to restore all tasks.',
  behaviors: {
    'search-assignees': 'Open the Assignee filter and search by a person’s name to narrow the available choices.',
    'filter-by-assignee': 'Choose a person or Unassigned to show only matching tasks, with task counts shown beside each choice.',
    'assignee-empty-state': 'Choose Ana Lima to see the empty state explaining that nothing is assigned to her yet.',
    'clear-filters': 'Use Clear filters to reset the status and assignee filters and restore all tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');

  await t.step('Search the assignee choices', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana Lima');
  }, [
    t.visible('Ana Lima remains in the choices', page.getByRole('option').filter({ hasText: 'Ana Lima' })),
    t.hidden('Other people are filtered out', page.getByRole('option').filter({ hasText: 'Marco Diaz' })),
  ], { covers: ['search-assignees'] });

  await t.step('Show Ana Lima’s empty state', async () => {
    await t.click(page.getByRole('option').filter({ hasText: 'Ana Lima' }));
  }, [
    t.visible('Nothing is assigned to Ana yet', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.text('No matching tasks are shown', page.locator('.summary'), '0 of 4 tasks'),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Filter to unassigned tasks and show choice counts', async () => {
    await t.click(assigneeButton);
    await t.click(page.locator('.dd-option').filter({ hasText: 'Unassigned' }));
    await t.click(assigneeButton);
  }, [
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('Only one of four tasks is shown', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned has one task', page.locator('.dd-option').filter({ hasText: 'Unassigned' }).filter({ hasText: '1 task' })),
    t.visible('Priya has two tasks', page.locator('.dd-option').filter({ hasText: 'Priya Shah' }).filter({ hasText: '2 tasks' })),
    t.visible('Ana has no tasks', page.locator('.dd-option').filter({ hasText: 'Ana Lima' }).filter({ hasText: '0 tasks' })),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Clear status and assignee filters', async () => {
    await t.select(page.locator('.toolbar').getByLabel('Status'), 'To do');
    await t.click(page.locator('.toolbar .link'));
  }, [
    t.value('Status returns to all statuses', page.locator('.toolbar').getByLabel('Status'), 'All statuses'),
    t.text('Assignee returns to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks are restored', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Release notes task is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Onboarding task is restored', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('Palette task is restored', page.getByRole('heading', { name: 'Approve color palette' })),
    t.visible('Upload test task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('The clear action disappears after reset', page.locator('.toolbar .link')),
  ], { covers: ['clear-filters'] });
}
