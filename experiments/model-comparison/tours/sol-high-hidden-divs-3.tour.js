export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by assignee, see task counts and empty states, and clear both filters.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Typing in Find a person narrows the assignee choices.',
    'filter-by-person': 'Selecting Priya Shah shows only her two tasks and updates the task summary.',
    'filter-unassigned': 'Selecting Unassigned shows only the unassigned task.',
    'empty-assignee-state': 'Selecting Ana Lima shows “Nothing assigned to Ana Lima yet” with a Clear filters button.',
    'clear-filters': 'Clear filters resets both Status and Assignee and restores all four tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const status = toolbar.getByLabel('Status');
  const assigneeButton = toolbar.locator('.dd-button');
  const popup = page.locator('.dd-popup.open');
  const search = popup.getByPlaceholder('Find a person');
  const option = name => popup.locator('.dd-option').filter({ hasText: name });
  const task = name => board.getByRole('heading', { name, exact: true });

  await t.step('Open Assignee to see each choice and its task count', async () => {
    await t.click(assigneeButton);
  }, [
    t.text('Anyone: 4 tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya Shah: 2 tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco Diaz: 1 task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana Lima: 0 tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned: 1 task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search for Priya in the assignee choices', async () => {
    await t.fill(search, 'Pri');
  }, [
    t.value('Search contains Pri', search, 'Pri'),
    t.visible('Priya remains a choice', option('Priya Shah')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Ana is filtered out', option('Ana Lima')),
    t.hidden('Unassigned is filtered out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Select Priya to see her two tasks', async () => {
    await t.click(option('Priya Shah'));
  }, [
    t.text('Task summary', toolbar.locator('.summary'), '2 of 4 tasks'),
    t.visible('Draft release notes', task('Draft release notes')),
    t.visible('Approve color palette', task('Approve color palette')),
    t.hidden('Marco’s task is removed', task('Review onboarding flow')),
    t.hidden('Unassigned task is removed', task('Fix flaky upload test'))
  ], { covers: ['filter-by-person'] });

  await t.step('Select Unassigned to see its one task', async () => {
    await t.click(assigneeButton);
    await t.fill(search, '');
    await t.click(option('Unassigned'));
  }, [
    t.text('Task summary', toolbar.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned task', task('Fix flaky upload test')),
    t.hidden('Priya’s task is removed', task('Draft release notes')),
    t.check('Only one card remains', async () => await board.locator('.card').count() === 1)
  ], { covers: ['filter-unassigned'] });

  await t.step('Select Ana to see the assignee empty state', async () => {
    await t.select(status, 'To do');
    await t.click(assigneeButton);
    await t.fill(search, '');
    await t.click(option('Ana Lima'));
  }, [
    t.value('Status is To do', status, 'To do'),
    t.text('Task summary', toolbar.locator('.summary'), '0 of 4 tasks'),
    t.visible('Ana empty-state message', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Empty-state Clear filters button', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task is removed', task('Fix flaky upload test'))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear both filters and restore all four tasks', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status resets', status, 'All statuses'),
    t.text('Assignee resets to Anyone', assigneeButton.locator('.dd-value'), 'Anyone'),
    t.text('Task summary', toolbar.locator('.summary'), '4 of 4 tasks'),
    t.visible('Draft release notes restored', task('Draft release notes')),
    t.visible('Review onboarding flow restored', task('Review onboarding flow')),
    t.visible('Approve color palette restored', task('Approve color palette')),
    t.visible('Fix flaky upload test restored', task('Fix flaky upload test')),
    t.check('All four cards are restored', async () => await board.locator('.card').count() === 4)
  ], { covers: ['clear-filters'] });
}
