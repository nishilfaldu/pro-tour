export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by owner, see live task counts, and reset the board filters.',
  behaviors: {
    'filter-by-assignee': 'Choose an assignee, including Unassigned, to show only their tasks and update the visible task count.',
    'search-assignees': 'Search the assignee list by name to narrow the choices.',
    'show-assignee-task-counts': 'See each assignee option’s current task count while choosing a filter.',
    'assignee-empty-state': 'Selecting Ana Lima shows a tailored empty state when no tasks are assigned to her.',
    'clear-filters': 'Clear filters resets both status and assignee selections and restores the full task list.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = name => page.getByRole('button', { name: `Assignee ${name}` });
  const option = name => page.getByRole('option', { name });
  const summary = page.locator('.summary');

  await t.step('Open the assignee filter and inspect task counts', async () => {
    await t.click(assigneeButton('Anyone'));
  }, [
    t.visible('Priya has 2 tasks', option('Priya Shah 2 tasks')),
    t.visible('Marco has 1 task', option('Marco Diaz 1 task')),
    t.visible('Unassigned has 1 task', option('Unassigned 1 task')),
  ], { covers: ['show-assignee-task-counts'] });

  await t.step('Search the assignee list for Ana Lima', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana Lima');
  }, [
    t.visible('Ana Lima is the matching choice', option('Ana Lima 0 tasks')),
    t.hidden('Priya is filtered out', option('Priya Shah 2 tasks')),
    t.hidden('Marco is filtered out', option('Marco Diaz 1 task')),
  ], { covers: ['search-assignees'] });

  await t.step('Show the tailored empty state for Ana', async () => {
    await t.click(option('Ana Lima 0 tasks'));
  }, [
    t.text('Ana has no assigned tasks', page.locator('.empty p'), 'Nothing assigned to Ana Lima yet.'),
    t.text('Visible task count is zero', summary, '0 of 4 tasks'),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Filter to unassigned tasks', async () => {
    await t.click(assigneeButton('Ana Lima'));
    await t.click(option('Unassigned 1 task'));
  }, [
    t.text('One of four tasks is visible', summary, '1 of 4 tasks'),
    t.visible('Unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Ana empty-state message disappears', page.locator('.empty p')),
  ], { covers: ['filter-by-assignee'] });

  await t.step('Combine filters, then clear both selections', async () => {
    await t.select(page.getByLabel('Status'), 'To do');
    await t.click(assigneeButton('Unassigned'));
    await t.click(option('Anyone 4 tasks'));
    await t.click(page.getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status returns to All statuses', page.getByLabel('Status'), 'All statuses'),
    t.visible('Assignee returns to Anyone', assigneeButton('Anyone')),
    t.text('Full task count is restored', summary, '4 of 4 tasks'),
    t.visible('All tasks are back', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Clear filters control is hidden again', page.getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['clear-filters'] });
}
