export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by assignee, combine filters, and clear them to restore the full board.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Searching the Assignee dropdown narrows the available choices by name.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'combine-filters': 'Selecting a person and a status shows only tasks matching both filters.',
    'assignee-empty-state': 'Selecting Ana Lima from the seed data shows “Nothing assigned to Ana Lima yet” with a Clear filters button.',
    'clear-filters': 'Clear filters resets both controls to All statuses and Anyone and restores the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const status = toolbar.locator('select.filter');
  const assignee = toolbar.locator('.dd-button');
  const popup = page.locator('.dd-popup');
  const search = popup.getByPlaceholder('Find a person');
  const option = name => popup.locator('.dd-option').filter({ has: page.getByText(name, { exact: true }) });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assignee);
  }, [
    t.text('Anyone has 4 tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya Shah has 2 tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco Diaz has 1 task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana Lima has 0 tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned has 1 task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search the assignee choices by name', async () => {
    await t.fill(search, 'Ana');
  }, [
    t.value('Search contains Ana', search, 'Ana'),
    t.visible('Ana remains available', option('Ana Lima')),
    t.hidden('Anyone is narrowed away', option('Anyone')),
    t.hidden('Priya is narrowed away', option('Priya Shah'))
  ], { covers: ['search-assignees'] });

  await t.step('Show only tasks without an assignee', async () => {
    await t.fill(search, '');
    await t.click(option('Unassigned'));
  }, [
    t.visible('Unassigned task', board.getByText('Fix flaky upload test', { exact: true })),
    t.hidden('Assigned task is removed', board.getByText('Draft release notes', { exact: true })),
    t.text('One of four tasks', toolbar.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Combine Priya Shah with Done', async () => {
    await t.click(assignee);
    await t.click(option('Priya Shah'));
    await t.select(status, 'Done');
  }, [
    t.visible('Priya is selected', assignee.getByText('Priya Shah', { exact: true })),
    t.value('Done is selected', status, 'Done'),
    t.visible('Matching task', board.getByText('Approve color palette', { exact: true })),
    t.hidden('Priya’s To do task is excluded', board.getByText('Draft release notes', { exact: true })),
    t.text('One of four tasks', toolbar.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['combine-filters'] });

  await t.step('Show Ana Lima’s empty state', async () => {
    await t.click(assignee);
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Ana empty message', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters action', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Previous match is removed', board.getByText('Approve color palette', { exact: true })),
    t.text('Zero of four tasks', toolbar.locator('.summary'), '0 of 4 tasks')
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear both filters and restore the full task list', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.visible('Anyone restored', assignee.getByText('Anyone', { exact: true })),
    t.text('All four tasks', toolbar.locator('.summary'), '4 of 4 tasks'),
    t.visible('Unassigned task restored', board.getByText('Fix flaky upload test', { exact: true })),
    t.visible('Assigned task restored', board.getByText('Draft release notes', { exact: true })),
    t.hidden('Empty state disappears', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true }))
  ], { covers: ['clear-filters'] });
}
