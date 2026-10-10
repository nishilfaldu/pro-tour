import type { Tour, TourMeta } from 'pro-tour';

export const meta = {
  title: 'Mark a task Done and filter by status',
  summary: 'Create a task, mark it Done from the board, and confirm the Done filter includes it while hiding other statuses.',
  behaviors: {
    'create-task': 'New task adds a task to the top of the board',
    'board-status': 'Changing a task’s status on the board saves it',
    'filter-done': 'The Done filter shows only finished tasks',
    'filter-todo': 'The To do filter shows only open tasks',
  },
} satisfies TourMeta;

export async function run(t: Tour): Promise<void> {
  const { page } = t;
  const filter = page.getByRole('combobox', { name: 'Status', exact: true });
  const heading = (name: string) => page.getByRole('heading', { name });
  const status = page.getByRole('combobox', { name: 'Status for Prepare product tour' });

  await t.step('Create a new task', async () => {
    await t.click(page.getByRole('button', { name: 'New task' }));
    await t.fill(page.getByLabel('Task name'), 'Prepare product tour');
    await t.fill(page.getByLabel('Details'), 'Record a walkthrough for reviewers');
    await t.click(page.getByRole('button', { name: 'Save task' }));
  }, [
    t.visible('New task is on the board', heading('Prepare product tour')),
    t.text('Board now has 4 tasks', page.locator('#total-count'), '4'),
  ], { covers: ['create-task'] });

  await t.step('Mark it Done from the board', async () => {
    await t.select(status, 'Done');
  }, [
    t.value('Task status is Done', status, 'Done'),
  ], { covers: ['board-status'] });

  await t.step('Filter the board to Done', async () => {
    await t.select(filter, 'Done');
  }, [
    t.text('2 tasks in view', page.locator('#visible-count'), '2'),
    t.hidden('Draft release notes is hidden', heading('Draft release notes')),
    t.visible('Prepare product tour is included', heading('Prepare product tour')),
    t.visible('Approve color palette is included', heading('Approve color palette')),
  ], { covers: ['filter-done'] });

  await t.step('Switch to To do: the task drops out', async () => {
    await t.select(filter, 'To do');
  }, [
    t.hidden('Prepare product tour is hidden', heading('Prepare product tour')),
    t.visible('Draft release notes is shown', heading('Draft release notes')),
  ], { covers: ['filter-todo'] });
}
