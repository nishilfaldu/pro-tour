export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by person, combine assignee and status filters, and clear them when needed.',
  behaviors: {
    'assignee-choices': 'Opening the Assignee filter shows Anyone, each person, and Unassigned, with task counts beside each choice.',
    'search-assignees': 'Typing a name in Find a person narrows the assignee choices.',
    'combine-filters': 'Selecting Priya while Status is To do shows only tasks matching both filters and updates the task count.',
    'filter-unassigned': 'Selecting Unassigned shows the seed task with no assignee.',
    'empty-assignee': 'Selecting Ana shows “Nothing assigned to Ana Lima yet” and an inline Clear filters control.',
    'clear-filters': 'Clear filters resets both Status and Assignee to their defaults and restores all four seed tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const status = page.locator('.toolbar select.filter');
  const assignee = page.locator('.dd-button');
  const choice = name => page.getByRole('option').filter({ has: page.locator('.dd-option-label').getByText(name, { exact: true }) });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone has four tasks', choice('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya has two tasks', choice('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco has one task', choice('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana has no tasks', choice('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned has one task', choice('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-choices'] });

  await t.step('Search the assignee choices for Priya', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.visible('Priya remains available', choice('Priya Shah')),
    t.hidden('Anyone is filtered out', choice('Anyone')),
    t.hidden('Marco is filtered out', choice('Marco Diaz')),
    t.hidden('Ana is filtered out', choice('Ana Lima')),
    t.hidden('Unassigned is filtered out', choice('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Show Priya’s To do tasks', async () => {
    await t.click(choice('Priya Shah'));
    await t.select(status, 'To do');
  }, [
    t.value('Status is To do', status, 'To do'),
    t.text('Assignee is Priya', assignee.locator('.dd-value'), 'Priya Shah'),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Matching task is shown', page.getByText('Draft release notes')),
    t.hidden('Priya’s Done task is excluded', page.getByText('Approve color palette'))
  ], { covers: ['combine-filters'] });

  await t.step('Show the task without an assignee', async () => {
    await t.select(status, 'All statuses');
    await t.click(assignee);
    await t.click(choice('Unassigned'));
  }, [
    t.text('Assignee is Unassigned', assignee.locator('.dd-value'), 'Unassigned'),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned seed task is shown', page.getByText('Fix flaky upload test')),
    t.hidden('Priya’s task is excluded', page.getByText('Draft release notes'))
  ], { covers: ['filter-unassigned'] });

  await t.step('See the empty state for Ana', async () => {
    await t.click(assignee);
    await t.click(choice('Ana Lima'));
  }, [
    t.text('Assignee is Ana', assignee.locator('.dd-value'), 'Ana Lima'),
    t.text('No tasks match', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Ana’s empty state appears', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Inline Clear filters is available', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task is removed', page.getByText('Fix flaky upload test'))
  ], { covers: ['empty-assignee'] });

  await t.step('Clear filters and restore the whole board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status resets', status, 'All statuses'),
    t.text('Assignee resets', assignee.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks return', page.locator('.summary'), '4 of 4 tasks'),
    t.check('Four task cards are shown', async () => await page.locator('.board .card').count() === 4),
    t.visible('Release notes return', page.getByText('Draft release notes')),
    t.visible('Onboarding review returns', page.getByText('Review onboarding flow')),
    t.visible('Color palette approval returns', page.getByText('Approve color palette')),
    t.visible('Upload test returns', page.getByText('Fix flaky upload test'))
  ], { covers: ['clear-filters'] });
}
