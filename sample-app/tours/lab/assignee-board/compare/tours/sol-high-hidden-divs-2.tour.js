export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find an assignee, combine filters, and clear an empty result.',
  behaviors: {
    'assignee-options': 'Opening the Assignee dropdown shows Anyone, each person, and Unassigned with task counts.',
    'search-people': 'Typing a name in Find a person narrows the dropdown options.',
    'combined-filters': 'With To do selected, choosing Priya shows only her To do task.',
    'unassigned-filter': 'Choosing Unassigned shows only tasks without an assignee.',
    'assignee-empty-state': 'Choosing Ana shows “Nothing assigned to Ana Lima yet” and a Clear filters control.',
    'clear-filters': 'Clear filters restores All statuses and Anyone, showing all four seed tasks.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const status = toolbar.locator('select.filter');
  const assigneeButton = toolbar.locator('.dd-button');
  const selectedAssignee = toolbar.locator('.dd-value');
  const popup = page.locator('.dd-popup.open');
  const option = name => popup.locator('.dd-option').filter({ hasText: name });
  const search = page.getByPlaceholder('Find a person');
  const task = name => page.getByRole('heading', { name, exact: true });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Anyone option', option('Anyone')),
    t.visible('Priya option', option('Priya Shah')),
    t.visible('Marco option', option('Marco Diaz')),
    t.visible('Ana option', option('Ana Lima')),
    t.visible('Unassigned option', option('Unassigned')),
    t.text('Anyone has four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.text('Priya has two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.text('Marco has one task', option('Marco Diaz').locator('.dd-count'), '1 task'),
    t.text('Ana has no tasks', option('Ana Lima').locator('.dd-count'), '0 tasks'),
    t.text('Unassigned has one task', option('Unassigned').locator('.dd-count'), '1 task'),
  ], { covers: ['assignee-options'] });

  await t.step('Search the Assignee choices for Priya', async () => {
    await t.fill(search, 'Priya');
  }, [
    t.value('Search contains Priya', search, 'Priya'),
    t.visible('Priya remains available', option('Priya Shah')),
    t.hidden('Anyone is filtered out', option('Anyone')),
    t.hidden('Marco is filtered out', option('Marco Diaz')),
    t.hidden('Ana is filtered out', option('Ana Lima')),
    t.hidden('Unassigned is filtered out', option('Unassigned')),
  ], { covers: ['search-people'] });

  await t.step('With To do selected, choose Priya', async () => {
    await t.click(assigneeButton);
    await t.select(status, 'To do');
    await t.click(assigneeButton);
    await t.click(option('Priya Shah'));
  }, [
    t.value('To do selected', status, 'To do'),
    t.text('Priya selected', selectedAssignee, 'Priya Shah'),
    t.text('One of four tasks', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Priya’s To do task', task('Draft release notes')),
    t.hidden('Other To do task excluded', task('Fix flaky upload test')),
    t.hidden('Priya’s Done task excluded', task('Approve color palette')),
  ], { covers: ['combined-filters'] });

  await t.step('Show tasks without an assignee', async () => {
    await t.select(status, 'All statuses');
    await t.click(assigneeButton);
    await t.click(option('Unassigned'));
  }, [
    t.text('Unassigned selected', selectedAssignee, 'Unassigned'),
    t.text('One unassigned task', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned task', task('Fix flaky upload test')),
    t.hidden('Priya’s task excluded', task('Draft release notes')),
  ], { covers: ['unassigned-filter'] });

  await t.step('Choose Ana to see her empty state', async () => {
    await t.click(assigneeButton);
    await t.click(option('Ana Lima'));
  }, [
    t.text('Ana selected', selectedAssignee, 'Ana Lima'),
    t.text('No matching tasks', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Ana’s empty state', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task excluded', task('Fix flaky upload test')),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear filters to restore the full board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('All statuses restored', status, 'All statuses'),
    t.text('Anyone restored', selectedAssignee, 'Anyone'),
    t.text('All four tasks', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Draft release notes', task('Draft release notes')),
    t.visible('Review onboarding flow', task('Review onboarding flow')),
    t.visible('Approve color palette', task('Approve color palette')),
    t.visible('Fix flaky upload test', task('Fix flaky upload test')),
  ], { covers: ['clear-filters'] });
}
