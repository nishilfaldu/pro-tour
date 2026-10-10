export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find people in the assignee picker and quickly narrow or restore the task board.',
  behaviors: {
    'search-assignees': 'Search the assignee picker by name to find a person in its options.',
    'filter-by-assignee': 'Choose a person or Unassigned to show only tasks assigned to that choice.',
    'show-assignee-task-counts': 'See each assignee option’s task count in the picker.',
    'show-empty-assignee-state': 'Choose Ana Lima to see the message that nothing is assigned to her yet.',
    'clear-filters': 'Clear active filters to restore all statuses and assignees.',
  },
};

export async function run(t) {
  const { page } = t;
  const picker = page.locator('.dd-button');
  const popup = page.locator('.dd-popup.open');
  const search = page.getByPlaceholder('Find a person');
  const anaOption = popup.locator('.dd-option').filter({ hasText: 'Ana Lima' });

  await t.step('Open the assignee picker and inspect task counts', async () => {
    await t.click(picker);
  }, [
    t.visible('Anyone option shows four tasks', popup.locator('.dd-option').filter({ hasText: 'Anyone' }).getByText('4 tasks', { exact: true })),
    t.visible('Priya option shows two tasks', popup.locator('.dd-option').filter({ hasText: 'Priya Shah' }).getByText('2 tasks', { exact: true })),
    t.visible('Marco option shows one task', popup.locator('.dd-option').filter({ hasText: 'Marco Diaz' }).getByText('1 task', { exact: true })),
    t.visible('Unassigned option shows one task', popup.locator('.dd-option').filter({ hasText: 'Unassigned' }).getByText('1 task', { exact: true })),
  ], { covers: ['show-assignee-task-counts'] });

  await t.step('Search for Ana Lima in the options', async () => {
    await t.fill(search, 'Ana Lima');
  }, [
    t.value('Search field contains Ana Lima', search, 'Ana Lima'),
    t.visible('Ana Lima option is found', anaOption),
    t.hidden('Priya option is filtered out', popup.locator('.dd-option').filter({ hasText: 'Priya Shah' })),
  ], { covers: ['search-assignees'] });

  await t.step('Choose Ana Lima to see her empty state', async () => {
    await t.click(anaOption);
  }, [
    t.text('Empty state explains Ana has no tasks', page.locator('.empty p'), 'Nothing assigned to Ana Lima yet.'),
    t.text('Board shows no matching tasks', page.locator('.summary'), '0 of 4 tasks'),
  ], { covers: ['filter-by-assignee', 'show-empty-assignee-state'] });

  await t.step('Clear filters and restore all tasks', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('Board shows all four tasks', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya task returns', page.getByRole('heading', { name: 'Draft release notes' })),
    t.hidden('Empty state closes', page.locator('.empty')),
  ], { covers: ['clear-filters'] });

  await t.step('Filter to Unassigned tasks', async () => {
    await t.click(picker);
    await t.click(page.locator('.dd-popup.open .dd-option').filter({ hasText: 'Unassigned' }));
  }, [
    t.text('Only the unassigned task remains', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned task remains', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Assigned task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
  ], { covers: ['filter-by-assignee'] });
}
