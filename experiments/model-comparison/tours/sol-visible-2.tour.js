export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find a person, combine assignee and status filters, and clear them to restore the board.',
  behaviors: {
    'assignee-options-counts': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with their task counts.',
    'search-assignees': 'Typing in Find a person narrows the assignee options.',
    'filter-by-person': 'Selecting a person shows only their tasks and updates the task summary, while respecting the selected status.',
    'filter-unassigned': 'Selecting Unassigned shows tasks with no assignee.',
    'empty-assignee-state': 'Selecting Ana Lima from the seed data shows “Nothing assigned to Ana Lima yet” and a Clear filters control.',
    'clear-filters': 'Clear filters restores All statuses and Anyone, showing the full task board again.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.toolbar .dd-button');
  const status = page.locator('.toolbar select.filter');
  const option = name => page.getByRole('option').filter({ hasText: name });
  const card = name => page.locator('.board .card').filter({ hasText: name });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assignee);
  }, [
    t.visible('Anyone · 4 tasks', option('Anyone').getByText('4 tasks')),
    t.visible('Priya Shah · 2 tasks', option('Priya Shah').getByText('2 tasks')),
    t.visible('Marco Diaz · 1 task', option('Marco Diaz').getByText('1 task')),
    t.visible('Ana Lima · 0 tasks', option('Ana Lima').getByText('0 tasks')),
    t.visible('Unassigned · 1 task', option('Unassigned').getByText('1 task'))
  ], { covers: ['assignee-options-counts'] });

  await t.step('Search for Priya in the assignee list', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.value('Search contains Priya', page.getByPlaceholder('Find a person'), 'Priya'),
    t.visible('Priya remains an option', option('Priya Shah')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Anyone is filtered out', option('Anyone'))
  ], { covers: ['search-assignees'] });

  await t.step('Show Priya’s tasks, then narrow them to To do', async () => {
    await t.click(option('Priya Shah'));
    await t.select(status, 'To do');
  }, [
    t.visible('Priya is selected', assignee.getByText('Priya Shah')),
    t.value('Status is To do', status, 'To do'),
    t.text('One of four tasks remains', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Priya’s To do task remains', card('Draft release notes')),
    t.hidden('Priya’s Done task is excluded', card('Approve color palette')),
    t.hidden('The unassigned To do task is excluded', card('Fix flaky upload test'))
  ], { covers: ['filter-by-person'] });

  await t.step('Switch to Unassigned while keeping the To do status', async () => {
    await t.click(assignee);
    await t.click(option('Unassigned'));
  }, [
    t.visible('Unassigned is selected', assignee.getByText('Unassigned')),
    t.value('To do remains selected', status, 'To do'),
    t.text('One of four tasks remains', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('The unassigned task is shown', card('Fix flaky upload test')),
    t.hidden('Priya’s task is excluded', card('Draft release notes'))
  ], { covers: ['filter-unassigned'] });

  await t.step('Choose Ana to see the empty assignee state', async () => {
    await t.click(assignee);
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Ana is selected', assignee.getByText('Ana Lima')),
    t.text('No tasks remain', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Ana’s empty state', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The previous task is gone', card('Fix flaky upload test'))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear filters to restore the full task board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses is restored', status, 'All statuses'),
    t.visible('Anyone is restored', assignee.getByText('Anyone')),
    t.text('All four tasks are shown', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s To do task is back', card('Draft release notes')),
    t.visible('Marco’s task is back', card('Review onboarding flow')),
    t.visible('Priya’s Done task is back', card('Approve color palette')),
    t.visible('The unassigned task is back', card('Fix flaky upload test')),
    t.hidden('The empty state is gone', page.getByText('Nothing assigned to Ana Lima yet.'))
  ], { covers: ['clear-filters'] });
}
