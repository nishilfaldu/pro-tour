export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks assigned to a person, or see what is still unassigned.',
};

export async function run(t) {
  const { page } = t;

  await t.step('Filter to Marco’s tasks', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Anyone' }));
    await t.click(page.getByRole('option', { name: /Marco Diaz/ }));
  }, [
    t.visible('Marco’s onboarding review is shown', page.getByText('Review onboarding flow')),
    t.hidden('Priya’s release notes are filtered out', page.getByText('Draft release notes')),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
  ]);

  await t.step('Filter to unassigned work', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Marco Diaz' }));
    await t.click(page.getByRole('option', { name: /Unassigned/ }));
  }, [
    t.visible('The flaky upload test is shown', page.getByText('Fix flaky upload test')),
    t.hidden('Marco’s onboarding review is filtered out', page.getByText('Review onboarding flow')),
    t.text('One of four tasks matches', page.locator('.summary'), '1 of 4 tasks'),
  ]);

  await t.step('See the empty state for Ana', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Unassigned' }));
    await t.click(page.getByRole('option', { name: /Ana Lima/ }));
  }, [
    t.visible('The empty state names Ana', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.visible('The toolbar offers Clear filters', page.locator('.toolbar').getByRole('button', { name: 'Clear filters' })),
    t.text('No tasks match', page.locator('.summary'), '0 of 4 tasks'),
  ]);

  await t.step('Clear the assignee filter', async () => {
    await t.click(page.locator('.toolbar').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.visible('All four tasks return', page.getByText('Draft release notes')),
    t.visible('The other seeded task returns', page.getByText('Review onboarding flow')),
    t.text('All tasks are shown', page.locator('.summary'), '4 of 4 tasks'),
    t.hidden('The empty state goes away', page.getByText('Nothing assigned to Ana Lima yet.')),
  ]);
}
