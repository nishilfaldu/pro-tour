export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find a person, combine assignee and status filters, and clear an empty result.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Typing in Find a person narrows the Assignee options.',
    'combine-filters': 'Selecting Priya while the Done status filter is active shows only her Done task.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'empty-assignee': 'Selecting Ana shows “Nothing assigned to Ana yet” with a Clear filters control.',
    'clear-filters': 'Clicking Clear filters restores All statuses and Anyone and shows the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.toolbar .dd-button');
  const assigneeValue = page.locator('.toolbar .dd-value');
  const statusFilter = page.locator('.toolbar select.filter');
  const listbox = page.getByRole('listbox', { name: 'Assignee' });
  const option = name => listbox.getByRole('option').filter({ hasText: name });
  const task = name => page.getByRole('heading', { name, exact: true });

  await t.step('Open Assignee to see everyone and their task counts', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Assignee options open', listbox),
    t.text('Anyone has four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya has two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco has one task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana has no tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned has one task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search the Assignee menu for Priya', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Pri');
  }, [
    t.visible('Priya remains an option', option('Priya Shah')),
    t.hidden('Anyone is filtered out', option('Anyone')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Unassigned is filtered out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Set the status to Done', async () => {
    await t.select(statusFilter, 'Done');
    await t.click(assigneeButton);
  }, [
    t.value('Done is selected', statusFilter, 'Done'),
    t.hidden('Assignee menu closes', listbox),
    t.text('One Done task is shown', page.locator('.toolbar .summary'), '1 of 4 tasks')
  ]);

  await t.step('Select Priya while Done is active', async () => {
    await t.click(assigneeButton);
    await t.click(option('Priya Shah'));
  }, [
    t.value('Done remains active', statusFilter, 'Done'),
    t.text('Priya is selected', assigneeValue, 'Priya Shah'),
    t.visible('Priya’s Done task remains', task('Approve color palette')),
    t.check('The board contains only that task', async () => await page.locator('.board .card').count() === 1)
  ], { covers: ['combine-filters'] });

  await t.step('Show tasks without an assignee', async () => {
    await t.select(statusFilter, 'All statuses');
    await t.click(assigneeButton);
    await t.click(option('Unassigned'));
  }, [
    t.text('Unassigned is selected', assigneeValue, 'Unassigned'),
    t.visible('The unassigned task is shown', task('Fix flaky upload test')),
    t.hidden('Priya’s task leaves the board', task('Approve color palette')),
    t.check('Only one task remains', async () => await page.locator('.board .card').count() === 1)
  ], { covers: ['filter-unassigned'] });

  await t.step('Select Ana to see the empty state', async () => {
    await t.click(assigneeButton);
    await t.click(option('Ana Lima'));
  }, [
    t.text('Ana is selected', assigneeValue, 'Ana Lima'),
    t.visible('Ana has no assigned tasks', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters is offered', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The unassigned task disappears', task('Fix flaky upload test'))
  ], { covers: ['empty-assignee'] });

  await t.step('Clear filters to restore the full board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses is restored', statusFilter, 'All statuses'),
    t.text('Anyone is restored', assigneeValue, 'Anyone'),
    t.text('All four tasks are shown', page.locator('.toolbar .summary'), '4 of 4 tasks'),
    t.visible('Priya’s draft is back', task('Draft release notes')),
    t.visible('Marco’s task is back', task('Review onboarding flow')),
    t.visible('Priya’s Done task is back', task('Approve color palette')),
    t.visible('The unassigned task is back', task('Fix flaky upload test')),
    t.hidden('The empty state disappears', page.locator('.empty'))
  ], { covers: ['clear-filters'] });
}
