export const meta = {
  title: 'Sample diagram example picker',
  summary:
    'Diagrams with more than one sample get an example menu; the diagram name still loads the default sample.',
  behaviors: {
    'single-example-plain-button':
      'A diagram with only one sample, such as Flowchart, stays a plain button with no example menu.',
    'multi-example-picker':
      'A diagram with several samples, such as Wardley Maps, shows an example menu beside its name.',
    'name-loads-default':
      'Clicking the diagram name loads its default sample, including after another sample was chosen.',
    'menu-lists-examples':
      'The example menu lists every sample for that diagram, with the default sample first.',
    'menu-loads-chosen-example':
      'Choosing a sample from the menu loads that sample into the editor and closes the menu.'
  }
};

export async function run(t) {
  const { page } = t;
  const editorLine = (text) => page.locator('.monaco-editor .view-line').filter({ hasText: text });
  const exampleNames = [
    'Tea Shop Value Chain',
    'Custom Evolution Stages',
    'Pipeline Components',
    'GPT Tokeniser Architecture'
  ];

  await t.step(
    'Click Wardley Maps to load its default sample',
    async () => {
      await t.click(page.getByRole('button', { name: 'Wardley Maps', exact: true }));
    },
    [
      t.check('Flowchart has no example menu', async () => {
        const flowchart = page.getByRole('button', { name: 'Flowchart', exact: true });
        const picker = page.getByRole('button', { name: 'Choose a Flowchart example' });
        return (await flowchart.count()) === 1 && (await picker.count()) === 0;
      }),
      t.visible(
        'Wardley Maps example menu',
        page.getByRole('button', { name: 'Choose a Wardley Maps example' })
      ),
      t.visible('Default sample is Tea Shop', editorLine('title Tea Shop'))
    ],
    {
      covers: ['single-example-plain-button', 'multi-example-picker', 'name-loads-default']
    }
  );

  await t.step(
    'Open the Wardley Maps example menu',
    async () => {
      await t.click(page.getByRole('button', { name: 'Choose a Wardley Maps example' }));
    },
    [
      ...exampleNames.map((name) =>
        t.visible(name, page.getByRole('button', { name, exact: true }))
      ),
      t.check('Default sample is listed first', async () => {
        const buttons = page.getByRole('button', {
          name: /^(Tea Shop Value Chain|Custom Evolution Stages|Pipeline Components|GPT Tokeniser Architecture)$/
        });
        const texts = (await buttons.allTextContents()).map((text) => text.trim());
        return exampleNames.every((name, index) => texts[index] === name);
      })
    ],
    { covers: ['menu-lists-examples'] }
  );

  await t.step(
    'Choose Custom Evolution Stages',
    async () => {
      await t.click(page.getByRole('button', { name: 'Custom Evolution Stages', exact: true }));
    },
    [
      t.visible(
        'Chosen sample is Data Evolution Pipeline',
        editorLine('title Data Evolution Pipeline')
      ),
      t.hidden('Tea Shop sample is replaced', editorLine('title Tea Shop')),
      t.hidden(
        'Example menu closes',
        page.getByRole('button', { name: 'Pipeline Components', exact: true })
      )
    ],
    { covers: ['menu-loads-chosen-example'] }
  );

  await t.step(
    'Click Wardley Maps again to restore the default sample',
    async () => {
      await t.click(page.getByRole('button', { name: 'Wardley Maps', exact: true }));
    },
    [
      t.visible('Default sample is Tea Shop again', editorLine('title Tea Shop')),
      t.hidden('Custom sample is replaced', editorLine('title Data Evolution Pipeline'))
    ],
    { covers: ['name-loads-default'] }
  );
}
