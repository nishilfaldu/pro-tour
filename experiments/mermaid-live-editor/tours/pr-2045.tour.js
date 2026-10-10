export const meta = {
  title: 'Share without Playground',
  summary: 'Share now offers the Live Editor link and embed options without Mermaid Chart Playground.',
  behaviors: {
    'playground-section-removed': 'Opening Share shows no Mermaid Chart Playground section or description.',
    'playground-link-removed': 'Share no longer offers a Mermaid Chart Playground URL to copy.'
  }
};

export async function run(t) {
  const { page } = t;
  const dialog = page.getByRole('dialog');
  const urlField = dialog.locator('input[type="url"]');

  await t.step('Open Share to see the Live Editor and Embed sections', async () => {
    await t.goto('/edit');
    await t.click(page.getByRole('button', { name: 'Share' }));
  }, [
    t.visible('Share dialog', dialog),
    t.visible('Live Editor section', dialog.getByRole('heading', { name: 'Mermaid Live Editor' })),
    t.visible('Embed section', dialog.getByRole('heading', { name: 'Embed' })),
    t.check('No Playground section or description', async () =>
      (await dialog.isVisible()) && !(await dialog.getByText(/Playground/).count())
    )
  ], { covers: ['playground-section-removed'] });

  await t.step('Select the only share URL', async () => {
    await t.click(urlField);
  }, [
    t.check('The Live Editor URL is selected and is the only copyable URL', async () => {
      if ((await urlField.count()) !== 1 || (await dialog.getByRole('button', { name: 'Copy' }).count()) !== 2) return false;
      return urlField.evaluate((field) =>
        field.value === window.location.href &&
        field.selectionStart === 0 &&
        field.selectionEnd === field.value.length
      );
    }),
    t.check('No Playground URL appears in Share fields', async () =>
      dialog.locator('input, textarea').evaluateAll((fields) =>
        fields.every((field) => !field.value.includes('mermaid.ai/play'))
      )
    )
  ], { covers: ['playground-link-removed'] });

  await t.step('Return to the editor', async () => {
    await t.press('Escape');
  }, [
    t.hidden('Share dialog closed', dialog)
  ]);
}
