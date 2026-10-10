export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, combine filters, and clear them to restore the full task board.',
  behaviors: {
    'search-assignees': 'Typing in “Find a person” narrows the choices in the Assignee menu.',
    'filter-by-person': 'Selecting Priya Shah shows only her assigned tasks.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'combine-filters': 'Selecting both a status and an assignee shows only tasks matching both choices.',
    'empty-assignee-state': 'Selecting Ana Lima shows an empty board with “Nothing assigned to Ana Lima yet.”',
    'clear-filters': 'Clear filters restores All statuses and Anyone, bringing back all seed tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const status = toolbar.getByLabel('Status');
  const search = page.getByPlaceholder('Find a person');
  const choice = name => page.locator('.dd-popup.open').getByText(name, { exact: true });
  const assigneeButton = name => toolbar.locator('.dd-button').getByText(name, { exact: true });
  const task = name => board.getByText(name, { exact: true });
  const summary = toolbar.locator('.summary');

  await t.step('Search the Assignee menu for Priya', async () => {
    await t.click(assigneeButton('Anyone'));
    await t.fill(search, 'Pri');
  }, [
    t.visible('Priya remains a choice', choice('Priya Shah')),
    t.hidden('Marco is filtered from the menu', choice('Marco Diaz')),
    t.hidden('Ana is filtered from the menu', choice('Ana Lima'))
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya’s tasks', async () => {
    await t.click(choice('Priya Shah'));
  }, [
    t.text('Two of four tasks', summary, '2 of 4 tasks'),
    t.visible('Release notes', task('Draft release notes')),
    t.visible('Color palette', task('Approve color palette')),
    t.hidden('Marco’s task is removed', task('Review onboarding flow')),
    t.hidden('Unassigned task is removed', task('Fix flaky upload test'))
  ], { covers: ['filter-by-person'] });

  await t.step('Show tasks without an assignee', async () => {
    await t.click(assigneeButton('Priya Shah'));
    await t.fill(search, '');
    await t.click(choice('Unassigned'));
  }, [
    t.text('One of four tasks', summary, '1 of 4 tasks'),
    t.visible('Unassigned task remains', task('Fix flaky upload test')),
    t.hidden('Priya’s release notes are removed', task('Draft release notes')),
    t.hidden('Priya’s color task is removed', task('Approve color palette'))
  ], { covers: ['filter-unassigned'] });

  await t.step('Combine Done with Priya Shah', async () => {
    await t.select(status, 'Done');
    await t.click(assigneeButton('Unassigned'));
    await t.fill(search, '');
    await t.click(choice('Priya Shah'));
  }, [
    t.value('Done status selected', status, 'Done'),
    t.text('Only one matching task', summary, '1 of 4 tasks'),
    t.visible('Priya’s done task', task('Approve color palette')),
    t.hidden('Unassigned task is excluded', task('Fix flaky upload test'))
  ], { covers: ['combine-filters'] });

  await t.step('Show Ana’s empty board', async () => {
    await t.click(assigneeButton('Priya Shah'));
    await t.fill(search, '');
    await t.click(choice('Ana Lima'));
  }, [
    t.text('No matching tasks', summary, '0 of 4 tasks'),
    t.visible('Ana empty state', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.hidden('Previous task is removed', task('Approve color palette'))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear filters to restore the board', async () => {
    await t.click(toolbar.getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.visible('Anyone restored', assigneeButton('Anyone')),
    t.text('All four tasks restored', summary, '4 of 4 tasks'),
    t.visible('Release notes restored', task('Draft release notes')),
    t.visible('Onboarding restored', task('Review onboarding flow')),
    t.visible('Color palette restored', task('Approve color palette')),
    t.visible('Upload test restored', task('Fix flaky upload test')),
    t.hidden('Ana empty state removed', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true }))
  ], { covers: ['clear-filters'] });
}
