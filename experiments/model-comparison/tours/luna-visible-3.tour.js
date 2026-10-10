export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Narrow the task board by assignee, find people by name, and clear filters when you’re done.',
  behaviors: {
    'assignee-filter': 'Choose an assignee or Unassigned to show only matching tasks, with each option showing its task count.',
    'search-assignees': 'Search the assignee menu by name to narrow the available choices.',
    'clear-filters': 'Use Clear filters to restore the board to Anyone and All statuses.',
    'assignee-empty-state': 'Select Ana Lima to see the new “Nothing assigned to Ana Lima yet” empty state and its Clear filters control.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.dd-button');
  const options = page.getByRole('option');
  const option = name => options.filter({ hasText: name });
  const summary = page.locator('.summary');
  const empty = page.locator('.empty');
  const toolbarClear = page.locator('.toolbar').getByRole('button', { name: 'Clear filters' });

  await t.step('Open the assignee filter and review task counts', async () => {
    await t.click(assignee);
  }, [
    t.visible('Anyone shows all four tasks', option('Anyone').filter({ hasText: '4 tasks' })),
    t.visible('Priya has two tasks', option('Priya Shah').filter({ hasText: '2 tasks' })),
    t.visible('Marco has one task', option('Marco Diaz').filter({ hasText: '1 task' })),
    t.visible('Unassigned has one task', option('Unassigned').filter({ hasText: '1 task' }))
  ], { covers: ['assignee-filter'] });

  await t.step('Search the menu for Ana Lima', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana Lima remains available with zero tasks', option('Ana Lima').filter({ hasText: '0 tasks' })),
    t.hidden('Priya is filtered out of the choices', option('Priya Shah')),
    t.hidden('Marco is filtered out of the choices', option('Marco Diaz'))
  ], { covers: ['search-assignees'] });

  await t.step('Select Ana to show the new empty state', async () => {
    await t.click(option('Ana Lima'));
  }, [
    t.text('Empty state explains no tasks are assigned to Ana', empty.locator('p'), 'Nothing assigned to Ana Lima yet.'),
    t.visible('Empty state offers Clear filters', empty.getByRole('button', { name: 'Clear filters' })),
    t.visible('Toolbar Clear filters is available', toolbarClear)
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear the filters and restore the full board', async () => {
    await t.click(toolbarClear);
  }, [
    t.text('Assignee returns to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.value('Status returns to All statuses', page.locator('.toolbar select.filter'), 'All statuses'),
    t.text('All four tasks are restored', summary, '4 of 4 tasks'),
    t.hidden('The empty state is gone', empty)
  ], { covers: ['clear-filters'] });
}
