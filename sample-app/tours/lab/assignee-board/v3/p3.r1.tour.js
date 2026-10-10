export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, combine filters, and clear them to restore the full task board.',
  behaviors: {
    'filter-by-assignee': 'Choose a person or Unassigned from the new searchable Assignee dropdown to show only their tasks, with task counts displayed beside the choices.',
    'combine-filters': 'Apply an assignee filter together with a status filter to narrow the task list by both choices.',
    'empty-filter-results': 'Show a filter-specific empty message and a Clear filters control when the selected filters return no tasks.',
    'clear-filters': 'Clear active status and assignee filters to restore the full task list.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.getByRole('button', { name: /Assignee Anyone/ });
  const anaOption = page.getByRole('option').filter({ has: page.locator('.dd-option-label', { hasText: 'Ana Lima' }) });

  await t.step('Search assignees and check task counts', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana Lima appears in the searchable choices', anaOption),
    t.text('Ana has no assigned tasks', anaOption.locator('.dd-count'), '0 tasks'),
  ]);

  await t.step('Choose Ana and show the filter-specific empty state', async () => {
    await t.click(anaOption);
  }, [
    t.visible('No tasks are assigned to Ana', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('The empty state offers Clear filters', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.visible('The Assignee filter shows Ana', page.getByRole('button', { name: /Assignee Ana Lima/ })),
  ], { covers: ['filter-by-assignee', 'empty-filter-results'] });

  await t.step('Clear Ana filter and restore the task list', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('The full list returns', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('The Assignee filter resets to Anyone', page.getByRole('button', { name: /Assignee Anyone/ })),
  ]);

  await t.step('Combine Priya and Done filters', async () => {
    await t.click(page.getByRole('button', { name: /Assignee Anyone/ }));
    await t.click(page.getByRole('option').filter({ has: page.locator('.dd-option-label', { hasText: 'Priya Shah' }) }));
    await t.select(page.locator('#root select.filter'), 'Done');
  }, [
    t.visible('Priya’s completed task matches both filters', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Priya’s to-do task is excluded by the status filter', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('The summary shows one matching task', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['combine-filters'] });

  await t.step('Clear both filters and restore all tasks', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('Priya’s to-do task returns', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Marco’s task returns', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('The unassigned task returns', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.visible('The status filter resets to All statuses', page.locator('#root select.filter option').filter({ hasText: 'All statuses' })),
    t.visible('The Assignee filter resets to Anyone', page.getByRole('button', { name: /Assignee Anyone/ })),
  ], { covers: ['clear-filters'] });
}
