export const meta = {
  title: 'Numeronym generator',
  summary: 'Find the new Text tool and see it turn words into numeronyms that can be copied.',
  behaviors: {
    'find-tool': 'The Numeronym generator appears in the Text tools and opens at /numeronym-generator.',
    'empty-state': 'Before a word is entered, the result field is empty and shows an example placeholder.',
    'generate-numeronym': 'Entering “internationalization” immediately displays “i18n”.',
    'short-word': 'Entering a word of three letters or fewer displays the word unchanged.',
    'clear-word': 'Clearing the word restores the empty result and its placeholder.',
    'copy-result': 'The copy button copies the generated numeronym to the clipboard and briefly shows “Copied!”.',
  },
};

export async function run(t) {
  const { page } = t;
  const toolLink = page.locator('a[href="/numeronym-generator"]').first();
  const word = page.locator('[data-test-id="word-input"]');
  const result = page.locator('[data-test-id="numeronym"]');
  const resultPlaceholder = page.getByPlaceholder("Your numeronym will be here, e.g. 'i18n'");
  let foundInTextTools = false;

  await t.step('Find Numeronym generator in Text tools and open it', async () => {
    foundInTextTools = await page.getByText('Text', { exact: true }).first().isVisible()
      && await toolLink.isVisible();
    await t.click(toolLink);
  }, [
    t.check('Listed in Text tools', async () => foundInTextTools),
    t.check('Numeronym generator opens', async () => new URL(page.url()).pathname === '/numeronym-generator'),
    t.value('Result starts empty', result, ''),
    t.visible('Example placeholder', resultPlaceholder),
  ], { covers: ['find-tool', 'empty-state'] });

  await t.step('Generate i18n as the word is entered', async () => {
    await t.fill(word, 'internationalization');
  }, [
    t.value('Generated numeronym', result, 'i18n'),
  ], { covers: ['generate-numeronym'] });

  await t.step('Keep a three-letter word unchanged', async () => {
    await t.fill(word, 'abc');
  }, [
    t.value('Short word stays unchanged', result, 'abc'),
  ], { covers: ['short-word'] });

  await t.step('Clear the word to restore the empty result', async () => {
    await t.click(word.locator('..').getByRole('button'));
  }, [
    t.value('Word cleared', word, ''),
    t.value('Result cleared', result, ''),
    t.visible('Example placeholder restored', resultPlaceholder),
  ], { covers: ['clear-word'] });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await t.step('Copy the generated numeronym', async () => {
    await t.fill(word, 'internationalization');
    await t.click(result.locator('..').getByRole('button'));
  }, [
    t.value('Generated result', result, 'i18n'),
    t.check('Clipboard contains i18n', async () =>
      await page.evaluate(() => navigator.clipboard.readText()) === 'i18n'),
    t.visible('Copied feedback', page.getByText('Copied!', { exact: true })),
  ], { covers: ['copy-result'] });
}
