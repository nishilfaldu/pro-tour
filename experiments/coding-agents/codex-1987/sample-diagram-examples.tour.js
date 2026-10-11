export const meta = {
  title: 'Sample diagram examples',
  summary:
    'Choose a Wardley Maps example from the Sample Diagrams panel, or load its default directly.',
  behaviors: {
    'direct-default': 'Clicking a diagram name loads its default example.',
    'example-choices': 'A diagram with multiple examples offers a dropdown listing their titles.',
    'alternate-example': 'Choosing an example loads its code and closes the dropdown.',
    'single-example': 'A diagram with one example loads directly without a dropdown.'
  }
};

export async function run(t) {
  const { page } = t;
  const editor = page.locator('.monaco-editor .view-lines').first();
  const codeContains = (snippet) => async () =>
    (await editor.textContent())?.replaceAll(/\s/g, '').includes(snippet.replaceAll(/\s/g, '')) ??
    false;
  const dropdown = page.getByRole('button', { name: 'Choose a Wardley Maps example' });

  await t.step(
    'Load the default Wardley map',
    async () => {
      await t.click(page.getByRole('button', { name: 'Wardley Maps', exact: true }));
    },
    [t.check('Tea Shop code loaded', codeContains('title Tea Shop'))],
    { covers: ['direct-default'] }
  );

  await t.step(
    'Open the example picker',
    async () => {
      await t.click(dropdown);
    },
    [
      t.visible(
        'Default example listed',
        page.getByRole('button', { name: 'Tea Shop Value Chain' })
      ),
      t.visible(
        'Alternate example listed',
        page.getByRole('button', { name: 'Custom Evolution Stages' })
      ),
      t.visible('More examples listed', page.getByRole('button', { name: 'Pipeline Components' }))
    ],
    { covers: ['example-choices'] }
  );

  await t.step(
    'Choose another Wardley map',
    async () => {
      await t.click(page.getByRole('button', { name: 'Custom Evolution Stages' }));
    },
    [
      t.check('Data Evolution Pipeline code loaded', codeContains('title Data Evolution Pipeline')),
      t.hidden('Picker closed', page.getByRole('button', { name: 'Custom Evolution Stages' }))
    ],
    { covers: ['alternate-example'] }
  );

  await t.step(
    'Return to the default from the diagram button',
    async () => {
      await t.click(page.getByRole('button', { name: 'Wardley Maps', exact: true }));
    },
    [t.check('Tea Shop code restored', codeContains('title Tea Shop'))],
    { covers: ['direct-default'] }
  );

  await t.step(
    'Load a diagram with one example',
    async () => {
      await t.click(page.getByRole('button', { name: 'Flowchart', exact: true }));
    },
    [
      t.check('Flowchart code loaded', codeContains('flowchart TD')),
      t.check(
        'No Flowchart picker',
        async () =>
          (await page.getByRole('button', { name: 'Choose a Flowchart example' }).count()) === 0
      )
    ],
    { covers: ['single-example'] }
  );
}
