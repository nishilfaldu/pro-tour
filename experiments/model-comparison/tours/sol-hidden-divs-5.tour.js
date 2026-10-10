export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by person, combine assignee and status filters, and clear them to restore the full board.',
  behaviors: {
    'filter-by-person': 'Selecting Priya or Marco shows only tasks assigned to that person and updates the task summary.',
    'search-assignees': 'Typing a name in the assignee dropdown narrows its person options.',
    'filter-unassigned': 'Selecting Unassigned shows the seed task with no assignee.',
    'combine-filters': 'Selecting both a status and an assignee shows only tasks matching both choices.',
    'empty-assignee-state': 'Selecting Ana shows “Nothing assigned to Ana Lima yet” with a Clear filters button.',
    'clear-filters': 'Clear filters resets both controls to All statuses and Anyone and restores the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const card = name => board.locator('.card').filter({ hasText: name });
  const status = toolbar.locator('select.filter');
  const assignee = toolbar.locator('.dd-button');
  const option = name => page.locator('.dd-popup.open .dd-option').getByText(name, { exact: true });
  const summary = toolbar.locator('.summary');

  await t.step('Choose Priya to show her two tasks.', async () => {
    await t.click(assignee);
    await t.click(option('Priya Shah'));
  }, [
    t.visible('Release notes assigned to Priya', card('Draft release notes')),
    t.visible('Palette approval assigned to Priya', card('Approve color palette')),
    t.hidden('Marco’s task is filtered out', card('Review onboarding flow')),
    t.text('Two of four tasks', summary, '2 of 4 tasks')
  ], { covers: ['filter-by-person'] });

  await t.step('Search the assignee choices for Marco.', async () => {
    await t.click(assignee);
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco remains an option', option('Marco Diaz')),
    t.hidden('Priya is narrowed out', option('Priya Shah')),
    t.hidden('Unassigned is narrowed out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Switch to Marco and update the task count.', async () => {
    await t.click(option('Marco Diaz'));
  }, [
    t.visible('Marco’s onboarding task', card('Review onboarding flow')),
    t.hidden('Priya’s release notes are filtered out', card('Draft release notes')),
    t.text('One of four tasks', summary, '1 of 4 tasks')
  ], { covers: ['filter-by-person'] });

  await t.step('Show the task without an assignee.', async () => {
    await t.click(assignee);
    await t.click(option('Unassigned'));
  }, [
    t.visible('Unassigned upload test', card('Fix flaky upload test')),
    t.hidden('Marco’s task is filtered out', card('Review onboarding flow')),
    t.text('One of four tasks', summary, '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Combine Done with Priya to isolate her completed task.', async () => {
    await t.select(status, 'Done');
    await t.click(assignee);
    await t.click(option('Priya Shah'));
  }, [
    t.value('Done status selected', status, 'Done'),
    t.visible('Priya’s completed task', card('Approve color palette')),
    t.hidden('Unassigned task no longer matches', card('Fix flaky upload test')),
    t.text('One of four tasks', summary, '1 of 4 tasks')
  ], { covers: ['combine-filters'] });

  await t.step('Choose Ana to show her empty assignment state.', async () => {
    await t.click(assignee);
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Ana’s empty state', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters action', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Priya’s task disappears', card('Approve color palette')),
    t.text('No matching tasks', summary, '0 of 4 tasks')
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear both filters and restore the full board.', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.text('Anyone restored', assignee.locator('.dd-value'), 'Anyone'),
    t.visible('Release notes restored', card('Draft release notes')),
    t.visible('Onboarding task restored', card('Review onboarding flow')),
    t.visible('Palette task restored', card('Approve color palette')),
    t.visible('Unassigned task restored', card('Fix flaky upload test')),
    t.hidden('Ana’s empty state disappears', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.text('All four tasks', summary, '4 of 4 tasks')
  ], { covers: ['clear-filters'] });
}
