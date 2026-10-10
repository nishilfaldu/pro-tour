export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Review task counts, search for a person, combine assignee and status filters, and clear the view.',
  behaviors: {
    'assignee-options': 'Opening the Assignee dropdown shows Anyone, each person, and Unassigned with their task counts.',
    'search-assignees': 'Typing a name in Find a person narrows the dropdown options.',
    'filter-by-person': 'Selecting Priya shows only her tasks, including when a status filter is also active.',
    'filter-unassigned': 'Selecting Unassigned shows the unassigned task.',
    'assignee-empty-state': 'Selecting Ana shows an empty state saying nothing is assigned to her yet, with a Clear filters control.',
    'clear-filters': 'Clear filters restores All statuses and Anyone, shows all tasks, and hides the toolbar reset control.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.toolbar .dd-button');
  const status = page.locator('.toolbar select.filter');
  const summary = page.locator('.toolbar .summary');
  const board = page.locator('.board');
  const option = name => page.getByRole('listbox').getByRole('option').filter({ has: page.locator('.dd-option-label').getByText(name, { exact: true }) });

  await t.step('Open Assignee to see everyone and their task counts', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone has four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya has two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco has one task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana has no tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned has one task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search the assignee list for Priya', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.visible('Priya remains an option', option('Priya Shah')),
    t.hidden('Anyone is filtered out', option('Anyone')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Ana is filtered out', option('Ana Lima')),
    t.hidden('Unassigned is filtered out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Choose Priya to see her two tasks', async () => {
    await t.click(option('Priya Shah'));
  }, [
    t.text('Two of four tasks', summary, '2 of 4 tasks'),
    t.visible('Release notes', board.getByText('Draft release notes')),
    t.visible('Color palette', board.getByText('Approve color palette')),
    t.hidden('Marco’s task is excluded', board.getByText('Review onboarding flow')),
    t.hidden('Unassigned task is excluded', board.getByText('Fix flaky upload test'))
  ], { covers: ['filter-by-person'] });

  await t.step('Combine Priya with the To do status', async () => {
    await t.select(status, 'To do');
  }, [
    t.value('To do is selected', status, 'To do'),
    t.text('One of four tasks', summary, '1 of 4 tasks'),
    t.visible('Priya’s To do task remains', board.getByText('Draft release notes')),
    t.hidden('Priya’s Done task is excluded', board.getByText('Approve color palette'))
  ], { covers: ['filter-by-person'] });

  await t.step('Switch to Unassigned', async () => {
    await t.click(assignee);
    await t.click(option('Unassigned'));
  }, [
    t.text('Unassigned is selected', assignee.locator('.dd-value'), 'Unassigned'),
    t.text('One of four tasks', summary, '1 of 4 tasks'),
    t.visible('The unassigned task', board.getByText('Fix flaky upload test')),
    t.hidden('Priya’s task is excluded', board.getByText('Draft release notes'))
  ], { covers: ['filter-unassigned'] });

  await t.step('Choose Ana to see her empty state', async () => {
    await t.click(assignee);
    await t.click(option('Ana Lima'));
  }, [
    t.text('No matching tasks', summary, '0 of 4 tasks'),
    t.visible('Ana’s empty-state message', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The unassigned task disappears', board.getByText('Fix flaky upload test'))
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters to restore the full board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.text('Anyone restored', assignee.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks shown', summary, '4 of 4 tasks'),
    t.visible('Release notes restored', board.getByText('Draft release notes')),
    t.visible('Onboarding task restored', board.getByText('Review onboarding flow')),
    t.visible('Color palette restored', board.getByText('Approve color palette')),
    t.visible('Unassigned task restored', board.getByText('Fix flaky upload test')),
    t.hidden('Toolbar reset control disappears', page.locator('.toolbar').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Empty state disappears', page.locator('.empty'))
  ], { covers: ['clear-filters'] });
}
