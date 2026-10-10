export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by person, combine assignee and status filters, and clear them from an empty result.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Typing a name in Find a person narrows the assignee options.',
    'combined-filters': 'With To do selected, choosing Priya Shah shows only her To do task.',
    'filter-unassigned': 'Choosing Unassigned shows only the unassigned task.',
    'assignee-empty-state': 'Choosing Ana Lima shows “Nothing assigned to Ana Lima yet” with a Clear filters control.',
    'clear-filters': 'Clicking Clear filters resets both filters and restores all four tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const assigneeValue = page.locator('.dd-value');
  const statusFilter = page.locator('.toolbar select.filter');
  const summary = page.locator('.toolbar .summary');
  const search = page.getByPlaceholder('Find a person');
  const option = name => page.getByRole('listbox').getByRole('option').filter({ hasText: name });
  const task = name => page.getByRole('heading', { name, exact: true });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assigneeButton);
  }, [
    t.text('Anyone: 4 tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya Shah: 2 tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco Diaz: 1 task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana Lima: 0 tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned: 1 task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search for Priya to narrow the assignee choices', async () => {
    await t.fill(search, 'Priya');
  }, [
    t.value('Search contains Priya', search, 'Priya'),
    t.visible('Priya Shah remains available', option('Priya Shah')),
    t.hidden('Anyone is filtered out', option('Anyone')),
    t.hidden('Marco Diaz is filtered out', option('Marco Diaz'))
  ], { covers: ['search-assignees'] });

  await t.step('Select To do, then choose Priya Shah', async () => {
    await t.fill(search, '');
    await t.click(option('Anyone'));
    await t.select(statusFilter, 'To do');
    await t.click(assigneeButton);
    await t.click(option('Priya Shah'));
  }, [
    t.value('Status is To do', statusFilter, 'To do'),
    t.text('Assignee is Priya Shah', assigneeValue, 'Priya Shah'),
    t.text('One matching task', summary, '1 of 4 tasks'),
    t.visible('Priya’s To do task', task('Draft release notes')),
    t.hidden('The other To do task is removed', task('Fix flaky upload test'))
  ], { covers: ['combined-filters'] });

  await t.step('Choose Unassigned to see its only task', async () => {
    await t.click(assigneeButton);
    await t.click(option('Unassigned'));
  }, [
    t.text('Assignee is Unassigned', assigneeValue, 'Unassigned'),
    t.visible('The unassigned task', task('Fix flaky upload test')),
    t.hidden('Priya’s task is removed', task('Draft release notes')),
    t.text('One matching task', summary, '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Choose Ana Lima to show the empty result', async () => {
    await t.click(assigneeButton);
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Ana’s empty message', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters is available', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The unassigned task is removed', task('Fix flaky upload test')),
    t.text('No matching tasks', summary, '0 of 4 tasks')
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear both filters to restore the full board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status returns to All statuses', statusFilter, 'All statuses'),
    t.text('Assignee returns to Anyone', assigneeValue, 'Anyone'),
    t.text('All four tasks return', summary, '4 of 4 tasks'),
    t.visible('Draft release notes returns', task('Draft release notes')),
    t.visible('Review onboarding flow returns', task('Review onboarding flow')),
    t.visible('Approve color palette returns', task('Approve color palette')),
    t.visible('Fix flaky upload test returns', task('Fix flaky upload test')),
    t.hidden('The empty message disappears', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true }))
  ], { covers: ['clear-filters'] });
}
