export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignee choices, filter the task board, and clear filters to restore all tasks.',
  behaviors: {
    'filter-by-assignee': 'Choose a person or Unassigned in the Assignee filter to show only matching tasks, with task counts beside the choices.',
    'search-assignee-options': 'Search the open Assignee menu by typing a person’s name and see the choices narrow to matching options.',
    'filter-empty-state': 'Show a tailored empty state when the selected person has no assigned tasks or the current filters match no tasks.',
    'clear-filters': 'Use Clear filters in the toolbar or empty state to reset status and assignee filters and restore all tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const statusFilter = page.locator('.toolbar select.filter');
  const marcoOption = page.getByRole('option', { name: /Marco Diaz.*1 task/ });

  await t.step('Search the assignee choices', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco Diaz option shows one task', marcoOption),
    t.check('Only Marco matches the search', async () => await page.getByRole('listbox').getByRole('option').count() === 1),
  ], { covers: ['search-assignee-options'] });

  await t.step('Filter the board to Marco’s task', async () => {
    await t.click(marcoOption);
  }, [
    t.visible('Review onboarding flow remains', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Show the empty state for Ana', async () => {
    await t.select(statusFilter, 'Done');
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
    await t.click(page.getByRole('option', { name: /Ana Lima.*0 tasks/ }));
  }, [
    t.visible('Tailored empty message for Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['filter-empty-state'] });

  await t.step('Clear the filters from the empty state', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All four tasks are restored', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s task is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Unassigned task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.check('Status and assignee filters are reset', async () => await statusFilter.inputValue() === 'all' && await assigneeButton.locator('.dd-value').textContent() === 'Anyone'),
  ], { covers: ['clear-filters'] });
}
