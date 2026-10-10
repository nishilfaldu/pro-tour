export const meta = {
  title: 'Filter tasks by assignee',
  summary: 'Find tasks assigned to a person or see only unassigned work.',
};

export async function run(t) {
  const { page } = t;
  const filter = page.getByRole('button', { name: 'Assignee Anyone' });

  await t.step('Open the assignee filter to see people and task counts', async () => {
    await t.click(filter);
  }, [
    t.visible('Search people by name', page.getByPlaceholder('Find a person')),
    t.visible('Priya has two tasks', page.getByRole('option', { name: 'Priya Shah 2 tasks' })),
  ]);

  await t.step('Search for Marco and choose his matching task', async () => {
    await t.fill(page.getByPlaceholder('Find a person'), 'Marco');
    await t.click(page.getByRole('option', { name: 'Marco Diaz 1 task' }));
  }, [
    t.text('Assignee filter is Marco Diaz', page.locator('.dd-value'), 'Marco Diaz'),
    t.visible('His assigned task is shown', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.hidden('Priya’s task is filtered out', page.getByRole('heading', { name: 'Draft release notes' })),
    t.text('One of four tasks is shown', page.locator('.summary'), '1 of 4 tasks'),
  ]);

  await t.step('Switch to unassigned tasks', async () => {
    await t.click(page.getByRole('button', { name: 'Assignee Marco Diaz' }));
    await t.click(page.getByRole('option', { name: 'Unassigned 1 task' }));
  }, [
    t.text('Assignee filter is Unassigned', page.locator('.dd-value'), 'Unassigned'),
    t.visible('The unassigned task is shown', page.getByRole('heading', { name: 'Fix flaky upload test' })),
    t.hidden('Marco’s task is filtered out', page.getByRole('heading', { name: 'Review onboarding flow' })),
    t.text('One of four tasks is shown', page.locator('.summary'), '1 of 4 tasks'),
  ]);
}
