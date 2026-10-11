export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find a teammate, see task counts, and filter the board by assignee.',
  behaviors: {
    'filter-by-assignee': 'Choose an assignee to show only their tasks, with task counts displayed beside each assignee option.',
    'search-assignees': 'Search the assignee dropdown by person name to narrow its options.',
    'filter-unassigned': 'Choose Unassigned to show only tasks without an assignee.',
    'clear-filters': 'Use Clear filters to reset status and assignee filters to show all tasks again.'
  }
};

export async function run(t) {
  const { page } = t;
  const summary = page.locator('.summary');
  const status = page.locator('.toolbar select.filter');
  const assigneeButton = () => page.locator('.dd-button');
  const options = () => page.getByRole('option');
  const toolbarClear = page.locator('.toolbar button.link');

  await t.step('Open the assignee list and show task counts', async () => {
    await t.click(assigneeButton());
  }, [
    t.visible('Priya has two matching tasks', page.getByRole('option', { name: 'Priya Shah 2 tasks' })),
    t.visible('Marco has one matching task', page.getByRole('option', { name: 'Marco Diaz 1 task' })),
    t.visible('Unassigned has one matching task', page.getByRole('option', { name: 'Unassigned 1 task' }))
  ]);

  await t.step('Choose Priya to filter the board', async () => {
    await t.click(page.getByRole('option', { name: 'Priya Shah 2 tasks' }));
  }, [
    t.visible('Priya’s first task is shown', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Priya’s second task is shown', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s task is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.text('Two of four tasks remain', summary, '2 of 4 tasks')
  ], { covers: ['filter-by-assignee'] });

  await t.step('Search the assignee list by name', async () => {
    await t.click(assigneeButton());
    await t.fill(page.getByPlaceholder('Find a person'), 'ana');
  }, [
    t.visible('Ana Lima is the matching option', page.getByRole('option', { name: /Ana Lima/ })),
    t.hidden('Priya is removed from the narrowed options', page.getByRole('option', { name: /Priya Shah/ }))
  ], { covers: ['search-assignees'] });

  await t.step('Choose Unassigned tasks', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), '');
    await t.click(page.getByRole('option', { name: 'Unassigned 1 task' }));
  }, [
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('One of four tasks remains', summary, '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Apply a status filter, then clear both filters', async () => {
    await t.select(status, 'Done');
    await t.click(toolbarClear);
  }, [
    t.value('Status resets to all statuses', status, 'All statuses'),
    t.visible('Priya’s task is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Marco’s task is restored', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('The unassigned task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('All four tasks are shown', summary, '4 of 4 tasks'),
    t.hidden('Toolbar Clear filters is hidden after reset', toolbarClear)
  ], { covers: ['clear-filters'] });
}
