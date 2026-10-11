export const meta = {
  title: 'Numeronym generator',
  summary: 'Find the new Text tool, turn a word into a numeronym, copy it, and clear the result.',
  behaviors: {
    'find-numeronym-tool': 'The Numeronym generator appears in the Text tools and opens its own page.',
    'generate-numeronym': 'Entering “internationalization” immediately produces “i18n”.',
    'preserve-short-word': 'Entering a word of three letters or fewer shows the word unchanged.',
    'copy-numeronym': 'The generated numeronym can be copied to the clipboard.',
    'clear-input': 'Clearing the word removes the result and restores the empty result placeholder.',
  },
};

export async function run(t) {
  const { page } = t;
  const word = page.locator('[data-test-id="word-input"]');
  const result = page.locator('[data-test-id="numeronym"]');

  await t.step('Open Numeronym generator from the Text tools', async () => {
    await t.click(page.locator('a[href="/numeronym-generator"]').last());
  }, [
    t.check('Numeronym generator page opened', async () => new URL(page.url()).pathname === '/numeronym-generator'),
    t.visible('Word entry is ready', word),
  ], { covers: ['find-numeronym-tool'] });

  await t.step('Type internationalization to get i18n immediately', async () => {
    await t.fill(word, 'internationalization');
  }, [
    t.value('Generated numeronym', result, 'i18n'),
  ], { covers: ['generate-numeronym'] });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await t.step('Copy i18n to the clipboard', async () => {
    await t.click(page.locator('.c-input-text:has([data-test-id="numeronym"]) button'));
  }, [
    t.check('Clipboard contains i18n', async () =>
      (await page.evaluate(() => navigator.clipboard.readText())) === 'i18n'),
  ], { covers: ['copy-numeronym'] });

  await t.step('A three-letter word stays unchanged', async () => {
    await t.fill(word, 'abc');
  }, [
    t.value('Short word result', result, 'abc'),
  ], { covers: ['preserve-short-word'] });

  await t.step('Clear the word to restore the empty result', async () => {
    await t.click(page.locator('.c-input-text:has([data-test-id="word-input"]) button'));
  }, [
    t.value('Word cleared', word, ''),
    t.value('Result cleared', result, ''),
    t.visible('Empty result placeholder restored', page.locator('[data-test-id="numeronym"]:placeholder-shown')),
  ], { covers: ['clear-input'] });
}
