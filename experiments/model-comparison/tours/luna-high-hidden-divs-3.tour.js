export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, see task counts, and clear filters to restore the full board.',
  behaviors: {
    'search-assignees': 'Search the assignee dropdown by a person’s name.',
    'filter-by-assignee': 'Choose a person or Unassigned to show only matching tasks, with each option displaying its task count.',
    'assignee-empty-state': 'Choose Ana Lima to see the new “Nothing assigned to Ana Lima yet” empty state and its Clear filters control.',
    'clear-filters': 'Clear active filters to restore all statuses and assignees and show the full task list.',
  },
};

export async function run(t) {
  const { page } = t;
  const popupOption = name => page.locator('.dd-popup.open .dd-option-label').filter({ hasText: new RegExp(`^${name}$`) });
  const assigneeButton = name => page.getByRole('button', { name, exact: true });
  const search = page.getByPlaceholder('Find a person');

  await t.step('Search the assignee list for Ana Lima', async () => {
    await t.click(assigneeButton('Anyone'));
    await t.fill(search, 'Ana Lima');
  }, [
    t.value('Search for Ana Lima', search, 'Ana Lima'),
    t.visible('Ana Lima is in the filtered options', popupOption('Ana Lima')),
    t.hidden('Marco Diaz is filtered out', popupOption('Marco Diaz')),
  ], { covers: ['search-assignees'] });

  await t.step('Show task counts for every assignee option', async () => {
    await t.fill(search, '');
  }, [
    t.value('Assignee search is cleared', search, ''),
    t.visible('Priya’s option shows two tasks', page.locator('.dd-popup.open .dd-option').filter({ hasText: 'Priya Shah' }).getByText('2 tasks', { exact: true })),
    t.visible('Ana’s option shows zero tasks', page.locator('.dd-popup.open .dd-option').filter({ hasText: 'Ana Lima' }).getByText('0 tasks', { exact: true })),
    t.check('Both one-task options show their counts', async () =>
      await page.locator('.dd-popup.open .dd-count').filter({ hasText: /^1 task$/ }).count() === 2),
    t.visible('Anyone option shows all four tasks', page.locator('.dd-popup.open .dd-option').filter({ hasText: 'Anyone' }).getByText('4 tasks', { exact: true })),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Choose Unassigned to show its matching task', async () => {
    await t.click(popupOption('Unassigned'));
  }, [
    t.visible('The unassigned task remains', page.getByRole('heading', { name: 'Fix flaky upload test', exact: true })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes', exact: true })),
    t.text('One matching task is shown', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned is selected', assigneeButton('Unassigned')),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Choose Marco Diaz to filter the board by person', async () => {
    await t.click(assigneeButton('Unassigned'));
    await t.click(popupOption('Marco Diaz'));
  }, [
    t.visible('Marco’s task remains', page.getByRole('heading', { name: 'Review onboarding flow', exact: true })),
    t.hidden('The unassigned task is filtered out', page.getByRole('heading', { name: 'Fix flaky upload test', exact: true })),
    t.text('One matching task is shown', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Marco Diaz is selected', assigneeButton('Marco Diaz')),
  ]);

  await t.step('Choose Ana Lima and show the assignee empty state', async () => {
    await t.click(assigneeButton('Marco Diaz'));
    await t.click(popupOption('Ana Lima'));
  }, [
    t.text('The empty state names Ana', page.locator('.empty p'), 'Nothing assigned to Ana Lima yet.'),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters', exact: true })),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters and restore all tasks', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters', exact: true }));
  }, [
    t.value('Status resets to all statuses', page.locator('.toolbar select.filter'), 'All statuses'),
    t.visible('Assignee resets to Anyone', assigneeButton('Anyone')),
    t.hidden('The empty state is dismissed', page.locator('.empty')),
    t.text('All four tasks are shown', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s task is restored', page.getByRole('heading', { name: 'Draft release notes', exact: true })),
    t.visible('Marco’s task is restored', page.getByRole('heading', { name: 'Review onboarding flow', exact: true })),
    t.visible('The unassigned task is restored', page.getByRole('heading', { name: 'Fix flaky upload test', exact: true })),
  ], { covers: ['clear-filters'] });
}
