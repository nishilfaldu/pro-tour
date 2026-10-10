export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by owner, combine filters, and reset the board in a few clicks.',
  behaviors: {
    'filter-by-assignee': 'Choose a person or Unassigned in the Assignee dropdown to show only matching tasks, with task counts displayed for each choice.',
    'search-assignees': 'Search within the Assignee dropdown by typing a person’s name to narrow the choices.',
    'combine-filters': 'Apply an assignee choice together with a status filter to narrow the board by both criteria.',
    'assignee-empty-state': 'Select Ana Lima to see the empty state explaining that nothing is assigned to her, with a Clear filters action.',
    'clear-filters': 'Clear active filters to restore all statuses, Anyone, and the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = label => page.locator('.dd-button').filter({ has: page.locator('.dd-value', { hasText: label }) });
  const option = name => page.locator('.dd-option').filter({ has: page.locator('.dd-option-label', { hasText: name }) });
  const status = page.locator('.toolbar select.filter');
  const cards = page.locator('.board .card');
  const clear = page.locator('.toolbar').getByRole('button', { name: 'Clear filters' });

  await t.step('Open Assignee to see task counts', async () => {
    await t.click(assigneeButton('Anyone'));
  }, [
    t.text('Anyone includes all 4 tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya Shah has 2 tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco Diaz has 1 task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Unassigned has 1 task', option('Unassigned').locator('.dd-count'), '1 task'),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Search the assignee choices for Marco', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco Diaz remains in the narrowed choices', option('Marco Diaz')),
    t.hidden('Priya Shah is filtered out', option('Priya Shah')),
    t.hidden('Unassigned is filtered out', option('Unassigned')),
  ], { covers: ['search-assignees'] });

  await t.step('Choose Marco and combine it with To do', async () => {
    await t.click(option('Marco Diaz'));
    await t.select(status, 'To do');
  }, [
    t.value('Status is To do', status, 'To do'),
    t.visible('Assignee is Marco Diaz', assigneeButton('Marco Diaz')),
    t.text('No task matches both filters', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Combined filters show the empty status message', page.getByText('No tasks match this status.')),
    t.visible('Clear filters is available', clear),
  ], { covers: ['combine-filters'] });

  await t.step('Select Ana Lima and show her empty state', async () => {
    await t.select(status, 'All statuses');
    await t.click(assigneeButton('Marco Diaz'));
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Nothing is assigned to Ana Lima yet', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('Clear filters is offered in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters to restore the full board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status returns to All statuses', status, 'All statuses'),
    t.visible('Assignee returns to Anyone', assigneeButton('Anyone')),
    t.text('All 4 tasks return', page.locator('.summary'), '4 of 4 tasks'),
    t.check('Four task cards are visible', async () => await cards.count() === 4),
    t.hidden('The empty state is gone', page.locator('.empty')),
    t.hidden('The toolbar Clear filters action is hidden', clear),
  ], { covers: ['clear-filters'] });
}
