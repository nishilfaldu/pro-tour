export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find an assignee, combine filters, and clear them to restore the task board.',
  behaviors: {
    'search-assignees': 'Search the assignee menu by person name to find an available filter option.',
    'filter-by-assignee': 'Choose a person or Unassigned to show only tasks assigned to that choice, with task counts shown in the menu.',
    'combine-filters': 'Apply a status filter and an assignee filter together to show tasks matching both.',
    'assignee-empty-state': 'Choose Ana Lima to see the tailored empty message that says nothing is assigned to her.',
    'clear-filters': 'Use Clear filters to reset the status and assignee selections and restore all tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const search = page.getByPlaceholder('Find a person');
  const status = page.locator('.toolbar select.filter');
  const popupOption = name => page
    .locator('.dd-popup.open .dd-option-label')
    .filter({ hasText: new RegExp(`^${name}$`) });
  const unassignedCount = page
    .locator('.dd-popup.open .dd-option-label')
    .filter({ hasText: /^Unassigned$/ })
    .locator('..')
    .locator('.dd-count');

  await t.step('Search the assignee menu by name', async () => {
    await t.click(assigneeButton);
    await t.fill(search, 'Priya');
  }, [
    t.visible('Priya Shah is available', popupOption('Priya Shah')),
    t.hidden('Marco Diaz is filtered out', popupOption('Marco Diaz')),
  ], { covers: ['search-assignees'] });

  await t.step('Filter to unassigned tasks and show the menu count', async () => {
    await t.fill(search, '');
    await t.click(popupOption('Unassigned'));
    await t.click(assigneeButton);
  }, [
    t.visible('The menu shows one unassigned task', unassignedCount),
    t.visible('The unassigned task remains', page.getByRole('heading', { name: 'Fix flaky upload test', exact: true })),
    t.hidden('Assigned tasks are filtered out', page.getByRole('heading', { name: 'Draft release notes', exact: true })),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Combine assignee and status filters', async () => {
    await t.click(popupOption('Marco Diaz'));
    await t.select(status, 'In progress');
  }, [
    t.visible('The task matching both filters is shown', page.getByRole('heading', { name: 'Review onboarding flow', exact: true })),
    t.text('The assignee filter is Marco Diaz', page.locator('.dd-value'), 'Marco Diaz'),
    t.value('The status filter is In progress', status, 'In progress'),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['combine-filters'] });

  await t.step('Show Ana Lima’s tailored empty state', async () => {
    await t.click(assigneeButton);
    await t.fill(search, 'Ana');
    await t.click(popupOption('Ana Lima'));
  }, [
    t.visible('The empty state names Ana Lima', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters and restore all tasks', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters', exact: true }));
  }, [
    t.visible('All tasks are restored', page.getByRole('heading', { name: 'Draft release notes', exact: true })),
    t.visible('The previously filtered task is restored', page.getByRole('heading', { name: 'Review onboarding flow', exact: true })),
    t.value('Status resets to all statuses', status, 'All statuses'),
    t.text('Assignee resets to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.text('The full task count returns', page.locator('.summary'), '4 of 4 tasks'),
  ], { covers: ['clear-filters'] });
}
