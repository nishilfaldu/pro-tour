export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by assignee, see task counts, and clear filters from the board.',
  behaviors: {
    'assignee-filter': 'Select a person or Unassigned in the Assignee dropdown to show only tasks assigned to that choice.',
    'search-assignees': 'Search the Assignee dropdown by name to narrow the available choices.',
    'assignee-task-counts': 'See each assignee choice’s current task count in the dropdown.',
    'assignee-empty-state': 'Choose Ana Lima to see the empty message that says nothing is assigned to her yet, with a Clear filters button.',
    'clear-filters': 'After filtering by status or assignee, use Clear filters to restore All statuses and Anyone.',
  },
};

export async function run(t) {
  const { page } = t;
  const assignee = page.getByRole('button', { name: /Assignee Anyone/ });
  const priyaOption = page.getByRole('option', { name: /Priya Shah/ });
  const anaOption = page.getByRole('option', { name: /Ana Lima/ });
  const assigneeClear = page.locator('.empty').getByRole('button', { name: 'Clear filters' });

  await t.step('Open Assignee to see the available choices and task counts', async () => {
    await t.click(assignee);
  }, [
    t.visible('Anyone shows 4 tasks', page.getByRole('option', { name: /Anyone.*4 tasks/ })),
    t.visible('Priya Shah shows 2 tasks', page.getByRole('option', { name: /Priya Shah.*2 tasks/ })),
    t.visible('Marco Diaz shows 1 task', page.getByRole('option', { name: /Marco Diaz.*1 task/ })),
    t.visible('Unassigned shows 1 task', page.getByRole('option', { name: /Unassigned.*1 task/ })),
  ], { covers: ['assignee-task-counts'] });

  await t.step('Search the choices for Priya Shah', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Priya');
  }, [
    t.visible('Priya Shah remains in the narrowed choices', priyaOption),
    t.hidden('Marco Diaz is filtered out', page.getByRole('option', { name: /Marco Diaz/ })),
    t.hidden('Ana Lima is filtered out', page.getByRole('option', { name: /Ana Lima/ })),
  ], { covers: ['search-assignees'] });

  await t.step('Show only Priya Shah’s tasks', async () => {
    await t.click(priyaOption);
  }, [
    t.text('The board shows two tasks', page.getByText('2 of 4 tasks')),
    t.visible('Draft release notes is shown', page.getByRole('heading', { name: 'Draft release notes' })),
    t.hidden('Review onboarding flow is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('Clear filters is available', page.getByRole('button', { name: 'Clear filters' }).first()),
  ], { covers: ['assignee-filter'] });

  await t.step('Choose Ana Lima to reveal the empty state', async () => {
    await t.click(assignee);
    await t.click(anaOption);
  }, [
    t.text('The empty message names Ana Lima', page.locator('.empty p'), 'Nothing assigned to Ana Lima yet.'),
    t.visible('The empty state offers Clear filters', assigneeClear),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear the assignee filter and restore Anyone', async () => {
    await t.click(assigneeClear);
  }, [
    t.text('The board shows all four tasks again', page.getByText('4 of 4 tasks')),
    t.text('Assignee is reset to Anyone', page.locator('.dd-button .dd-value'), 'Anyone'),
    t.text('Status is reset to All statuses', page.locator('select#' + (await page.locator('.field select').getAttribute('id'))), 'All statuses'),
  ], { covers: ['clear-filters'] });
}
