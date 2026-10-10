export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks by owner, see matching counts, and clear filters to restore the board.',
  behaviors: {
    'filter-by-assignee': 'Choose a person in the Assignee filter to show only tasks assigned to them.',
    'search-assignees': 'Search the Assignee options by typing a person’s name.',
    'filter-unassigned': 'Choose Unassigned to show tasks with no assignee.',
    'show-assignee-counts': 'Open the Assignee menu to see each option’s matching task count.',
    'clear-filters': 'Clear active status and assignee filters to restore all tasks.',
    'empty-assignee-state': 'Filter for a person with no tasks to see a personalized empty message and a Clear filters control.'
  }
};

export async function run(t) {
  const { page } = t;
  const assigneeButton = page.locator('.dd-button');
  const option = name => page.getByRole('option').filter({ hasText: name });
  const statusFilter = page.locator('.toolbar select.filter');

  await t.step('Open Assignee to see matching task counts', async () => {
    await t.click(assigneeButton);
  }, [
    t.visible('Assignee options are open', page.getByRole('listbox')),
    t.check('Counts match the seeded tasks', async () => {
      const text = await page.locator('.dd-popup').innerText();
      return text.includes('Priya Shah') && text.includes('2 tasks') &&
        text.includes('Marco Diaz') && text.includes('1 task') &&
        text.includes('Ana Lima') && text.includes('0 tasks') &&
        text.includes('Unassigned') && text.includes('1 task');
    })
  ], { covers: ['show-assignee-counts'] });

  await t.step('Search the open Assignee options by name', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana Lima');
  }, [
    t.visible('Ana Lima remains in the matching options', option('Ana Lima')),
    t.hidden('Priya Shah is filtered out', option('Priya Shah'))
  ], { covers: ['search-assignees'] });

  await t.step('Show the personalized empty state for Ana Lima', async () => {
    await t.click(option('Ana Lima'));
  }, [
    t.visible('Personalized message explains there are no tasks for Ana', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.visible('Empty state offers Clear filters', page.locator('.empty').getByRole('button', { name: 'Clear filters' }))
  ], { covers: ['empty-assignee-state'] });

  await t.step('Clear the empty assignee filter', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('All four seeded tasks return', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('The personalized empty state closes', page.getByText('Nothing assigned to Ana Lima yet.', { exact: true })),
    t.text('Assignee returns to Anyone', page.locator('.dd-value'), 'Anyone')
  ]);

  await t.step('Show only Priya Shah’s tasks', async () => {
    await t.click(assigneeButton);
    await t.click(option('Priya Shah'));
  }, [
    t.visible('Draft release notes is shown', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Approve color palette is shown', page.getByRole('heading', { name: 'Approve color palette' })),
    t.hidden('Review onboarding flow is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' }))
  ], { covers: ['filter-by-assignee'] });

  await t.step('Show tasks with no assignee', async () => {
    await t.click(assigneeButton);
    await t.click(option('Unassigned'));
  }, [
    t.visible('The unassigned upload task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' }))
  ], { covers: ['filter-unassigned'] });

  await t.step('Clear status and assignee filters to restore all tasks', async () => {
    await t.select(statusFilter, 'Done');
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('Draft release notes is restored', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Review onboarding flow is restored', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.visible('Approve color palette is restored', page.getByRole('heading', { name: 'Approve color palette' })),
    t.visible('Fix flaky upload test is restored', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.value('Status returns to All statuses', statusFilter, 'All statuses'),
    t.text('Assignee returns to Anyone', page.locator('.dd-value'), 'Anyone')
  ], { covers: ['clear-filters'] });
}
