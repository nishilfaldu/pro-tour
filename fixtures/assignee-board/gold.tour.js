export const meta = {
  title: 'Filter the board by assignee',
  summary: 'Narrow the board to one person, see the empty state for someone with no work, then assign them a task and find it through the filter.',
  behaviors: {
    'per-person-counts': 'The Assignee filter lists each person with how many tasks they have',
    'filter-by-person': 'Picking a person shows only their tasks',
    'empty-state': 'Picking someone with no tasks shows an empty state that names them',
    'clear-filters': 'Clear filters puts every task back on the board',
    'search-people': 'Typing in the filter narrows the list of people',
  },
};

export async function run(t) {
  const { page } = t;
  const trigger = page.getByRole('button', { name: /^Assignee / });
  const summary = page.getByText(/^\d+ of \d+ tasks$/);
  const heading = name => page.getByRole('heading', { name, exact: true });

  await t.step('Open the new Assignee filter', async () => {
    await t.click(trigger);
  }, [
    t.visible('Priya Shah has 2 tasks', page.getByRole('option', { name: 'Priya Shah 2 tasks' })),
    t.visible('Ana Lima has 0 tasks', page.getByRole('option', { name: 'Ana Lima 0 tasks' })),
  ], { covers: ['per-person-counts'] });

  await t.step('Show only Priya Shah\'s tasks', async () => {
    await t.click(page.getByRole('option', { name: 'Priya Shah' }));
  }, [
    t.text('2 of 4 tasks in view', summary, '2 of 4 tasks'),
    t.hidden('Marco\'s task is hidden', heading('Review onboarding flow')),
    t.visible('Draft release notes is shown', heading('Draft release notes')),
    t.visible('Approve color palette is shown', heading('Approve color palette')),
  ], { covers: ['filter-by-person'] });

  await t.step('Pick someone with nothing assigned', async () => {
    await t.click(trigger);
    await t.click(page.getByRole('option', { name: 'Ana Lima' }));
  }, [
    t.visible('Empty state names Ana Lima', page.getByText('Nothing assigned to Ana Lima yet.')),
    t.text('0 of 4 tasks in view', summary, '0 of 4 tasks'),
  ], { covers: ['empty-state'] });

  await t.step('Clear the filter from the empty state', async () => {
    await t.click(page.locator('.empty').getByRole('button', { name: 'Clear filters' }));
  }, [
    t.text('All 4 tasks are back', summary, '4 of 4 tasks'),
    t.visible('Trigger reads Anyone again', page.getByRole('button', { name: 'Assignee Anyone' })),
  ], { covers: ['clear-filters'] });

  await t.step('Assign the unassigned task to Ana Lima', async () => {
    await t.click(page.getByRole('button', { name: 'More actions for Fix flaky upload test' }));
    await t.click(page.getByRole('menuitem', { name: 'Edit' }));
    const dialog = page.getByRole('dialog');
    await t.select(dialog.getByLabel('Assignee'), 'Ana Lima');
    await t.click(dialog.getByRole('button', { name: 'Save', exact: true }));
  }, [
    t.visible('The card now shows Ana Lima', page.getByRole('listitem', { name: 'Fix flaky upload test' }).getByText('Ana Lima')),
  ]);

  await t.step('Find it by searching the filter for Ana', async () => {
    await t.click(trigger);
    await t.fill(page.getByPlaceholder('Find a person'), 'Ana');
    await t.click(page.getByRole('option', { name: 'Ana Lima 1 task' }));
  }, [
    t.text('1 of 4 tasks in view', summary, '1 of 4 tasks'),
    t.visible('Fix flaky upload test is Ana\'s', heading('Fix flaky upload test')),
  ], { covers: ['search-people'] });
}
