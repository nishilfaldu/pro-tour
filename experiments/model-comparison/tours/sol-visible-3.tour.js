export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by person, combine assignee and status filters, and clear them to return to the full board.',
  behaviors: {
    'assignee-options': 'Opening the Assignee dropdown shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Typing a name in Find a person narrows the dropdown options.',
    'combine-filters': 'Selecting Priya Shah and To do shows only tasks matching both filters.',
    'filter-unassigned': 'Selecting Unassigned shows the task with no assignee.',
    'empty-assignee': 'Selecting Ana Lima shows “Nothing assigned to Ana Lima yet” and a Clear filters control.',
    'clear-filters': 'Clear filters resets both controls and restores the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const board = page.locator('.board');
  const assignee = page.locator('.toolbar .dd-button');
  const status = page.locator('.toolbar select.filter');
  const listbox = page.getByRole('listbox');
  const optionLabel = index => listbox.locator('.dd-option').nth(index).locator('.dd-option-label');
  const optionCount = index => listbox.locator('.dd-option').nth(index).locator('.dd-count');

  await t.step('Open Assignee to see everyone and their task counts', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone', optionLabel(0), 'Anyone'),
    t.text('All tasks', optionCount(0), '4 tasks'),
    t.text('Priya Shah', optionLabel(1), 'Priya Shah'),
    t.text('Priya’s tasks', optionCount(1), '2 tasks'),
    t.text('Marco Diaz', optionLabel(2), 'Marco Diaz'),
    t.text('Marco’s task', optionCount(2), '1 task'),
    t.text('Ana Lima', optionLabel(3), 'Ana Lima'),
    t.text('Ana’s tasks', optionCount(3), '0 tasks'),
    t.text('Unassigned', optionLabel(4), 'Unassigned'),
    t.text('Unassigned task', optionCount(4), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search the Assignee menu for Priya', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.value('Search query', page.getByPlaceholder('Find a person'), 'Priya'),
    t.text('Priya is the matching option', optionLabel(0), 'Priya Shah'),
    t.hidden('Anyone is filtered out', listbox.getByText('Anyone')),
    t.hidden('Marco is filtered out', listbox.getByText('Marco Diaz')),
    t.hidden('Ana is filtered out', listbox.getByText('Ana Lima')),
    t.hidden('Unassigned is filtered out', listbox.getByText('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya’s To do task', async () => {
    await t.click(listbox.getByRole('option'));
    await t.select(status, 'To do');
  }, [
    t.text('Assignee is Priya', page.locator('.dd-value'), 'Priya Shah'),
    t.value('Status is To do', status, 'To do'),
    t.text('One task matches both filters', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Draft release notes remains', board.getByText('Draft release notes')),
    t.hidden('Priya’s Done task is excluded', board.getByText('Approve color palette')),
    t.hidden('Marco’s task is excluded', board.getByText('Review onboarding flow')),
    t.hidden('Unassigned task is excluded', board.getByText('Fix flaky upload test'))
  ], { covers: ['combine-filters'] });

  await t.step('Show the unassigned To do task', async () => {
    await t.click(assignee);
    await t.click(listbox.getByRole('option', { name: 'Unassigned 1 task' }));
  }, [
    t.text('Assignee is Unassigned', page.locator('.dd-value'), 'Unassigned'),
    t.value('Status remains To do', status, 'To do'),
    t.visible('Unassigned task appears', board.getByText('Fix flaky upload test')),
    t.hidden('Priya’s task disappears', board.getByText('Draft release notes')),
    t.text('One task matches', page.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Show the empty state for Ana', async () => {
    await t.click(assignee);
    await t.click(listbox.getByRole('option', { name: 'Ana Lima 0 tasks' }));
  }, [
    t.text('Assignee is Ana', page.locator('.dd-value'), 'Ana Lima'),
    t.visible('Nothing assigned to Ana Lima yet', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task disappears', board.getByText('Fix flaky upload test')),
    t.text('No tasks match', page.locator('.summary'), '0 of 4 tasks')
  ], { covers: ['empty-assignee'] });

  await t.step('Clear filters to restore the whole board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('Assignee resets to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.value('Status resets to All statuses', status, 'All statuses'),
    t.text('All four tasks return', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s task returns', board.getByText('Draft release notes')),
    t.visible('Marco’s task returns', board.getByText('Review onboarding flow')),
    t.visible('Priya’s Done task returns', board.getByText('Approve color palette')),
    t.visible('Unassigned task returns', board.getByText('Fix flaky upload test')),
    t.hidden('Empty state disappears', page.getByText('Nothing assigned to Ana Lima yet.'))
  ], { covers: ['clear-filters'] });
}
