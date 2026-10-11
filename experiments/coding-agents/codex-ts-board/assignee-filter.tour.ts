import type { Tour, TourMeta } from 'pro-tour';

export const meta = {
  title: 'Assignee filter',
  summary: 'Find tasks by assignee, combine filters, and clear the view.',
  behaviors: {
    'search-counts': 'The Assignee menu can be searched and shows task counts.',
    'empty-assignee': 'Choosing a person with no tasks shows an empty state with a way to clear filters.',
    'person-filter': 'Choosing a person shows only their tasks and updates the task count.',
    'status-combination': 'Assignee and Status filters work together.',
    'unassigned-filter': 'Unassigned shows tasks with no assignee.',
    'clear-filters': 'Clear filters restores Anyone, All statuses, and the full board.',
  },
} satisfies TourMeta;

export async function run(t: Tour): Promise<void> {
  const { page } = t;
  const assignee = page.getByRole('button', { name: /Assignee/ });
  const menu = page.getByRole('listbox', { name: 'Assignee' });
  const board = page.locator('.board');
  const summary = page.locator('.summary');

  await t.step('Search the Assignee menu and see how many tasks Ana has', async () => {
    await t.click(assignee);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
  }, [
    t.visible('Ana has zero tasks', menu.getByRole('option', { name: /Ana Lima.*0 tasks/ })),
    t.hidden('Other people are filtered out', menu.getByRole('option', { name: /Priya Shah/ })),
  ], { covers: ['search-counts'] });

  await t.step('Choose Ana to see the empty state', async () => {
    await t.click(menu.getByRole('option', { name: /Ana Lima/ }));
  }, [
    t.text('No tasks assigned to Ana', page.locator('.empty p'), 'Nothing assigned to Ana Lima yet.'),
    t.text('Zero tasks shown', summary, '0 of 4 tasks'),
    t.visible('Clear action in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
  ], { covers: ['empty-assignee'] });

  await t.step('Clear the empty view', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('Anyone is selected', page.getByRole('button', { name: /Assignee Anyone/ })),
    t.text('All tasks return', summary, '4 of 4 tasks'),
  ], { covers: ['clear-filters'] });

  await t.step('Show only Priya’s tasks', async () => {
    await t.click(assignee);
    await t.click(menu.getByRole('option', { name: /Priya Shah/ }));
  }, [
    t.text('Two tasks shown', summary, '2 of 4 tasks'),
    t.visible('Release notes remain', board.getByText('Draft release notes')),
    t.visible('Color palette remains', board.getByText('Approve color palette')),
    t.hidden('Marco’s task is excluded', board.getByText('Review onboarding flow')),
  ], { covers: ['person-filter'] });

  await t.step('Combine Priya with To do', async () => {
    await t.select(page.getByLabel('Status', { exact: true }).first(), 'To do');
  }, [
    t.text('One task matches both filters', summary, '1 of 4 tasks'),
    t.visible('To do task remains', board.getByText('Draft release notes')),
    t.hidden('Done task is excluded', board.getByText('Approve color palette')),
  ], { covers: ['status-combination'] });

  await t.step('Show the unassigned To do task', async () => {
    await t.click(assignee);
    await t.click(menu.getByRole('option', { name: /Unassigned/ }));
  }, [
    t.visible('Unassigned task appears', board.getByText('Fix flaky upload test')),
    t.hidden('Priya’s task is excluded', board.getByText('Draft release notes')),
    t.text('One unassigned To do task', summary, '1 of 4 tasks'),
  ], { covers: ['unassigned-filter'] });

  await t.step('Clear both filters from the toolbar', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('Anyone is selected again', page.getByRole('button', { name: /Assignee Anyone/ })),
    t.value('All statuses is selected again', page.getByLabel('Status', { exact: true }).first(), 'All statuses'),
    t.text('The full board returns', summary, '4 of 4 tasks'),
  ], { covers: ['clear-filters'] });
}
