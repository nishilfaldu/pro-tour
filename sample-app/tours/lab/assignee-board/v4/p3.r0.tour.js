export const meta = {
  title: 'Filter tasks by assignee and status',
  summary: 'Find assigned or unassigned tasks, combine filters, and clear them when you are done.',
  behaviors: {
    'assignee-filter': 'Select a person or Unassigned in the Assignee dropdown to show only tasks assigned to that choice, with task counts shown beside the options.',
    'search-assignees': 'Search the Assignee options by typing a person’s name to narrow the choices.',
    'combine-filters': 'Apply the assignee and status filters together to narrow the task list.',
    'clear-filters': 'Use Clear filters to restore Anyone and All statuses.',
    'empty-filter-state': 'Show a contextual empty state when the selected filters match no tasks, with a control to clear the filters.'
  }
};

export async function run(t) {
  const { page } = t;
  const assignee = page.getByRole('button', { name: /Assignee Anyone/ });
  const status = page.getByLabel('Status');
  const tasks = page.getByRole('listitem');
  const clear = page.getByRole('button', { name: 'Clear filters' });

  await t.step('Open Assignee and inspect people with task counts', async () => {
    await t.click(assignee);
  }, [
    t.visible('Priya has two assigned tasks', page.getByRole('option', { name: /Priya Shah.*2 tasks/ })),
    t.visible('Unassigned has one task', page.getByRole('option', { name: /Unassigned.*1 task/ }))
  ], { covers: ['assignee-filter'] });

  await t.step('Search the Assignee choices for Marco', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco is the matching choice', page.getByRole('option', { name: /Marco Diaz.*1 task/ })),
    t.hidden('Priya is filtered out', page.getByRole('option', { name: /Priya Shah/ }))
  ], { covers: ['search-assignees'] });

  await t.step('Show Marco’s task, then combine with the To do status', async () => {
    await t.click(page.getByRole('option', { name: /Marco Diaz.*1 task/ }));
    await t.select(status, 'To do');
  }, [
    t.visible('No tasks match the combined filters', page.getByText('No tasks match this status.')),
    t.visible('Clear filters is available', clear),
    t.value('Status is To do', status, 'To do'),
    t.value('Assignee is Marco Diaz', assignee, 'Marco Diaz')
  ], { covers: ['combine-filters', 'empty-filter-state'] });

  await t.step('Clear the filters to restore the full task board', async () => {
    await t.click(clear);
  }, [
    t.visible('All four tasks return', tasks.nth(3)),
    t.value('Status returns to All statuses', status, 'All statuses'),
    t.value('Assignee returns to Anyone', assignee, 'Anyone'),
    t.hidden('The empty state is gone', page.locator('.empty'))
  ], { covers: ['clear-filters'] });
}
