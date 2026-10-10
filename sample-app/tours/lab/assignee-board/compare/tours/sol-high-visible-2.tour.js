export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by person or see unassigned work, with counts, search, and a clear way back to the full board.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Typing a name in the Assignee search narrows the available choices.',
    'filter-by-person': 'Selecting Priya shows only her tasks and respects any active status filter.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'assignee-empty-state': 'Selecting Ana shows a personalized empty state with a Clear filters control.',
    'clear-filters': 'Clear filters restores all tasks and resets both filter controls to their defaults.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.toolbar .dd-button');
  const status = page.locator('.toolbar select.filter');
  const option = name => page.getByRole('option').filter({ hasText: name });
  const task = name => page.locator('.board').getByRole('heading', { name });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone: four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya: two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco: one task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana: no tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned: one task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search the Assignee choices for Priya', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.visible('Priya remains available', option('Priya Shah')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Anyone is filtered out', option('Anyone')),
    t.hidden('Unassigned is filtered out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Select Priya, then limit her tasks to To do', async () => {
    await t.click(option('Priya Shah'));
    await t.select(status, 'To do');
  }, [
    t.text('Priya is selected', assignee.locator('.dd-value'), 'Priya Shah'),
    t.value('To do is selected', status, 'To do'),
    t.visible('Priya’s To do task remains', task('Draft release notes')),
    t.hidden('Priya’s Done task is excluded', task('Approve color palette')),
    t.text('Only one task matches', page.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['filter-by-person'] });

  await t.step('Switch to tasks without an assignee', async () => {
    await t.click(assignee);
    await t.click(option('Unassigned'));
  }, [
    t.text('Unassigned is selected', assignee.locator('.dd-value'), 'Unassigned'),
    t.visible('The unassigned task appears', task('Fix flaky upload test')),
    t.hidden('Priya’s task disappears', task('Draft release notes')),
    t.text('One task matches', page.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Select Ana to show her personalized empty state', async () => {
    await t.click(assignee);
    await t.click(option('Ana Lima'));
  }, [
    t.text('Ana is selected', assignee.locator('.dd-value'), 'Ana Lima'),
    t.visible('Personalized message', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is available in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The previous task disappears', task('Fix flaky upload test')),
    t.text('No tasks match', page.locator('.summary'), '0 of 4 tasks')
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters to restore the full board and both defaults', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status resets', status, 'All statuses'),
    t.text('Assignee resets', assignee.locator('.dd-value'), 'Anyone'),
    t.text('All tasks return', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s task returns', task('Draft release notes')),
    t.visible('Marco’s task returns', task('Review onboarding flow')),
    t.visible('The unassigned task returns', task('Fix flaky upload test')),
    t.hidden('The empty state closes', page.locator('.empty')),
    t.hidden('Toolbar Clear filters hides at defaults', page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }))
  ], { covers: ['clear-filters'] });
}
