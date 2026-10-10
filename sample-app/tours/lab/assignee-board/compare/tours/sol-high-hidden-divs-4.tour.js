export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by person, see assignee counts, and clear both filters from an empty view.',
  behaviors: {
    'assignee-counts': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with their task counts.',
    'search-assignees': 'Typing in Find a person narrows the assignee options.',
    'filter-by-person': 'Selecting Priya Shah shows only her tasks and updates the task summary.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'empty-assignee-state': 'Selecting Ana Lima shows an empty state saying nothing is assigned to her yet, with a Clear filters button.',
    'clear-filters': 'Clear filters resets both Status and Assignee and restores all four seed tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const trigger = page.locator('.toolbar .dd-button');
  const popup = page.locator('.dd-popup.open');
  const search = popup.getByPlaceholder('Find a person');
  const option = name => popup.locator('.dd-option').filter({ hasText: name });
  const status = page.locator('.toolbar select.filter');
  const board = page.locator('.board');
  const summary = page.locator('.summary');

  await t.step('Open Assignee to see each option and its task count', async () => {
    await t.click(trigger);
  }, [
    t.visible('Person search', search),
    t.text('Anyone: 4 tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya Shah: 2 tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco Diaz: 1 task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana Lima: 0 tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned: 1 task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-counts'] });

  await t.step('Search the assignee options for Priya', async () => {
    await t.fill(search, 'Priya');
  }, [
    t.value('Search query', search, 'Priya'),
    t.visible('Priya remains an option', option('Priya Shah')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Ana is filtered out', option('Ana Lima'))
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya’s tasks', async () => {
    await t.click(option('Priya Shah'));
  }, [
    t.text('Selected assignee', trigger.locator('.dd-value'), 'Priya Shah'),
    t.text('Task summary', summary, '2 of 4 tasks'),
    t.visible('Release notes', board.getByText('Draft release notes', { exact: true })),
    t.visible('Color palette', board.getByText('Approve color palette', { exact: true })),
    t.hidden('Marco’s task is removed', board.getByText('Review onboarding flow', { exact: true })),
    t.hidden('Unassigned task is removed', board.getByText('Fix flaky upload test', { exact: true }))
  ], { covers: ['filter-by-person'] });

  await t.step('Show the task without an assignee', async () => {
    await t.click(trigger);
    await t.fill(search, '');
    await t.click(option('Unassigned'));
  }, [
    t.text('Selected assignee', trigger.locator('.dd-value'), 'Unassigned'),
    t.text('Task summary', summary, '1 of 4 tasks'),
    t.visible('Unassigned task', board.getByText('Fix flaky upload test', { exact: true })),
    t.hidden('Priya’s release notes are removed', board.getByText('Draft release notes', { exact: true })),
    t.hidden('Priya’s palette task is removed', board.getByText('Approve color palette', { exact: true }))
  ], { covers: ['filter-unassigned'] });

  await t.step('Select Ana to see her empty state', async () => {
    await t.select(status, 'To do');
    await t.click(trigger);
    await t.fill(search, '');
    await t.click(option('Ana Lima'));
  }, [
    t.value('Status remains selected', status, 'To do'),
    t.text('Selected assignee', trigger.locator('.dd-value'), 'Ana Lima'),
    t.text('No tasks match Ana', summary, '0 of 4 tasks'),
    t.text('Empty-state message', page.locator('.empty p'), 'Nothing assigned to Ana Lima yet.'),
    t.visible('Clear filters in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task disappears', board.getByText('Fix flaky upload test', { exact: true }))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear both filters and restore all four tasks', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status resets', status, 'All statuses'),
    t.text('Assignee resets', trigger.locator('.dd-value'), 'Anyone'),
    t.text('All tasks return', summary, '4 of 4 tasks'),
    t.visible('Release notes restored', board.getByText('Draft release notes', { exact: true })),
    t.visible('Onboarding restored', board.getByText('Review onboarding flow', { exact: true })),
    t.visible('Palette restored', board.getByText('Approve color palette', { exact: true })),
    t.visible('Upload test restored', board.getByText('Fix flaky upload test', { exact: true })),
    t.hidden('Empty state closes', page.locator('.empty'))
  ], { covers: ['clear-filters'] });
}
