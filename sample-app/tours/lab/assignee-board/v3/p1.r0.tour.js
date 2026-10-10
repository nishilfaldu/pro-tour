export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by owner, search the assignee list, and clear filters from an empty state.',
  behaviors: {
    'filter-by-assignee': 'Choose a person or Unassigned in the Assignee dropdown to show only matching tasks, with task counts shown for each option.',
    'search-assignees': 'Search the Assignee options by typing a person’s name and choose a matching result.',
    'filter-empty-state': 'Selecting Ana Lima shows a personalized empty state because no seeded tasks are assigned to her.',
    'clear-filters': 'Use Clear filters in the toolbar or empty state to reset both status and assignee filters and restore all tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const assignee = page.getByRole('button', { name: /Assignee Anyone/ });
  const option = name => page.getByRole('option', { name });
  const task = name => page.getByRole('heading', { name, level: 3 });
  const clearToolbar = page.getByRole('button', { name: 'Clear filters' }).first();

  await t.step('Open Assignee and compare the task counts', async () => {
    await t.click(assignee);
  }, [
    t.visible('Anyone includes all four tasks', option('Anyone 4 tasks')),
    t.visible('Priya has two tasks', option('Priya Shah 2 tasks')),
    t.visible('Marco has one task', option('Marco Diaz 1 task')),
    t.visible('Unassigned has one task', option('Unassigned 1 task')),
  ]);

  await t.step('Filter to unassigned work', async () => {
    await t.click(option('Unassigned 1 task'));
  }, [
    t.text('One task remains', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('The unassigned task remains', task('Fix flaky upload test')),
    t.hidden('Priya’s task is filtered out', task('Draft release notes')),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Search the assignee options for Ana', async () => {
    await t.click(page.getByRole('button', { name: /Assignee Unassigned/ }));
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana Lima');
  }, [
    t.visible('Ana Lima is the matching result', option('Ana Lima 0 tasks')),
    t.hidden('Other people are excluded from the search', option('Priya Shah 2 tasks')),
  ]);

  await t.step('Choose Ana and show her personalized empty state', async () => {
    await t.click(option('Ana Lima 0 tasks'));
  }, [
    t.visible('Empty state names Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.text('No tasks match Ana', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['search-assignees', 'filter-empty-state'] });

  await t.step('Clear filters and restore the full board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All four tasks are restored', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('The first seeded task is back', task('Draft release notes')),
    t.hidden('The empty state is gone', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.hidden('Toolbar Clear filters is reset', clearToolbar),
  ], { covers: ['clear-filters'] });
}
