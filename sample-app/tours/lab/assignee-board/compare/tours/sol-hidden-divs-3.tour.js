export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by owner, combine assignee and status filters, and clear both filters in one click.',
  behaviors: {
    'assignee-options': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Searching the Assignee dropdown narrows its choices to matching people.',
    'combined-filters': 'Selecting Priya while the status is To do shows only Draft release notes.',
    'unassigned-filter': 'Selecting Unassigned shows only Fix flaky upload test.',
    'empty-assignee': 'Selecting Ana shows an empty board with “Nothing assigned to Ana Lima yet” and a Clear filters control.',
    'clear-filters': 'Clear filters resets both filters and restores all four tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const popup = page.locator('.dd-popup.open');
  const status = toolbar.getByLabel('Status');
  const assigneeButton = toolbar.locator('.dd-button');
  const option = name => popup.locator('.dd-option').filter({ has: page.locator('.dd-option-label', { hasText: new RegExp(`^${name}$`) }) });

  await t.step('Open Assignee to see each choice and its task count', async () => {
    await t.click(assigneeButton);
  }, [
    t.text('Anyone: four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya: two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco: one task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana: no tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned: one task', option('Unassigned').locator('.dd-count'), '1 task')
  ], { covers: ['assignee-options'] });

  await t.step('Search for Priya in the Assignee choices', async () => {
    await t.fill(popup.getByPlaceholder('Find a person'), 'Pri');
  }, [
    t.visible('Priya matches', option('Priya Shah')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Ana is filtered out', option('Ana Lima')),
    t.hidden('Unassigned is filtered out', option('Unassigned'))
  ], { covers: ['search-assignees'] });

  await t.step('Combine Priya with To do to find the release notes', async () => {
    await t.click(option('Priya Shah'));
    await t.select(status, 'To do');
  }, [
    t.value('Status is To do', status, 'To do'),
    t.text('Assignee is Priya', assigneeButton.locator('.dd-value'), 'Priya Shah'),
    t.visible('Draft release notes', board.getByText('Draft release notes', { exact: true })),
    t.hidden('Other Priya task', board.getByText('Approve color palette', { exact: true })),
    t.text('One matching task', toolbar.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['combined-filters'] });

  await t.step('Show the unassigned To do task', async () => {
    await t.click(assigneeButton);
    await t.click(option('Unassigned'));
  }, [
    t.text('Assignee is Unassigned', assigneeButton.locator('.dd-value'), 'Unassigned'),
    t.visible('Fix flaky upload test', board.getByText('Fix flaky upload test', { exact: true })),
    t.hidden('Previously matched task', board.getByText('Draft release notes', { exact: true })),
    t.text('One matching task', toolbar.locator('.summary'), '1 of 4 tasks')
  ], { covers: ['unassigned-filter'] });

  await t.step('Show Ana’s empty board and Clear filters control', async () => {
    await t.click(assigneeButton);
    await t.click(option('Ana Lima'));
  }, [
    t.text('Assignee is Ana', assigneeButton.locator('.dd-value'), 'Ana Lima'),
    t.visible('Ana empty state', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters in empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task', board.getByText('Fix flaky upload test', { exact: true })),
    t.text('No matching tasks', toolbar.locator('.summary'), '0 of 4 tasks')
  ], { covers: ['empty-assignee'] });

  await t.step('Clear both filters and restore all four tasks', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses selected', status, 'All statuses'),
    t.text('Assignee reset to Anyone', assigneeButton.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks', toolbar.locator('.summary'), '4 of 4 tasks'),
    t.visible('Draft release notes', board.getByText('Draft release notes', { exact: true })),
    t.visible('Review onboarding flow', board.getByText('Review onboarding flow', { exact: true })),
    t.visible('Approve color palette', board.getByText('Approve color palette', { exact: true })),
    t.visible('Fix flaky upload test', board.getByText('Fix flaky upload test', { exact: true }))
  ], { covers: ['clear-filters'] });
}
