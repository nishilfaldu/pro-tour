export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Review assignee choices, find Ana, and reset the board filters.',
  behaviors: {
    'assignee-filter': 'Open the Assignee picker and choose a person or Unassigned to show only their matching tasks.',
    'search-assignees': 'Search the assignee picker by name to narrow its available choices.',
    'assignee-task-counts': 'See each assignee choice’s task count in the picker.',
    'empty-assignee-state': 'Choose Ana Lima to see the new empty state explaining that nothing is assigned to her, with a Clear filters action.',
    'clear-filters': 'Use Clear filters to reset status and assignee selections to All statuses and Anyone.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.getByRole('button', { name: /Assignee/ });
  const unassignedOption = page.getByRole('option').filter({ hasText: 'Unassigned' });
  const anaOption = page.getByRole('option').filter({ hasText: 'Ana Lima' });
  const statusFilter = page.locator('select.filter');

  await t.step('Open Assignee to review choices and task counts', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Assignee choices are open', page.getByRole('listbox')),
    t.check('Anyone shows 4 tasks', async () => (await page.getByRole('option').filter({ hasText: 'Anyone' }).textContent()).includes('4 tasks')),
    t.check('Priya shows 2 tasks', async () => (await page.getByRole('option').filter({ hasText: 'Priya Shah' }).textContent()).includes('2 tasks')),
    t.check('Marco shows 1 task', async () => (await page.getByRole('option').filter({ hasText: 'Marco Diaz' }).textContent()).includes('1 task')),
    t.check('Unassigned shows 1 task', async () => (await unassignedOption.textContent()).includes('1 task')),
  ], { covers: ['assignee-filter', 'assignee-task-counts'] });

  await t.step('Choose Unassigned to show its matching task', async () => {
    await t.click(unassignedOption);
  }, [
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
  ], { covers: ['assignee-filter'] });

  await t.step('Search the picker for Ana Lima', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana Lima remains in the narrowed choices', anaOption),
    t.hidden('Priya Shah is filtered out', page.getByRole('option').filter({ hasText: 'Priya Shah' })),
  ], { covers: ['search-assignees'] });

  await t.step('Choose Ana to see the empty-assignee state', async () => {
    await t.click(anaOption);
  }, [
    t.visible('Empty state explains Ana has no assigned tasks', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear filters to restore the full board', async () => {
    await t.select(statusFilter, 'To do');
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status is reset to All statuses', statusFilter, 'All statuses'),
    t.text('Assignee is reset to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.visible('All four seeded tasks are shown', page.getByText('4 of 4 tasks')),
    t.hidden('Clear filters is hidden when filters are reset', page.getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['clear-filters'] });
}
