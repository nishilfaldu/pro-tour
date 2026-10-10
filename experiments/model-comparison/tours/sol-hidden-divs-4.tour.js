export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find a teammate, combine assignee and status filters, and clear them to return to the full board.',
  behaviors: {
    'search-assignees': 'Searching the Assignee dropdown narrows its choices to matching people.',
    'filter-by-person': 'Selecting a person shows only tasks assigned to them.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'combine-filters': 'Choosing a status and an assignee shows only tasks matching both.',
    'assignee-empty-state': 'Selecting Ana Lima shows the message “Nothing assigned to Ana Lima yet” and a Clear filters control.',
    'clear-filters': 'Clear filters resets both filters and restores the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const card = name => board.locator('.card').filter({ hasText: name });
  const assigneeButton = toolbar.locator('.dd-button');
  const selectedAssignee = assigneeButton.locator('.dd-value');
  const popup = page.locator('.dd-popup.open');
  const choice = name => popup.locator('.dd-option-label').getByText(name, { exact: true });
  const search = page.getByPlaceholder('Find a person');
  const status = toolbar.locator('select.filter');
  const summary = toolbar.locator('.summary');

  await t.step('Search the Assignee choices for Priya', async () => {
    await t.click(assigneeButton);
    await t.fill(search, 'Pri');
  }, [
    t.value('Search contains Pri', search, 'Pri'),
    t.visible('Priya remains a choice', choice('Priya Shah')),
    t.hidden('Marco is filtered out', choice('Marco Diaz'))
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya’s tasks', async () => {
    await t.click(choice('Priya Shah'));
  }, [
    t.text('Two of four tasks', summary, '2 of 4 tasks'),
    t.visible('Release notes', card('Draft release notes')),
    t.visible('Color palette', card('Approve color palette')),
    t.hidden('Marco’s task disappears', card('Review onboarding flow')),
    t.hidden('Unassigned task disappears', card('Fix flaky upload test'))
  ], { covers: ['filter-by-person'] });

  await t.step('Show only unassigned tasks', async () => {
    await t.click(assigneeButton);
    await t.fill(search, '');
    await t.click(choice('Unassigned'));
  }, [
    t.text('One of four tasks', summary, '1 of 4 tasks'),
    t.visible('Unassigned upload task', card('Fix flaky upload test')),
    t.hidden('Priya’s release notes disappear', card('Draft release notes')),
    t.hidden('Priya’s palette task disappears', card('Approve color palette'))
  ], { covers: ['filter-unassigned'] });

  await t.step('Combine Done with Priya Shah', async () => {
    await t.click(assigneeButton);
    await t.fill(search, '');
    await t.click(choice('Priya Shah'));
    await t.select(status, 'Done');
  }, [
    t.value('Done status selected', status, 'Done'),
    t.text('Priya selected', selectedAssignee, 'Priya Shah'),
    t.text('One matching task', summary, '1 of 4 tasks'),
    t.visible('Priya’s done task', card('Approve color palette')),
    t.hidden('Priya’s to-do task disappears', card('Draft release notes')),
    t.hidden('Unassigned task disappears', card('Fix flaky upload test'))
  ], { covers: ['combine-filters'] });

  await t.step('Show Ana’s empty state', async () => {
    await t.click(assigneeButton);
    await t.fill(search, '');
    await t.click(choice('Ana Lima'));
  }, [
    t.text('No matching tasks', summary, '0 of 4 tasks'),
    t.visible('Ana empty-state message', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Previously matching task disappears', card('Approve color palette'))
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear both filters and restore the board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.text('Anyone restored', selectedAssignee, 'Anyone'),
    t.text('All four tasks restored', summary, '4 of 4 tasks'),
    t.visible('Release notes restored', card('Draft release notes')),
    t.visible('Onboarding task restored', card('Review onboarding flow')),
    t.visible('Palette task restored', card('Approve color palette')),
    t.visible('Upload task restored', card('Fix flaky upload test')),
    t.hidden('Ana empty state closes', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true }))
  ], { covers: ['clear-filters'] });
}
