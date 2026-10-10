export const meta = {
  title: 'Rename history entries',
  summary:
    'A saved history entry can be renamed in place. Enter or clicking away saves a trimmed name; Escape or a blank name leaves the current name as it is.',
  behaviors: {
    'rename-control': 'A saved history entry has a Rename control beside its name.',
    'prefilled-name': 'Rename opens an inline field filled with the current name.',
    'enter-saves': 'Pressing Enter saves the name that was typed.',
    'trims-spaces': 'Spaces around the typed name are removed when it is saved.',
    'escape-cancels': 'Escape closes the field and keeps the name that was already saved.',
    'blank-ignored': 'A name made only of spaces is discarded and the current name stays.',
    'blur-saves': 'Clicking away from the field saves the name.'
  }
};

/**
 * @param {import('playwright').Page} page
 */
const nameSpan = (page) => page.locator('#historyList li span.truncate');

export async function run(t) {
  const { page } = t;
  const renamed = `tour-${Date.now()}`;
  const blurred = `kept-${Date.now()}`;
  let currentName = '';

  const renameButton = () => page.locator('#historyList').getByRole('button', { name: 'Rename' });
  const renameField = () => page.getByRole('textbox', { name: 'Rename entry' });

  const exactName = (label, expected) =>
    t.check(label, async () => {
      const span = nameSpan(page);
      if ((await span.count()) !== 1) return false;
      return (await span.textContent()) === expected;
    });

  await t.step(
    'Save the diagram and open History',
    async () => {
      await t.goto('/edit');
      await t.click(page.getByRole('button', { name: 'History' }));
      await t.click(page.getByRole('button', { name: 'Save current state' }));
      currentName = ((await nameSpan(page).textContent()) ?? '').trim();
      if (!currentName) {
        throw new Error('Saved entry has no name');
      }
    },
    [
      t.visible('A saved entry is listed', page.locator('#historyList li')),
      t.visible('Rename control is beside the name', renameButton())
    ],
    { covers: ['rename-control'] }
  );

  await t.step(
    'Open the rename field',
    async () => {
      await t.click(renameButton());
    },
    [
      t.hidden('The Rename control is replaced by the field', renameButton()),
      t.check('The field is filled with the current name', async () => {
        const field = renameField();
        if ((await field.count()) !== 1) return false;
        return (await field.inputValue()) === currentName;
      })
    ],
    { covers: ['prefilled-name'] }
  );

  await t.step(
    'Type a name with extra spaces and press Enter',
    async () => {
      await t.fill(renameField(), `  ${renamed}  `);
      await t.press('Enter');
    },
    [
      t.hidden('The rename field closes', renameField()),
      exactName('The list shows the name without surrounding spaces', renamed)
    ],
    { covers: ['enter-saves', 'trims-spaces'] }
  );

  await t.step(
    'Press Escape to cancel a rename',
    async () => {
      await t.click(renameButton());
      await t.fill(renameField(), 'cancelled-name');
      await t.press('Escape');
    },
    [
      t.hidden('The rename field closes', renameField()),
      exactName('The saved name is unchanged', renamed)
    ],
    { covers: ['escape-cancels'] }
  );

  await t.step(
    'Clear the name to spaces and press Enter',
    async () => {
      await t.click(renameButton());
      await t.fill(renameField(), '   ');
      await t.press('Enter');
    },
    [
      t.hidden('The rename field closes', renameField()),
      exactName('The current name stays', renamed)
    ],
    { covers: ['blank-ignored'] }
  );

  await t.step(
    'Click away from the field to save',
    async () => {
      await t.click(renameButton());
      await t.fill(renameField(), blurred);
      await t.click(page.getByRole('tab', { name: 'Saved' }));
    },
    [t.hidden('The rename field closes', renameField()), exactName('The name is saved', blurred)],
    { covers: ['blur-saves'] }
  );
}
