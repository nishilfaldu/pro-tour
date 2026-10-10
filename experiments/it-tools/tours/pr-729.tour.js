export const meta = {
  title: 'Numeronym generator',
  summary: 'Find the Text tool, turn a word into a numeronym, and copy the result.',
  behaviors: {
    'find-numeronym-generator': 'The Numeronym generator appears in the Text tools and opens its own page.',
    'empty-output': 'On opening the generator, the empty output shows an example placeholder.',
    'generate-numeronym': 'Entering “internationalization” immediately produces “i18n”.',
    'preserve-short-words': 'Entering a word of three letters or fewer displays the word unchanged.',
    'clear-input': 'Clearing the word resets the output to its empty placeholder.',
    'copy-result': 'The generated numeronym can be copied with the output field’s copy button.'
  }
};

export async function run(t) {
  const { page } = t;
  const word = page.locator('[data-test-id="word-input"]');
  const result = page.locator('[data-test-id="numeronym"]');
  const example = "Your numeronym will be here, e.g. 'i18n'";

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await t.step('Open Numeronym generator from the Text tools', async () => {
    await t.click(page.locator('.n-layout-sider a[href="/numeronym-generator"]'));
  }, [
    t.visible('Text category', page.locator('.n-layout-sider').getByText('Text', { exact: true })),
    t.check('Generator page opened', async () => new URL(page.url()).pathname === '/numeronym-generator'),
    t.check('Empty result shows its example', async () =>
      await result.count() === 1 && await result.inputValue() === '' && await result.getAttribute('placeholder') === example)
  ], { covers: ['find-numeronym-generator', 'empty-output'] });

  await t.step('Turn internationalization into i18n', async () => {
    await t.fill(word, 'internationalization');
  }, [
    t.value('Entered word', word, 'internationalization'),
    t.value('Generated numeronym', result, 'i18n')
  ], { covers: ['generate-numeronym'] });

  await page.evaluate(() => navigator.clipboard.writeText(''));

  await t.step('Copy the generated result', async () => {
    await t.click(result.locator('..').getByRole('button'));
  }, [
    t.check('Clipboard contains i18n', async () =>
      await page.evaluate(() => navigator.clipboard.readText()) === 'i18n'),
    t.value('Result remains i18n', result, 'i18n')
  ], { covers: ['copy-result'] });

  await t.step('Keep a three-letter word as it is', async () => {
    await t.fill(word, 'abc');
  }, [
    t.value('Short word', word, 'abc'),
    t.value('Unchanged result', result, 'abc')
  ], { covers: ['preserve-short-words'] });

  await t.step('Clear the word to restore the example', async () => {
    await t.click(word.locator('..').getByRole('button'));
  }, [
    t.value('Word cleared', word, ''),
    t.check('Example placeholder restored', async () =>
      await result.inputValue() === '' && await result.getAttribute('placeholder') === example)
  ], { covers: ['clear-input'] });
}
