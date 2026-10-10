export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, compare task counts, and clear filters to restore the full board.',
  behaviors: {
    'assignee-filter': 'Choose an assignee, including Unassigned, to show only matching tasks and update the visible-task count.',
    'search-assignees': 'Search the assignee dropdown by person name to narrow its options.',
    'assignee-task-counts': 'See each assignee option’s matching task count in the dropdown.',
    'assignee-empty-state': 'Select Ana Lima to see the new empty state explaining that no tasks are assigned to her.',
    'clear-filters': 'Use Clear filters to reset both status and assignee selections and restore all tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const assignee = page.getByRole('button', { name: 'Assignee Anyone' });

  await t.step('Open the assignee list and compare task counts', async () => {
    await t.click(assignee);
  }, [
    t.visible('Anyone matches four tasks', page.getByRole('option', { name: /Anyone.*4 tasks/ })),
    t.visible('Priya matches two tasks', page.getByRole('option', { name: /Priya Shah.*2 tasks/ })),
    t.visible('Marco matches one task', page.getByRole('option', { name: /Marco Diaz.*1 task/ })),
    t.visible('Ana currently matches no tasks', page.getByRole('option', { name: /Ana Lima.*0 tasks/ })),
    t.visible('Unassigned matches one task', page.getByRole('option', { name: /Unassigned.*1 task/ })),
  ], { covers: ['assignee-task-counts'] });

  await t.step('Search the options by person name', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana remains in the narrowed options', page.getByRole('option', { name: /Ana Lima/ })),
    t.hidden('Marco is filtered out', page.getByRole('option', { name: /Marco Diaz/ })),
  ], { covers: ['search-assignees'] });

  await t.step('Choose Unassigned to filter the board', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Anyone' }));
    await t.click(page.getByRole('option', { name: /Unassigned/ }));
  }, [
    t.text('Only one of four tasks is visible', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('The matching unassigned task remains', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('The assignee filter shows Unassigned', page.locator('.dd-value'), 'Unassigned'),
  ], { covers: ['assignee-filter'] });

  await t.step('Select Ana to see her empty state', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Unassigned' }));
    await t.click(page.getByRole('option', { name: /Ana Lima/ }));
  }, [
    t.text('No tasks match Ana', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('The empty state explains that Ana has no assigned tasks', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear both filters and restore every task', async () => {
    await t.select(page.getByLabel('Status').first(), 'Done');
    await t.click(page.getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status returns to All statuses', page.getByLabel('Status').first(), 'All statuses'),
    t.text('Assignee returns to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks are visible again', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('The previously filtered unassigned task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
  ], { covers: ['clear-filters'] });
}
