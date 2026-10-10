export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by assignee, see matching counts, and clear filters to restore the full board.',
  behaviors: {
    'filter-by-assignee': 'Choose a person or Unassigned in the Assignee filter to show only matching tasks, with task counts beside the choices.',
    'search-assignee-options': 'Search the open Assignee menu by typing a person’s name and see the choices narrow to matching options.',
    'filter-empty-state': 'Show a tailored empty state when the selected person has no assigned tasks or the current filters match no tasks.',
    'clear-filters': 'Use Clear filters in the toolbar or empty state to reset status and assignee filters and restore all tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.getByRole('button', { name: /Assignee/ });
  const optionList = page.getByRole('listbox');

  await t.step('Search the assignee choices', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco Diaz option with its task count', page.getByRole('option', { name: /Marco Diaz.*1 task/ })),
    t.check('The matching option is shown', async () => await optionList.getByRole('option').count() === 1),
  ], { covers: ['search-assignee-options'] });

  await t.step('Filter the board to Priya’s tasks', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Priya Shah/ }));
  }, [
    t.visible('Draft release notes remains', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Approve color palette remains', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s task is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.text('Two of four tasks match', page.locator('.summary'), '2 of 4 tasks'),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Show the empty state for Ana', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Ana Lima/ }));
  }, [
    t.visible('Tailored empty message for Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['filter-empty-state'] });

  await t.step('Clear status and assignee filters', async () => {
    await t.select(page.getByLabel('Status').first(), 'Done');
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All four tasks are restored', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s task is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Unassigned task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.check('Status and assignee filters are reset', async () => await page.getByLabel('Status').first().inputValue() === 'all' && await assigneeButton.locator('.dd-value').textContent() === 'Anyone'),
  ], { covers: ['clear-filters'] });
}
