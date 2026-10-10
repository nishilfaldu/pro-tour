export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, combine filters, and clear them to restore the full board.',
  behaviors: {
    'search-assignees': 'Typing in “Find a person” narrows the assignee dropdown choices.',
    'filter-by-person': 'Selecting Priya Shah shows only her two tasks and updates the task count.',
    'filter-unassigned': 'Selecting Unassigned shows only “Fix flaky upload test.”',
    'combine-filters': 'Choosing an assignee and a status shows only tasks that match both.',
    'empty-assignee-state': 'Selecting Ana Lima shows “Nothing assigned to Ana Lima yet” with a Clear filters control.',
    'clear-filters': 'Clear filters resets both controls and restores all four seed tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const popup = page.locator('.dd-popup');
  const assignee = toolbar.locator('.dd-button');
  const search = page.getByPlaceholder('Find a person');
  const status = toolbar.getByLabel('Status');

  await t.step('Search the assignee choices for Priya', async () => {
    await t.click(assignee);
    await t.fill(search, 'Priya');
  }, [
    t.visible('Priya is a matching choice', popup.getByText('Priya Shah', { exact: true })),
    t.hidden('Marco is filtered from the choices', popup.getByText('Marco Diaz', { exact: true })),
    t.hidden('Ana is filtered from the choices', popup.getByText('Ana Lima', { exact: true }))
  ], { covers: ['search-assignees'] });

  await t.step('Show Priya’s two tasks', async () => {
    await t.click(popup.getByText('Priya Shah', { exact: true }));
  }, [
    t.text('Two of four tasks', page.locator('.summary'), '2 of 4 tasks'),
    t.visible('Release notes', board.getByText('Draft release notes', { exact: true })),
    t.visible('Color palette', board.getByText('Approve color palette', { exact: true })),
    t.hidden('Marco’s task is excluded', board.getByText('Review onboarding flow', { exact: true })),
    t.hidden('Unassigned task is excluded', board.getByText('Fix flaky upload test', { exact: true }))
  ], { covers: ['filter-by-person'] });

  await t.step('Combine Priya with the Done status', async () => {
    await t.select(status, 'Done');
  }, [
    t.text('One matching task', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Completed Priya task', board.getByText('Approve color palette', { exact: true })),
    t.hidden('Priya’s other task is excluded', board.getByText('Draft release notes', { exact: true }))
  ], { covers: ['combine-filters'] });

  await t.step('Show the unassigned task', async () => {
    await t.select(status, 'All statuses');
    await t.click(assignee);
    await t.fill(search, 'Unassigned');
    await t.click(popup.getByText('Unassigned', { exact: true }));
  }, [
    t.text('One unassigned task', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Flaky upload test', board.getByText('Fix flaky upload test', { exact: true })),
    t.hidden('Assigned task is excluded', board.getByText('Draft release notes', { exact: true }))
  ], { covers: ['filter-unassigned'] });

  await t.step('See Ana’s empty state', async () => {
    await t.click(assignee);
    await t.fill(search, 'Ana');
    await t.click(popup.getByText('Ana Lima', { exact: true }));
    await t.select(status, 'Done');
  }, [
    t.text('No matching tasks', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Ana’s empty state', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('The task list is empty', board.locator('.card'))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear both filters and restore the board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses selected', status, 'All statuses'),
    t.visible('Anyone selected', assignee.getByText('Anyone', { exact: true })),
    t.text('All four tasks', page.locator('.summary'), '4 of 4 tasks'),
    t.check('Four task cards restored', async () => await board.locator('.card').count() === 4),
    t.hidden('Ana’s empty state is gone', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true }))
  ], { covers: ['clear-filters'] });
}
