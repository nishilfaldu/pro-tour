export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by assignee, see matching counts, and clear filters when you are done.',
  behaviors: {
    'filter-by-assignee': 'Choose an assignee from the new dropdown to show only tasks assigned to that person.',
    'search-assignees': 'Search the assignee dropdown by typing a person’s name to narrow its options.',
    'show-assignee-counts': 'See each assignee option’s current matching task count, including Anyone and Unassigned.',
    'filter-unassigned-tasks': 'Choose Unassigned to show tasks with no assignee.',
    'clear-filters': 'Clear active status and assignee filters to restore the full task list.',
    'assignee-empty-state': 'Filter to Ana Lima to see the new person-specific empty message and its Clear filters control.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const option = name => page.locator('.dd-option').filter({ has: page.locator('.dd-option-label', { hasText: name }) });

  await t.step('Open Assignee to see counts for every option', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Anyone shows 4 tasks', option('Anyone').filter({ hasText: '4 tasks' })),
    t.visible('Priya Shah shows 2 tasks', option('Priya Shah').filter({ hasText: '2 tasks' })),
    t.visible('Marco Diaz shows 1 task', option('Marco Diaz').filter({ hasText: '1 task' })),
    t.visible('Ana Lima shows 0 tasks', option('Ana Lima').filter({ hasText: '0 tasks' })),
    t.visible('Unassigned shows 1 task', option('Unassigned').filter({ hasText: '1 task' })),
  ], { covers: ['show-assignee-counts'] });

  await t.step('Search for Marco and choose him', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
    await t.click(option('Marco Diaz'));
  }, [
    t.visible('Marco’s task is shown', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.text('Only one of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['search-assignees', 'filter-by-assignee'] });

  await t.step('Choose Unassigned to find tasks without an owner', async () => {
    await t.click(assigneeButton);
    await t.click(option('Unassigned'));
  }, [
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('One of four tasks is unassigned', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['filter-unassigned-tasks'] });

  await t.step('Add a status filter alongside the assignee filter', async () => {
    await t.select(page.locator('.toolbar select.filter'), 'To do');
  }, [
    t.visible('No tasks match the combined filters', page.getByText('No tasks match this status.')),
    t.visible('Clear filters is available', page.locator('.toolbar').getByRole('button', { name: 'Clear filters' })),
  ]);

  await t.step('Clear filters to restore the whole board', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('All four tasks are restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Marco’s task is restored', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('The unassigned task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('The full task count is restored', page.locator('.summary'), '4 of 4 tasks'),
  ], { covers: ['clear-filters'] });

  await t.step('Filter to Ana to see her person-specific empty state', async () => {
    await t.click(assigneeButton);
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Ana’s empty-state message appears', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('The empty state offers Clear filters', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['assignee-empty-state'] });
}
