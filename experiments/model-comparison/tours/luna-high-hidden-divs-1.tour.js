export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find people, combine filters, and quickly reset the task board.',
  behaviors: {
    'search-assignees': 'Search the Assignee menu by name and see task counts for each person, Anyone, and Unassigned.',
    'filter-by-assignee': 'Choose a person or Unassigned to show only matching tasks and update the visible task summary.',
    'combine-filters': 'Apply an assignee filter together with a status filter to show tasks matching both.',
    'assignee-empty-state': 'Choose Ana Lima, who has no seeded tasks, to see the empty message naming her and a Clear filters button.',
    'clear-filters': 'Use Clear filters to reset both filters and restore all seeded tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const dropdownButton = name => toolbar.locator('.dd-button').filter({ hasText: name });
  const search = page.getByPlaceholder('Find a person');
  const option = name => page.locator('.dd-option').filter({ hasText: name });
  const summary = page.locator('.summary');
  const task = name => page.getByRole('heading', { name, exact: true });
  const status = toolbar.getByLabel('Status');

  await t.step('Open Assignee to compare task counts', async () => {
    await t.click(dropdownButton('Anyone'));
  }, [
    t.visible('Anyone has 4 tasks', option('Anyone').getByText('4 tasks', { exact: true })),
    t.visible('Priya Shah has 2 tasks', option('Priya Shah').getByText('2 tasks', { exact: true })),
    t.visible('Marco Diaz has 1 task', option('Marco Diaz').getByText('1 task', { exact: true })),
    t.visible('Ana Lima has 0 tasks', option('Ana Lima').getByText('0 tasks', { exact: true })),
    t.visible('Unassigned has 1 task', option('Unassigned').getByText('1 task', { exact: true })),
    t.visible('Search people by name', search),
  ], { covers: ['search-assignees'] });

  await t.step('Search the menu for Ana Lima', async () => {
    await t.fill(search, 'Ana Lima');
  }, [
    t.visible('Ana Lima remains with 0 tasks', option('Ana Lima').getByText('0 tasks', { exact: true })),
    t.hidden('Priya Shah is filtered out', option('Priya Shah')),
    t.hidden('Marco Diaz is filtered out', option('Marco Diaz')),
  ], { covers: ['search-assignees'] });

  await t.step('Show Ana Lima’s empty state', async () => {
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Empty message names Ana Lima', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.text('No matching tasks', summary, '0 of 4 tasks'),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters and restore all seeded tasks', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All seeded tasks are restored', summary, '4 of 4 tasks'),
    t.visible('Anyone is selected again', dropdownButton('Anyone')),
    t.value('Status is reset to All statuses', status, 'All statuses'),
    t.visible('Draft release notes is restored', task('Draft release notes')),
    t.visible('Review onboarding flow is restored', task('Review onboarding flow')),
    t.visible('Approve color palette is restored', task('Approve color palette')),
    t.visible('Fix flaky upload test is restored', task('Fix flaky upload test')),
  ], { covers: ['clear-filters'] });

  await t.step('Filter to unassigned tasks', async () => {
    await t.click(dropdownButton('Anyone'));
    await t.click(option('Unassigned'));
  }, [
    t.text('One of four tasks matches', summary, '1 of 4 tasks'),
    t.visible('Unassigned task is shown', task('Fix flaky upload test')),
    t.hidden('Assigned task is filtered out', task('Draft release notes')),
    t.visible('Unassigned is selected', dropdownButton('Unassigned')),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Combine Marco Diaz and In progress filters', async () => {
    await t.click(dropdownButton('Unassigned'));
    await t.click(option('Marco Diaz'));
    await t.select(status, 'In progress');
  }, [
    t.text('Only Marco’s in-progress task matches', summary, '1 of 4 tasks'),
    t.visible('Marco’s matching task is shown', task('Review onboarding flow')),
    t.hidden('The unassigned task no longer matches', task('Fix flaky upload test')),
    t.value('Status is In progress', status, 'In progress'),
    t.visible('Marco Diaz is selected', dropdownButton('Marco Diaz')),
  ], { covers: ['combine-filters'] });
}
