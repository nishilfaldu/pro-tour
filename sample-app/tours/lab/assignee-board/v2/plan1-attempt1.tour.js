export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Choose a person or Unassigned to narrow the task board, with task counts and a clear empty state.',
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.getByRole('button', { name: 'Assignee Anyone' });
  const task = name => page.getByRole('heading', { name });
  const option = name => page.getByRole('option', { name: new RegExp(`^${name}`) });

  await t.step('Open the assignee filter to see people and task counts', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('The people and unassigned options are available', page.getByRole('listbox')),
    t.visible('Search for a person', page.getByPlaceholder('Find a person')),
    t.visible('Unassigned is an option', option('Unassigned')),
  ]);

  await t.step('Search the options for Marco', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco remains in the filtered options', option('Marco Diaz')),
    t.hidden('Other people are filtered out', option('Priya Shah')),
  ]);

  await t.step('Show only Marco’s task', async () => {
    await t.click(option('Marco Diaz'));
  }, [
    t.visible('Marco’s task is shown', task('Review onboarding flow')),
    t.hidden('Priya’s task is filtered out', task('Draft release notes')),
    t.text('The board shows one of four tasks', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('The selected assignee is shown in the filter', page.getByRole('button', { name: 'Assignee Marco Diaz' })),
  ]);

  await t.step('Filter to unassigned work', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Marco Diaz' }));
    await t.click(option('Unassigned'));
  }, [
    t.visible('The unassigned task is shown', task('Fix flaky upload test')),
    t.hidden('Marco’s task is filtered out', task('Review onboarding flow')),
    t.text('The board still shows one of four tasks', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Clear filters is available', page.getByRole('button', { name: 'Clear filters' }).first()),
  ]);

  await t.step('Show the empty state for a person with no assigned tasks', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Unassigned' }));
    await t.click(option('Ana Lima'));
  }, [
    t.visible('The empty state names Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.text('No tasks match this assignee', page.locator('.summary'), '0 of 4 tasks'),
    t.visible('Clear the filter from the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ]);

  await t.step('Clear filters to restore the full task board', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('The full task board is restored', task('Draft release notes')),
    t.visible('The assignee filter is back to Anyone', page.getByRole('button', { name: 'Assignee Anyone' })),
    t.text('All four tasks are shown', page.locator('.summary'), '4 of 4 tasks'),
    t.hidden('The empty state is gone', page.getByText('Nothing assigned to Ana Lima yet.')),
  ]);
}
