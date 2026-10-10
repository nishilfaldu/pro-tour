export const meta = {
  title: 'Choose sample diagram examples',
  summary: 'Browse titled examples, load an alternate diagram, and see how single-example types stay simple.',
  behaviors: {
    'multi-example-chooser': 'Diagram types with multiple samples show a chevron that opens a list of titled examples, with the default example first.',
    'load-alternate-example': 'Selecting a nondefault example loads its code into the editor and renders that diagram.',
    'single-example-button': 'Diagram types with only one sample appear as a button without an example chooser.'
  }
};

export async function run(t) {
  const { page } = t;
  const chooser = page.getByRole('button', { name: /^Choose a .+ example$/ }).first();
  const diagramType = (await chooser.getAttribute('aria-label')).replace(/^Choose a (.+) example$/, '$1');
  const popover = page.locator('[data-popover-content]');
  const examples = popover.getByRole('button');
  const diagram = page.locator('#container > svg');
  const storedCode = () => page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') || '{}').code);
  let defaultCode;
  let defaultSvg;

  await t.step('Open the chevron to browse titled examples', async () => {
    await t.click(page.getByRole('button', { name: diagramType, exact: true }));
    defaultCode = await storedCode();
    await t.click(chooser);
  }, [
    t.visible('Example chooser is open', popover),
    t.check('Multiple titled examples are listed', async () => {
      const titles = (await examples.allTextContents()).map((title) => title.trim());
      return titles.length > 1 && titles.every(Boolean);
    })
  ]);

  await t.step('The first example is the diagram button’s default', async () => {
    await t.click(examples.first());
  }, [
    t.hidden('Example chooser closes', popover),
    t.check('First example matches the default', async () => (await storedCode()) === defaultCode),
    t.visible('Default diagram is rendered', diagram)
  ], { covers: ['multi-example-chooser'] });

  defaultSvg = await diagram.evaluate((svg) => svg.outerHTML);
  await t.step('Choose another example to update the code and diagram', async () => {
    await t.click(chooser);
    await t.click(examples.nth(1));
  }, [
    t.check('Alternate code is loaded', async () => (await storedCode()) !== defaultCode),
    t.check('Alternate diagram is rendered', async () =>
      (await diagram.count()) === 1 && (await diagram.evaluate((svg) => svg.outerHTML)) !== defaultSvg
    ),
    t.hidden('Example chooser closes', popover)
  ], { covers: ['load-alternate-example'] });

  await t.step('Load a single-example diagram with its plain button', async () => {
    await t.click(page.getByRole('button', { name: 'ZenUML', exact: true }));
  }, [
    t.check('ZenUML has one button and no chooser', async () =>
      (await page.getByRole('button', { name: 'ZenUML', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Choose a ZenUML example' }).count()) === 0
    ),
    t.check('ZenUML sample code is loaded', async () => (await storedCode()).startsWith('zenuml')),
    t.check('Order Service diagram is rendered', async () =>
      (await diagram.count()) === 1 && (await diagram.textContent())?.includes('Order Service') === true
    )
  ], { covers: ['single-example-button'] });
}
