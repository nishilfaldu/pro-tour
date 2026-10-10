export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by owner, see assignment counts, and clear both board filters.',
  behaviors: {
    'assignee-options-counts': 'Opening the Assignee filter shows Anyone, each person, and Unassigned with task counts.',
    'search-assignees': 'Searching the Assignee dropdown narrows its choices to matching people.',
    'filter-by-person': 'Selecting Priya Shah shows only her assigned tasks and updates the task summary.',
    'filter-unassigned': 'Selecting Unassigned shows only tasks without an assignee.',
    'empty-assignee-state': 'Selecting Ana Lima shows an empty state saying nothing is assigned to her yet, with a Clear filters control.',
    'clear-filters': 'Clear filters resets both Status and Assignee selections and restores the full task list.'
  }
};

export async function run(t) {
  const { page } = t;
  const toolbar = page.locator('.toolbar');
  const board = page.locator('.board');
  const popup = page.locator('.dd-popup.open');
  const trigger = toolbar.locator('.dd-button');
  const search = page.getByPlaceholder('Find a person');
  const option = name => popup.locator('.dd-option').filter({ hasText: name });

  await t.step('Open Assignee to see every choice and its task count', async () => {
    await t.click(trigger);
  }, [
    t.visible('Assignee search', search),
    t.check('All choices show their seed task counts', async () => {
      const choices = await popup.locator('.dd-option').evaluateAll(elements => elements.map(element => ({
        label: element.querySelector('.dd-option-label')?.textContent.trim(),
        count: element.querySelector('.dd-count')?.textContent.trim()
      })));
      return JSON.stringify(choices) === JSON.stringify([
        { label: 'Anyone', count: '4 tasks' },
        { label: 'Priya Shah', count: '2 tasks' },
        { label: 'Marco Diaz', count: '1 task' },
        { label: 'Ana Lima', count: '0 tasks' },
        { label: 'Unassigned', count: '1 task' }
      ]);
    })
  ], { covers: ['assignee-options-counts'] });

  await t.step('Search Assignee choices for Marco', async () => {
    await t.fill(search, 'mar');
  }, [
    t.visible('Marco remains a choice', option('Marco Diaz')),
    t.hidden('Priya is filtered out', option('Priya Shah')),
    t.hidden('Ana is filtered out', option('Ana Lima'))
  ], { covers: ['search-assignees'] });

  await t.step('Choose Priya to show her two tasks', async () => {
    await t.fill(search, '');
    await t.click(option('Priya Shah'));
  }, [
    t.text('Two of four tasks', toolbar.locator('.summary'), '2 of 4 tasks'),
    t.visible('Release notes', board.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Color palette', board.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Marco’s task is excluded', board.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Unassigned task is excluded', board.getByRole('heading', { name: 'Fix flaky upload test' }))
  ], { covers: ['filter-by-person'] });

  await t.step('Choose Unassigned to show the task without an owner', async () => {
    await t.click(trigger);
    await t.click(option('Unassigned'));
  }, [
    t.text('One of four tasks', toolbar.locator('.summary'), '1 of 4 tasks'),
    t.visible('Unassigned upload test', board.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s release notes are excluded', board.getByRole('heading', { name: 'Draft release notes' }))
  ], { covers: ['filter-unassigned'] });

  await t.step('Choose Ana to see her empty assignment state', async () => {
    await t.click(trigger);
    await t.click(option('Ana Lima'));
  }, [
    t.text('No tasks shown', toolbar.locator('.summary'), '0 of 4 tasks'),
    t.visible('Ana’s empty state', page.locator('.empty').getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Clear filters in the empty state', page.locator('.empty').getByRole('button', { name: 'Clear filters' })),
    t.hidden('Unassigned task is excluded', board.getByRole('heading', { name: 'Fix flaky upload test' }))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear both filters to restore the full board', async () => {
    await t.select(toolbar.locator('select.filter'), 'To do');
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.value('Status reset', toolbar.locator('select.filter'), 'All statuses'),
    t.text('Assignee reset to Anyone', toolbar.locator('.dd-value'), 'Anyone'),
    t.text('All four tasks shown', toolbar.locator('.summary'), '4 of 4 tasks'),
    t.check('All four cards restored', async () => (await board.locator('.card').count()) === 4),
    t.hidden('Ana’s empty state is gone', page.locator('.empty').getByText('Nothing assigned to Ana Lima yet.', { exact: true }))
  ], { covers: ['clear-filters'] });
}
