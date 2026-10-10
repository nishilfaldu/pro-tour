export const meta = {
  title: 'Numeronym generator',
  summary: 'Find the new Text tool and see how it turns a word into a numeronym.',
  behaviors: {
    'find-numeronym-tool': 'The Numeronym generator appears in the Text tools and opens its own page.',
    'empty-output': 'The generator initially shows an empty output field with an example placeholder.',
    'generate-numeronym': 'Entering “internationalization” displays “i18n”.',
    'preserve-short-words': 'Entering a word of three letters or fewer displays the word unchanged.',
    'clear-input': 'Clearing the word input returns the output to its empty placeholder state.',
  },
};

export async function run(t) {
  const { page } = t;
  const toolLink = page.locator('aside a[href="/numeronym-generator"]');
  const word = page.getByPlaceholder("Enter a word, e.g. 'internationalization'");
  const output = page.getByPlaceholder("Your numeronym will be here, e.g. 'i18n'");

  await t.step('Open Numeronym generator from the Text tools and see its empty output', async () => {
    await t.click(toolLink);
  }, [
    t.visible('Numeronym generator is listed in the tool menu', toolLink),
    t.check('Numeronym generator page opens', async () => new URL(page.url()).pathname === '/numeronym-generator'),
    t.visible('Word input is ready', word),
    t.visible('Output shows an example placeholder', output),
    t.value('Output starts empty', output, ''),
  ], { covers: ['find-numeronym-tool', 'empty-output'] });

  await t.step('Turn internationalization into i18n', async () => {
    await t.fill(word, 'internationalization');
  }, [
    t.value('Generated numeronym', output, 'i18n'),
  ], { covers: ['generate-numeronym'] });

  await t.step('Keep a three-letter word unchanged', async () => {
    await t.fill(word, 'abc');
  }, [
    t.value('Short word stays the same', output, 'abc'),
  ], { covers: ['preserve-short-words'] });

  await t.step('Clear the word to restore the empty output', async () => {
    await t.fill(word, '');
  }, [
    t.value('Word input is clear', word, ''),
    t.value('Output is empty again', output, ''),
    t.visible('Example placeholder returns', output),
  ], { covers: ['clear-input'] });
}
