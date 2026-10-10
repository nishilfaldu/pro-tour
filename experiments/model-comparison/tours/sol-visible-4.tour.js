export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Reviewers can find an assignee, combine filters, and clear them to restore the full board.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with current task counts.',
    'search-assignees': 'Typing in Find a person narrows the assignee options.',
    'combined-filters': 'Selecting Priya while To do is selected shows only Priya’s To do tasks.',
    'unassigned-filter': 'Selecting Unassigned shows the unassigned task.',
    'unassigned-person-empty-state': 'Selecting Ana shows “Nothing assigned to Ana Lima yet” with a Clear filters control.',
    'clear-filters': 'Clear filters restores All statuses and Anyone, bringing back all tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.locator('.dd-button');
  const status = page.locator('.toolbar select.filter');
  const optionCount = name => page.getByRole('option').filter({ hasText: name }).locator('.dd-count');

  await t.step('Open Assignee to see every choice and its current task count', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone: 4 tasks', optionCount('Anyone'), '4 tasks'),
    t.text('Priya: 2 tasks', optionCount('Priya Shah'), '2 tasks'),
    t.text('Marco: 1 task', optionCount('Marco Diaz'), '1 task'),
    t.text('Ana: 0 tasks', optionCount('Ana Lima'), '0 tasks'),
    t.text('Unassigned: 1 task', optionCount('Unassigned'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search for Priya in Find a person', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Pri');
  }, [
    t.value('Search contains Pri', page.getByPlaceholder('Find a person'), 'Pri'),
    t.visible('Priya remains available', page.getByRole('option', { name: /Priya Shah/ })),
    t.hidden('Marco is filtered out', page.getByRole('option', { name: /Marco Diaz/ })),
    t.hidden('Anyone is filtered out', page.getByRole('option', { name: /Anyone/ }))
  ], { covers: ['search-assignees'] });

  await t.step('Combine Priya with To do to show her matching task', async () => {
    await t.click(page.getByRole('option', { name: /Priya Shah/ }));
    await t.select(status, 'To do');
  }, [
    t.value('Status is To do', status, 'To do'),
    t.text('Assignee is Priya', page.locator('.dd-button .dd-value'), 'Priya Shah'),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Priya’s To do task', page.getByRole('heading', { name: 'Draft release notes' })),
    t.hidden('Priya’s Done task is excluded', page.getByRole('heading', { name: 'Approve color palette' }))
  ], { covers: ['combined-filters'] });

  await t.step('Choose Unassigned to see the unassigned To do task', async () => {
    await t.click(assignee);
    await t.click(page.getByRole('option', { name: /Unassigned/ }));
  }, [
    t.text('Assignee is Unassigned', page.locator('.dd-button .dd-value'), 'Unassigned'),
    t.visible('Unassigned task', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is excluded', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['unassigned-filter'] });

  await t.step('Choose Ana to see her empty state and Clear filters', async () => {
    await t.click(assignee);
    await t.click(page.getByRole('option', { name: /Ana Lima/ }));
  }, [
    t.visible('Ana’s empty state', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters in empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task is excluded', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('No tasks match', page.locator('.summary'), '0 of 4 tasks')
  ], { covers: ['unassigned-person-empty-state'] });

  await t.step('Clear filters to restore the complete task board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.text('Anyone restored', page.locator('.dd-button .dd-value'), 'Anyone'),
    t.text('All four tasks restored', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Priya’s task is back', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Unassigned task is back', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Empty state is gone', page.getByText('Nothing assigned to Ana Lima yet.'))
  ], { covers: ['clear-filters'] });
}
