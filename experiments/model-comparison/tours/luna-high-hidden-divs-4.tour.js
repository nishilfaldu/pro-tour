export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Search assignees, filter the board, and restore all tasks with Clear filters.',
  behaviors: {
    'search-assignee-options': 'Search the assignee dropdown and see matching people alongside Anyone, Unassigned, and task counts.',
    'filter-by-assignee': 'Choose a person such as Priya Shah or Marco Diaz and see only tasks assigned to them.',
    'filter-unassigned-tasks': 'Choose Unassigned and see only tasks with no assignee.',
    'assignee-empty-state': 'Choose Ana Lima and see the personalized empty state that says nothing is assigned to her yet.',
    'clear-filters': 'Use Clear filters to reset the status and assignee filters and restore all seeded tasks.',
  },
};

export async function run(t) {
  const { page } = t;
  const trigger = name => page.getByRole('button', { name, exact: true });
  const option = name => page.locator('.dd-popup .dd-option').filter({ hasText: name });
  const statusFilter = page.locator('.toolbar select.filter');

  await t.step('Search assignees and see the available choices and counts', async () => {
    await t.click(trigger('Anyone'));
    await t.fill(page.getByPlaceholder('Find a person'), 'a');
  }, [
    t.value('Search is applied', page.getByPlaceholder('Find a person'), 'a'),
    t.visible('Anyone remains available', option('Anyone')),
    t.text('Anyone has four tasks', option('Anyone').locator('.dd-count'), '4 tasks'),
    t.visible('Priya Shah matches the search', option('Priya Shah')),
    t.text('Priya has two tasks', option('Priya Shah').locator('.dd-count'), '2 tasks'),
    t.visible('Marco Diaz matches the search', option('Marco Diaz')),
    t.visible('Unassigned remains available', option('Unassigned')),
    t.text('Unassigned has one task', option('Unassigned').locator('.dd-count'), '1 task'),
  ], { covers: ['search-assignee-options'] });

  await t.step('Filter the board to Priya Shah’s tasks', async () => {
    await t.click(option('Priya Shah'));
  }, [
    t.text('Two of four tasks match', page.locator('.summary'), '2 of 4 tasks'),
    t.visible('Priya’s release notes task is shown', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Priya’s color palette task is shown', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s onboarding task is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Show only tasks without an assignee', async () => {
    await t.click(trigger('Priya Shah'));
    await t.click(option('Unassigned'));
  }, [
    t.text('One of four tasks is unassigned', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('The unassigned upload test is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s release notes task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
  ], { covers: ['filter-unassigned-tasks'] });

  await t.step('Show Ana Lima’s personalized empty state', async () => {
    await t.click(trigger('Unassigned'));
    await t.click(option('Ana Lima'));
  }, [
    t.visible('The empty state names Ana', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.text('No tasks match Ana’s filter', page.locator('.summary'), '0 of 4 tasks'),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Set a status filter before clearing both filters', async () => {
    await t.select(statusFilter, 'To do');
  }, [
    t.value('Status is set to To do', statusFilter, 'To do'),
    t.visible('Clear filters is available', page.locator('.toolbar').getByRole('button', { name: 'Clear filters', exact: true })),
  ]);

  await t.step('Clear filters and restore all seeded tasks', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters', exact: true }));
  }, [
    t.value('Status resets to all statuses', statusFilter, 'All statuses'),
    t.visible('Assignee resets to Anyone', trigger('Anyone')),
    t.text('All four tasks are restored', page.locator('.summary'), '4 of 4 tasks'),
    t.hidden('Ana’s empty state is dismissed', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Release notes task is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Onboarding task is restored', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('Color palette task is restored', page.getByRole('heading', { name: 'Approve color palette' })),
    t.visible('Unassigned upload task is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
  ], { covers: ['clear-filters'] });
}
