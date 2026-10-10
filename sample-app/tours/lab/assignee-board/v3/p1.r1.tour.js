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
  const summary = page.locator('.summary');
  const clearToolbar = page.locator('.toolbar').getByRole('button', { name: 'Clear filters' });

  await t.step('Narrow the board to To do tasks', async () => {
    await t.select(page.getByLabel('Status'), 'To do');
  }, [
    t.text('Two To do tasks remain', summary, '2 of 4 tasks'),
    t.visible('The unassigned task remains', task('Fix flaky upload test')),
    t.hidden('The in-progress task is filtered out', task('Review onboarding flow')),
  ]);

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
    t.text('One matching task remains', summary, '1 of 4 tasks'),
    t.visible('The unassigned task remains', task('Fix flaky upload test')),
    t.hidden('Priya’s task is filtered out', task('Draft release notes')),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Open the Assignee options again', async () => {
    await t.click(page.getByRole('button', { name: /Assignee Unassigned/ }));
  }, [
    t.visible('The current Unassigned option is shown', option('Unassigned 1 task')),
    t.visible('Priya is available to search', option('Priya Shah 2 tasks')),
  ]);

  await t.step('Search the options for Ana Lima', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana Lima');
  }, [
    t.visible('Ana Lima is the matching result', option('Ana Lima 0 tasks')),
    t.hidden('Priya is excluded from the search results', option('Priya Shah 2 tasks')),
  ]);

  await t.step('Choose Ana and show her personalized empty state', async () => {
    await t.click(option('Ana Lima 0 tasks'));
  }, [
    t.visible('The empty state names Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.text('No tasks match Ana', summary, '0 of 4 tasks'),
    t.visible('Clear filters is available in the toolbar', clearToolbar),
  ], { covers: ['search-assignees', 'filter-empty-state'] });

  await t.step('Clear filters and restore the full board', async () => {
    await t.click(clearToolbar);
  }, [
    t.text('All four tasks are restored', summary, '4 of 4 tasks'),
    t.visible('The first seeded task is back', task('Draft release notes')),
    t.visible('The in-progress task is back', task('Review onboarding flow')),
    t.hidden('The personalized empty state is gone', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.hidden('Toolbar Clear filters is reset', clearToolbar),
    t.check('Status filter is reset to all statuses', async () => await page.getByLabel('Status').inputValue() === 'all'),
    t.check('Assignee filter is reset to Anyone', async () => await page.getByRole('button', { name: /Assignee Anyone/ }).count() === 1),
  ], { covers: ['clear-filters'] });
}
