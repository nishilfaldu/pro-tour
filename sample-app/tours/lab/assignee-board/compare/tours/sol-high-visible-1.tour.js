export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'See task counts, search for a person, and combine assignee and status filters.',
  behaviors: {
    'assignee-choices': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Typing in Find a person narrows the assignee choices.',
    'filter-by-person': 'Selecting a person shows only their tasks that match the selected status and updates the task count.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks with no assignee.',
    'assignee-empty-state': 'Selecting Ana Lima shows a message that nothing is assigned to her yet and offers Clear filters.',
    'clear-filters': 'Clear filters resets both filters and restores the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.dd-button');
  const status = page.locator('.toolbar select.filter');
  const summary = page.locator('.toolbar .summary');
  const choice = name => page.locator('.dd-popup .dd-option').filter({ hasText: name });
  const task = name => page.locator('.board .card').filter({ hasText: name });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assignee);
  }, [
    t.visible('Assignee choices open', page.getByRole('listbox', { name: 'Assignee' })),
    t.text('Anyone: 4 tasks', choice('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya Shah: 2 tasks', choice('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco Diaz: 1 task', choice('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana Lima: 0 tasks', choice('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned: 1 task', choice('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-choices'] });

  await t.step('Search for Priya to narrow the choices', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Pri');
  }, [
    t.value('Search text', page.getByPlaceholder('Find a person'), 'Pri'),
    t.visible('Priya remains available', choice('Priya Shah')),
    t.hidden('Marco is filtered out', choice('Marco Diaz')),
    t.hidden('Anyone is filtered out', choice('Anyone')),
    t.hidden('Unassigned is filtered out', choice('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Show Priya’s To do tasks', async () => {
    await t.click(assignee);
    await t.select(status, 'To do');
    await t.click(assignee);
    await t.click(choice('Priya Shah'));
  }, [
    t.value('To do status selected', status, 'To do'),
    t.text('Priya selected', page.locator('.dd-value'), 'Priya Shah'),
    t.text('One matching task', summary, '1 of 4 tasks'),
    t.visible('Priya’s To do task', task('Draft release notes')),
    t.hidden('Priya’s Done task is excluded', task('Approve color palette')),
    t.hidden('Marco’s task is excluded', task('Review onboarding flow'))
  ], { covers: ['filter-by-person'] });

  await t.step('Show the unassigned To do task', async () => {
    await t.click(assignee);
    await t.click(choice('Unassigned'));
  }, [
    t.text('Unassigned selected', page.locator('.dd-value'), 'Unassigned'),
    t.visible('Task without an assignee', task('Fix flaky upload test')),
    t.text('Card shows no assignee', page.locator('.board .card .owner'), '–Unassigned'),
    t.hidden('Priya’s task is excluded', task('Draft release notes')),
    t.text('One matching task', summary, '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Show Ana’s empty state', async () => {
    await t.click(assignee);
    await t.click(choice('Ana Lima'));
  }, [
    t.text('Ana selected', page.locator('.dd-value'), 'Ana Lima'),
    t.text('No matching tasks', summary, '0 of 4 tasks'),
    t.visible('Nothing assigned to Ana yet', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters offered', page.locator('.empty button.link')),
    t.hidden('Previous task disappears', task('Fix flaky upload test'))
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear both filters and restore all tasks', async () => {
    await t.click(page.locator('.empty button.link'));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.text('Anyone restored', page.locator('.dd-value'), 'Anyone'),
    t.text('Full task count restored', summary, '4 of 4 tasks'),
    t.visible('Priya’s task restored', task('Draft release notes')),
    t.visible('Marco’s task restored', task('Review onboarding flow')),
    t.visible('Done task restored', task('Approve color palette')),
    t.visible('Unassigned task restored', task('Fix flaky upload test')),
    t.hidden('Empty state disappears', page.locator('.empty')),
    t.hidden('Toolbar Clear filters disappears', page.locator('.toolbar button.link'))
  ], { covers: ['clear-filters'] });
}
