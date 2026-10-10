export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search the assignee list, filter tasks, and clear the board filters.',
  behaviors: {
    'search-assignees': 'Typing a person’s name in the Assignee dropdown search narrows the available assignee options.',
    'filter-by-assignee': 'Selecting an assignee filters the board to that person’s tasks and shows task counts beside the assignee options.',
    'filter-unassigned': 'Selecting Unassigned filters the board to tasks with no assignee.',
    'assignee-empty-state': 'Selecting Ana Lima, who has no seeded tasks, shows a personalized empty state with a Clear filters action.',
    'clear-filters': 'Clear filters resets both status and assignee filters and restores all tasks to the board.'
  }
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const search = page.getByPlaceholder('Find a person');

  await t.step('Search the assignee list', async () => {
    await t.click(assigneeButton);
    await t.fill(search, 'Marco');
  }, [
    t.visible('Marco remains in the narrowed options', page.getByRole('option', { name: /Marco Diaz/ })),
    t.hidden('Other assignees are filtered out', page.getByRole('option', { name: /Priya Shah/ }))
  ], { covers: ['search-assignees'] });

  await t.step('Choose an assignee and see task counts', async () => {
    await t.click(page.getByRole('option', { name: /Marco Diaz/ }));
  }, [
    t.visible('Marco’s task appears on the board', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Tasks assigned to others are filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('The assignee filter shows Marco', page.locator('.dd-value').filter({ hasText: 'Marco Diaz' })),
    t.check('The filtered board shows one of four tasks', async () => (await page.locator('.summary').textContent()).trim() === '1 of 4 tasks')
  ], { covers: ['filter-by-assignee'] });

  await t.step('Filter for unassigned tasks', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Unassigned/ }));
  }, [
    t.visible('The unassigned task appears', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Assigned tasks are filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.check('The board shows one unassigned task', async () => (await page.locator('.summary').textContent()).trim() === '1 of 4 tasks')
  ], { covers: ['filter-unassigned'] });

  await t.step('Show Ana Lima’s personalized empty state', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option', { name: /Ana Lima/ }));
  }, [
    t.visible('The empty state names Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('The empty state offers Clear filters', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('No task cards remain', page.locator('.board li'))
  ], { covers: ['assignee-empty-state'] });

  await t.step('Add a status filter', async () => {
    await t.select(page.locator('#root select.filter'), 'Done');
  }, [
    t.value('Status is filtered to Done', page.locator('#root select.filter'), 'Done'),
    t.visible('The assignee filter is still Ana', page.locator('.dd-value').filter({ hasText: 'Ana Lima' })),
    t.visible('Clear filters is available', page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }))
  ]);

  await t.step('Clear both filters and restore the board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status returns to All statuses', page.locator('#root select.filter'), 'All statuses'),
    t.visible('Assignee returns to Anyone', page.locator('.dd-value').filter({ hasText: 'Anyone' })),
    t.visible('All four seeded tasks return', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('The remaining seeded task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.check('The full board shows four of four tasks', async () => (await page.locator('.summary').textContent()).trim() === '4 of 4 tasks')
  ], { covers: ['clear-filters'] });
}
