export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search the assignee list, see task counts, and filter or reset the board.',
  behaviors: {
    'search-assignees': 'Open the Assignee menu and search by name to narrow the listed people.',
    'filter-by-assignee': 'Choose a person or Unassigned to show matching tasks, with task counts displayed beside the choices.',
    'clear-filters': 'Apply filters, then use Clear filters to restore all tasks and reset both filter controls.',
    'assignee-empty-state': 'Choose Ana Lima to see the new message that nothing is assigned to her, with a Clear filters button.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const unassignedOption = page.locator('.dd-option').filter({ has: page.getByText('Unassigned', { exact: true }) });
  const priyaOption = page.locator('.dd-option').filter({ has: page.getByText('Priya Shah', { exact: true }) });
  const anaOption = page.locator('.dd-option').filter({ has: page.getByText('Ana Lima', { exact: true }) });

  await t.step('Open Assignee to see task counts beside each choice', async () => {
    await t.click(assigneeButton);
  }, [
    t.text('Priya has 2 tasks', priyaOption.locator('.dd-count'), '2 tasks'),
    t.text('Unassigned has 1 task', unassignedOption.locator('.dd-count'), '1 task'),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Choose Unassigned to show its matching task', async () => {
    await t.click(unassignedOption);
  }, [
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Clear filters to restore the full board', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status resets to All statuses', page.locator('.toolbar select.filter'), 'All statuses'),
    t.text('Assignee resets to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks return', page.locator('.summary'), '4 of 4 tasks'),
    t.hidden('Toolbar Clear filters is hidden again', page.locator('.toolbar').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['clear-filters'] });

  await t.step('Search the Assignee list for Ana Lima', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.hidden('Other people are removed from the narrowed list', priyaOption),
    t.visible('Ana Lima remains in the narrowed list', anaOption),
  ], { covers: ['search-assignees'] });

  await t.step('Choose Ana to see her empty state', async () => {
    await t.click(anaOption);
  }, [
    t.visible('Nothing is assigned to Ana Lima', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('The empty state offers Clear filters', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.text('No tasks match Ana', page.locator('.summary'), '0 of 4 tasks'),
  ], { covers: ['assignee-empty-state'] });
}
