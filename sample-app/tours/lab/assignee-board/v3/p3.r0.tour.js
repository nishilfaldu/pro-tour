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
  const anaOption = page.getByRole('option').filter({ hasText: 'Ana Lima' });

  await t.step('Search the assignee choices and see task counts', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana Lima is a searchable choice', anaOption),
    t.text('Ana has no assigned tasks', anaOption.locator('.dd-count'), '0 tasks'),
  ]);

  await t.step('Choose Ana and see the assignee-specific empty state', async () => {
    await t.click(anaOption);
  }, [
    t.visible('No tasks are assigned to Ana', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.visible('The Assignee dropdown shows Ana', page.getByRole('button', { name: /Assignee Ana Lima/ })),
  ], { covers: ['filter-by-assignee', 'empty-filter-results'] });

  await t.step('Clear the assignee filter and restore all tasks', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('The full task list is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('The assignee filter is reset', page.getByRole('button', { name: /Assignee Anyone/ })),
  ]);

  await t.step('Combine Priya and Done filters', async () => {
    await t.click(page.getByRole('button', { name: /Assignee Anyone/ }));
    await t.click(page.getByRole('option').filter({ hasText: 'Priya Shah' }));
    await t.select(page.getByLabel('Status'), 'Done');
  }, [
    t.visible('Only the matching completed task remains', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('A task outside both filters is hidden', page.getByRole('heading', { name: 'Review onboarding flow' })),
  ], { covers: ['combine-filters'] });

  await t.step('Clear both filters and restore the full list', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('The Priya task remains in the restored list', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('The Marco task returns to the list', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('The unassigned task returns to the list', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.visible('The status filter is reset', page.locator('#root select.filter').getByRole('option', { name: 'All statuses', exact: true })),
    t.visible('The assignee filter is reset', page.getByRole('button', { name: /Assignee Anyone/ })),
  ], { covers: ['clear-filters'] });
}
