export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, combine filters, and clear them to restore the full board.',
  behaviors: {
    'search-assignees': "Open the Assignee picker and search by a person's name to narrow the available choices.",
    'filter-tasks-by-assignee': 'Choose an assignee, including Unassigned, to show only matching tasks and see task counts beside picker options.',
    'combine-task-filters': 'Apply both a status and an assignee filter to narrow the board and update its visible-task summary.',
    'show-assignee-empty-state': 'Filter for someone with no assigned tasks to see a personalized empty message and a Clear filters control.',
    'clear-task-filters': 'Use Clear filters to restore all statuses and assignees and show the full task list.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.getByRole('button', { name: /Assignee/ });
  const statusSelect = page.locator('.toolbar select.filter');
  const menuOptions = page.getByRole('option');

  await t.step('Search the assignee list by name', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana Lima appears with a zero task count', page.getByRole('option', { name: /Ana Lima.*0 tasks/ })),
    t.hidden('Other assignees are filtered out', page.getByRole('option', { name: /Priya Shah/ })),
  ], { covers: ['search-assignees'] });

  await t.step('Choose Unassigned tasks', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), '');
    await t.click(page.getByRole('option', { name: /Unassigned.*1 task/ }));
  }, [
    t.text('One matching task is shown', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('The unassigned task remains on the board', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.visible('The assignee filter now shows Unassigned', assigneeButton.filter({ hasText: 'Unassigned' })),
  ], { covers: ['filter-tasks-by-assignee'] });

  await t.step('Combine a status and assignee filter', async () => {
    await t.select(statusSelect, 'To do');
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Priya Shah.*2 tasks/ }));
  }, [
    t.text('The summary reflects both filters', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Priya’s matching to-do task is shown', page.getByRole('heading', { name: 'Draft release notes' })),
    t.hidden('The previously visible unassigned task disappears', page.getByRole('heading', { name: 'Fix flaky upload test' })),
  ], { covers: ['combine-task-filters'] });

  await t.step('Show the empty state for Ana', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Ana Lima.*0 tasks/ }));
  }, [
    t.visible('Personalized empty message appears', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['show-assignee-empty-state'] });

  await t.step('Clear filters and restore the board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All four tasks are counted again', page.locator('.summary'), '4 of 4 tasks'),
    t.value('Status is reset to all statuses', statusSelect, 'All statuses'),
    t.visible('Assignee is reset to anyone', page.getByRole('button', { name: /Assignee Anyone/ })),
    t.visible('The full task list is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('The empty state is gone', page.locator('.empty')),
  ], { covers: ['clear-task-filters'] });
}
