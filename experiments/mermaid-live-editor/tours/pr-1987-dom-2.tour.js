export const meta = {
  title: 'Choose sample diagrams',
  summary: 'Diagram types now offer titled examples that can be switched and restored.',
  behaviors: {
    'show-example-choices': 'Opening the arrow beside a diagram type with multiple samples shows its titled examples, with the default first.',
    'load-alternate-example': 'Choosing a nondefault example loads its code into the editor and renders its diagram.',
    'restore-default-example': 'Choosing the default example from the menu restores its code and rendered diagram.'
  }
};

export async function run(t) {
  const { page } = t;
  const arrow = page.getByRole('button', { name: /^Choose a .+ example$/ }).first();
  const arrowLabel = await arrow.getAttribute('aria-label');
  if (!arrowLabel) throw new Error('No diagram type with multiple examples was found');
  const diagramType = arrowLabel.slice('Choose a '.length, -' example'.length);
  const diagramButton = page.getByRole('button', { name: diagramType, exact: true });
  const choices = page.locator('button.justify-start.normal-case');
  const editorCode = async () => (await page.locator('#editor .view-lines').first().textContent())?.trim() ?? '';
  const renderedDiagram = async () => page.locator('#container svg').evaluate((svg) => JSON.stringify({
    labels: [...svg.querySelectorAll('text, foreignObject')].map((el) => el.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean),
    shapes: svg.querySelectorAll('path, rect, circle, ellipse, polygon').length
  }));

  await page.locator('#container svg').waitFor({ state: 'visible' });
  const starterCode = await editorCode();
  const starterDiagram = await renderedDiagram();

  await t.step('Open the arrow to see titled examples, starting with the default', async () => {
    await t.click(diagramButton);
    await t.click(arrow);
  }, [
    t.visible('First example', choices.first()),
    t.visible('Alternate example', choices.nth(1)),
    t.check('Examples have distinct titles', async () => {
      const titles = (await choices.allTextContents()).map((title) => title.trim());
      return titles.length > 1 && titles.every(Boolean) && new Set(titles).size === titles.length;
    }),
    t.check('Default sample code loads', async () => (await editorCode()) !== starterCode),
    t.check('Default diagram renders', async () => (await renderedDiagram()) !== starterDiagram)
  ], { covers: ['show-example-choices'] });

  const defaultCode = await editorCode();
  const defaultDiagram = await renderedDiagram();

  await t.step('Choose another example to replace the code and diagram', async () => {
    await t.click(choices.nth(1));
  }, [
    t.hidden('Example menu closes', choices.first()),
    t.check('Alternate code is in the editor', async () => (await editorCode()) !== defaultCode),
    t.check('Alternate diagram is rendered', async () => (await renderedDiagram()) !== defaultDiagram)
  ], { covers: ['load-alternate-example'] });

  await t.step('Choose the first example to restore the default', async () => {
    await t.click(arrow);
    await t.click(choices.first());
  }, [
    t.hidden('Example menu closes again', choices.first()),
    t.check('Default code is restored', async () => (await editorCode()) === defaultCode),
    t.check('Default diagram is restored', async () => (await renderedDiagram()) === defaultDiagram)
  ], { covers: ['restore-default-example'] });
}
