export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Choose a teammate to see only their tasks, with matching task counts shown in the filter.',
};

export async function run(t) {
  const { page } = t;

  await t.step('Open the assignee filter and find a teammate', async () => {
    await t.click(page.getByRole('button', { name: /Assignee Anyone/ }));
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
  }, [
    t.visible('Marco Diaz is available', page.getByRole('option', { name: /Marco Diaz/ })),
    t.hidden('Other assignees are filtered out', page.getByRole('option', { name: /Priya Shah/ })),
  ]);

  await t.step('Show Marco’s assigned tasks', async () => {
    await t.click(page.getByRole('option', { name: /Marco Diaz/ }));
  }, [
    t.text('Only Marco’s task remains', page.locator('.summary'), '1 of 4 tasks'),
    t.visible('Review onboarding flow is shown', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Tasks assigned to others are hidden', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('The selected teammate appears in the filter', page.locator('.dd-value'), 'Marco Diaz'),
  ]);

  await t.step('Reset the assignee filter', async () => {
    await t.click(page.getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All four tasks are back', page.locator('.summary'), '4 of 4 tasks'),
    t.visible('Tasks assigned to Priya return', page.getByRole('heading', { name: 'Draft release notes' })),
    t.visible('Unassigned work returns', page.getByRole('heading', { name: 'Fix flaky upload test' })),
  ]);
}
