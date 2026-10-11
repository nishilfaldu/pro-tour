export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find assignees, combine filters, and reset the task board.',
  behaviors: {
    'search-assignees': 'Search the Assignee menu by a person’s name and see matching choices with task counts.',
    'filter-by-assignee': 'Choose a person or Unassigned to show only tasks assigned to that choice.',
    'combine-filters': 'Apply an assignee filter together with a status filter to narrow the task list.',
    'empty-assignee-state': 'Choose Ana Lima to see the new message that nothing is assigned to her yet, with a Clear filters action.',
    'clear-filters': 'Clear active filters to restore all statuses and assignees.'
  },
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.dd-button');
  const search = page.getByPlaceholder('Find a person');
  const option = name => page.locator('.dd-option').filter({ hasText: name });
  // Scope Status to the toolbar's native filter; task cards and the dialog have their own Status controls.
  const status = page.locator('.toolbar select.filter');
  const clear = page.getByRole('button', { name: 'Clear filters' });

  await t.step('Search assignees and view task counts', async () => {
    await t.click(assignee);
    await t.fill(search, 'Priya');
  }, [
    t.visible('Priya Shah is a matching choice with 2 tasks', option('Priya Shah').filter({ hasText: '2 tasks' })),
    t.hidden('Marco Diaz is filtered out', option('Marco Diaz')),
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya’s tasks', async () => {
    await t.click(option('Priya Shah'));
  }, [
    t.visible('Only Priya’s two tasks remain', page.getByText('2 of 4 tasks')),
    t.visible('Draft release notes is shown', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Approve color palette is shown', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s task is hidden', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('Clear filters is available', clear),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Show only unassigned tasks', async () => {
    await t.click(assignee);
    await t.click(option('Unassigned'));
  }, [
    t.visible('One unassigned task remains', page.getByText('1 of 4 tasks')),
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is hidden', page.getByRole('heading', { name: 'Draft release notes' })),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Combine Priya and To do filters', async () => {
    await t.click(assignee);
    await t.click(option('Priya Shah'));
    await t.select(status, 'To do');
  }, [
    t.value('Status is To do', status, 'To do'),
    t.visible('One task matches both filters', page.getByText('1 of 4 tasks')),
    t.visible('Priya’s to-do task remains', page.getByRole('heading', { name: 'Draft release notes' })),
    t.hidden('Priya’s completed task is removed', page.getByRole('heading', { name: 'Approve color palette' })),
  ], { covers: ['combine-filters'] });

  await t.step('Show the empty state for Ana Lima', async () => {
    await t.click(assignee);
    await t.fill(search, 'Ana');
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Nothing assigned to Ana Lima yet', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('The empty state offers Clear filters', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear filters and restore every task', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status is restored to All statuses', status, 'All statuses'),
    t.visible('Assignee filter is restored to Anyone', page.locator('.dd-value').getByText('Anyone')),
    t.visible('All four tasks return', page.getByText('4 of 4 tasks')),
    t.hidden('Clear filters is no longer needed', clear),
  ], { covers: ['clear-filters'] });
}
