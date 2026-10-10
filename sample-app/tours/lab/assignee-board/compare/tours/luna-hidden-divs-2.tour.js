export const meta = {
  title: 'Find tasks by assignee',
  summary: 'Search assignees, combine filters, and quickly restore the full board.',
  behaviors: {
    'assignee-filter': 'Open the searchable Assignee dropdown and filter the board by a person or Unassigned, with task counts shown for each choice.',
    'combine-filters': 'Apply an assignee filter together with a status filter to show only tasks matching both choices.',
    'clear-filters': 'Use Clear filters to restore Anyone and All statuses and show the full task list again.',
    'assignee-empty-state': 'Choose an assignee with no matching tasks to see a tailored empty message and an inline Clear filters control.'
  }
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const selectedAssignee = page.locator('.dd-value');
  const search = page.getByPlaceholder('Find a person');
  const status = page.locator('select.filter');
  const summary = page.locator('.summary');
  const task = name => page.getByText(name, { exact: true });
  const option = (name, count) => page.locator('.dd-option').filter({ hasText: name }).filter({ hasText: count });

  await t.step('Open Assignee and inspect task counts', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Search people by name', search),
    t.visible('Priya has 2 tasks', option('Priya Shah', '2 tasks')),
    t.visible('Marco has 1 task', option('Marco Diaz', '1 task')),
    t.visible('Ana has no tasks', option('Ana Lima', '0 tasks')),
    t.visible('Unassigned has 1 task', option('Unassigned', '1 task'))
  ]);

  await t.step('Search for Priya and filter the board', async () => {
    await t.fill(search, 'Priya');
    await t.click(option('Priya Shah', '2 tasks'));
  }, [
    t.text('Assignee selection shows Priya Shah', selectedAssignee, 'Priya Shah'),
    t.visible('Draft release notes remains on the board', task('Draft release notes')),
    t.visible('Approve color palette remains on the board', task('Approve color palette')),
    t.hidden('Marco’s task is filtered out', task('Review onboarding flow')),
    t.text('Filtered task count', summary, '2 of 4 tasks')
  ], { covers: ['assignee-filter'] });

  await t.step('Filter the board to Unassigned tasks', async () => {
    await t.click(assigneeButton);
    await t.click(option('Unassigned', '1 task'));
  }, [
    t.text('Assignee selection shows Unassigned', selectedAssignee, 'Unassigned'),
    t.visible('The unassigned task remains', task('Fix flaky upload test')),
    t.hidden('Priya’s task is filtered out', task('Draft release notes')),
    t.text('One unassigned task', summary, '1 of 4 tasks')
  ]);

  await t.step('Combine Priya with the To do status', async () => {
    await t.click(assigneeButton);
    await t.fill(search, 'Priya');
    await t.click(option('Priya Shah', '2 tasks'));
    await t.select(status, 'To do');
  }, [
    t.visible('Only the matching task remains', task('Draft release notes')),
    t.hidden('Priya’s completed task is filtered out', task('Approve color palette')),
    t.text('Combined result count', summary, '1 of 4 tasks')
  ], { covers: ['combine-filters'] });

  await t.step('Clear both filters and restore all tasks', async () => {
    await t.click(page.getByRole('button', { name: 'Clear filters', exact: true }));
  }, [
    t.text('Assignee returns to Anyone', selectedAssignee, 'Anyone'),
    t.value('Status returns to All statuses', status, 'All statuses'),
    t.visible('All four tasks are back', task('Fix flaky upload test')),
    t.text('Full task count', summary, '4 of 4 tasks')
  ], { covers: ['clear-filters'] });

  await t.step('Choose an assignee with no tasks', async () => {
    await t.click(assigneeButton);
    await t.fill(search, 'Ana');
    await t.click(option('Ana Lima', '0 tasks'));
  }, [
    t.text('Assignee selection shows Ana Lima', selectedAssignee, 'Ana Lima'),
    t.visible('Tailored empty message', task('Nothing assigned to Ana Lima yet.')),
    t.visible('Inline Clear filters is available', page.locator('.empty').getByRole('button', { name: 'Clear filters', exact: true })),
    t.text('No matching tasks', summary, '0 of 4 tasks')
  ], { covers: ['assignee-empty-state'] });
}
