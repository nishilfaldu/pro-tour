export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find assignees, see their task counts, and filter the board in a few clicks.',
  behaviors: {
    'assignee-filter': 'Choose a person or Unassigned in the Assignee filter to show only their tasks and update the visible-task count.',
    'search-assignees': 'Search the assignee options by name to narrow the choices.',
    'assignee-task-counts': 'See each assignee option’s task count in the dropdown.',
    'assignee-empty-state': 'Choose Ana Lima to see the empty state explaining that nothing is assigned to her.',
    'clear-filters': 'Use Clear filters to reset the status and assignee filters and restore the full task list.',
  },
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');

  await t.step('Open Assignee to see task counts', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Assignee choices are open', page.getByRole('listbox')),
    t.check('Each option shows its task count', async () => {
      const rows = await page.locator('.dd-option').evaluateAll(els =>
        els.map(el => [
          el.querySelector('.dd-option-label')?.textContent?.trim(),
          el.querySelector('.dd-count')?.textContent?.trim(),
        ]),
      );
      return JSON.stringify(rows) === JSON.stringify([
        ['Anyone', '4 tasks'],
        ['Priya Shah', '2 tasks'],
        ['Marco Diaz', '1 task'],
        ['Ana Lima', '0 tasks'],
        ['Unassigned', '1 task'],
      ]);
    }),
  ], { covers: ['assignee-task-counts'] });

  await t.step('Search the assignee choices by name', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco Diaz remains in the choices', page.locator('.dd-option').filter({ hasText: 'Marco Diaz' })),
    t.hidden('Priya Shah is filtered out', page.locator('.dd-option').filter({ hasText: 'Priya Shah' })),
  ], { covers: ['search-assignees'] });

  await t.step('Show Marco’s assigned task', async () => {
    await t.click(page.getByRole('option').filter({ hasText: 'Marco Diaz' }));
  }, [
    t.visible('Marco’s task is shown', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.text('Visible-task count updates', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['assignee-filter'] });

  await t.step('Show unassigned tasks', async () => {
    await t.click(assigneeButton);
    await t.click(page.getByRole('option').filter({ hasText: 'Unassigned' }));
  }, [
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.text('Visible-task count updates for Unassigned', page.locator('.summary'), '1 of 4 tasks'),
  ], { covers: ['assignee-filter'] });

  await t.step('Choose Ana to see the empty state', async () => {
    await t.click(assigneeButton);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
    await t.click(page.getByRole('option').filter({ hasText: 'Ana Lima' }));
  }, [
    t.visible('Empty state explains Ana has no assigned tasks', page.locator('.empty p').filter({ hasText: 'Nothing assigned to Ana Lima yet.' })),
    t.text('No tasks are visible', page.locator('.summary'), '0 of 4 tasks'),
  ], { covers: ['assignee-empty-state'] });

  await t.step('Clear both filters and restore the full board', async () => {
    await t.select(page.locator('.toolbar select.filter'), 'Done');
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status returns to All statuses', page.locator('.toolbar select.filter'), 'All statuses'),
    t.text('Assignee returns to Anyone', page.locator('.dd-value'), 'Anyone'),
    t.text('Full task count is restored', page.locator('.summary'), '4 of 4 tasks'),
    t.check('All four task cards return', async () => await page.locator('.board > .card').count() === 4),
  ], { covers: ['clear-filters'] });
}
