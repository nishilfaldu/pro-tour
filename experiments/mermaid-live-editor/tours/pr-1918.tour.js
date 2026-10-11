export const meta = {
  title: 'Rename history entries',
  summary: 'Reviewers can rename saved diagrams and Timeline snapshots directly in History.',
  behaviors: {
    'inline-rename-control': 'A saved history entry has a Rename button that opens an inline name field.',
    'save-renamed-entry': 'Pressing Enter saves a new name for the selected entry and trims surrounding spaces.',
    'cancel-rename': 'Pressing Escape closes the name field and keeps the original name.',
    'reject-blank-name': 'Submitting a name containing only spaces keeps the original name.',
    'rename-timeline-snapshot': 'A Timeline snapshot can also be renamed.',
    'truncate-long-names': 'Long history names are truncated in the list, with the full name available on hover.'
  }
};

export async function run(t) {
  const { page } = t;
  await page.clock.install();

  const entry = page.locator('#historyList li').first();
  const rename = entry.getByRole('button', { name: 'Rename' });
  const field = entry.getByRole('textbox', { name: 'Rename entry' });
  const name = entry.locator('span[title]');

  await t.step('Save the current diagram and open its inline name field', async () => {
    await t.goto('/edit');
    await t.click(page.getByRole('button', { name: 'History' }));
    await t.click(page.locator('#saveHistory'));
    await t.click(rename);
  }, [
    t.visible('Inline name field', field),
    t.hidden('Rename button becomes a field', rename)
  ], { covers: ['inline-rename-control'] });

  await t.step('Press Enter to save a name without surrounding spaces', async () => {
    await t.fill(field, '  Review draft  ');
    await t.press('Enter');
  }, [
    t.text('Trimmed name is saved', name, 'Review draft'),
    t.hidden('Name field closes', field)
  ], { covers: ['save-renamed-entry'] });

  await t.step('Press Escape to keep the existing name', async () => {
    await t.click(rename);
    await t.fill(field, 'Discarded title');
    await t.press('Escape');
  }, [
    t.text('Original name remains', name, 'Review draft'),
    t.hidden('Name field closes on Escape', field)
  ], { covers: ['cancel-rename'] });

  await t.step('A name made only of spaces is rejected', async () => {
    await t.click(rename);
    await t.fill(field, '   ');
    await t.press('Enter');
  }, [
    t.text('Original name remains after blank submission', name, 'Review draft'),
    t.hidden('Blank name field closes', field)
  ], { covers: ['reject-blank-name'] });

  const longName = 'Review draft with a detailed name that stays available in full when the shortened history label is hovered';
  await t.step('Long names fit the list while keeping their full hover title', async () => {
    await t.click(rename);
    await t.fill(field, longName);
    await t.press('Enter');
    await t.click(name);
  }, [
    t.text('Full name is preserved', name, longName),
    t.check('Label is shortened and hover exposes its full title', async () => {
      if (await name.count() !== 1) return false;
      return name.evaluate((element, expectedName) =>
        element.scrollWidth > element.clientWidth && element.getAttribute('title') === expectedName,
        longName
      );
    })
  ], { covers: ['truncate-long-names'] });

  await page.clock.fastForward(60_100);
  await t.step('Rename an automatically saved Timeline snapshot', async () => {
    await t.click(page.getByRole('tab', { name: 'Timeline' }));
    await t.click(rename);
    await t.fill(field, 'Timeline review');
    await t.press('Enter');
  }, [
    t.text('Timeline snapshot has its new name', name, 'Timeline review'),
    t.hidden('Timeline name field closes', field)
  ], { covers: ['rename-timeline-snapshot'] });
}
