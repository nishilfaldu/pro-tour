export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find a teammate, combine assignee and status filters, and clear them to restore the full board.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with current task counts.',
    'search-assignees': 'Typing a name in Find a person narrows the dropdown options.',
    'filter-by-person': 'Selecting a person shows only their tasks, respects the selected status, and updates the task summary.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'empty-assignee-state': 'Selecting Ana Lima shows an empty state saying nothing is assigned to her yet, with a Clear filters control.',
    'clear-filters': 'Clear filters restores All statuses and Anyone, showing all seeded tasks again.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.toolbar .dd-button');
  const status = page.locator('.toolbar select.filter');
  const summary = page.locator('.toolbar .summary');
  const option = name => page.getByRole('option').filter({ has: page.locator('.dd-option-label').getByText(name, { exact: true }) });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone has four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya has two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco has one task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana has no tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned has one task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search the assignee choices for Priya', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.value('Search contains Priya', page.getByPlaceholder('Find a person'), 'Priya'),
    t.visible('Priya remains an option', option('Priya Shah')),
    t.hidden('Anyone is filtered out', option('Anyone')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Ana is filtered out', option('Ana Lima')),
    t.hidden('Unassigned is filtered out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya’s To do tasks', async () => {
    await t.click(option('Priya Shah'));
    await t.select(status, 'To do');
  }, [
    t.text('Priya is selected', assignee.locator('.dd-value'), 'Priya Shah'),
    t.value('To do is selected', status, 'To do'),
    t.text('One of four tasks matches', summary, '1 of 4 tasks'),
    t.visible('Priya’s To do task remains', page.getByRole('heading', { name: 'Draft release notes' })),
    t.hidden('Priya’s Done task is excluded', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s task is excluded', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Unassigned task is excluded', page.getByRole('heading', { name: 'Fix flaky upload test' }))
  ], { covers: ['filter-by-person'] });

  await t.step('Switch to tasks with no assignee', async () => {
    await t.click(assignee);
    await t.click(option('Unassigned'));
  }, [
    t.text('Unassigned is selected', assignee.locator('.dd-value'), 'Unassigned'),
    t.value('To do status remains selected', status, 'To do'),
    t.text('One of four tasks matches', summary, '1 of 4 tasks'),
    t.visible('The unassigned task appears', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task disappears', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('The only card has no assignee', page.locator('.board .card .owner'), '–Unassigned')
  ], { covers: ['filter-unassigned'] });

  await t.step('Select Ana to see her empty state', async () => {
    await t.click(assignee);
    await t.click(option('Ana Lima'));
  }, [
    t.text('Ana is selected', assignee.locator('.dd-value'), 'Ana Lima'),
    t.text('No tasks match', summary, '0 of 4 tasks'),
    t.visible('Ana has nothing assigned yet', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The previous task disappears', page.getByRole('heading', { name: 'Fix flaky upload test' }))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear both filters to restore the board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses is restored', status, 'All statuses'),
    t.text('Anyone is restored', assignee.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks return', summary, '4 of 4 tasks'),
    t.visible('Release notes return', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Onboarding review returns', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('Color palette returns', page.getByRole('heading', { name: 'Approve color palette' })),
    t.visible('Upload test returns', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Ana’s empty state disappears', page.getByText('Nothing assigned to Ana Lima yet.'))
  ], { covers: ['clear-filters'] });
}
