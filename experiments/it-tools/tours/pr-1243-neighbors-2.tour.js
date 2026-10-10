export const meta = {
  title: 'Email normalizer',
  summary: 'Normalize a list of email addresses, identify invalid entries, and copy or clear the results.',
  behaviors: {
    'open-email-normalizer': 'Email normalizer appears in the Development tools and opens when selected.',
    'normalize-email-lines': 'Entering email addresses on separate lines shows a normalized result for each line.',
    'show-parse-errors': 'An email address that cannot be parsed shows an “Unable to parse email” result for that line.',
    'copy-normalized-emails': 'Copy normalized emails copies the displayed results and shows a confirmation toast.',
    'clear-emails': 'Clear emails removes the entered addresses and their results.',
    'disable-copy-when-empty': 'The Copy normalized emails button is disabled when there are no results.',
  },
};

export async function run(t) {
  const { page } = t;
  const raw = page.getByPlaceholder('Put your emails here (one per line)...');
  const result = page.getByPlaceholder('Normalized emails will appear here...');
  const copyButton = page.getByRole('button', { name: 'Copy normalized emails' });
  const addresses = 'alice@example.com\nbob@example.org';

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await t.step('Open Email normalizer from the Development tools.', async () => {
    await t.click(page.getByRole('link', { name: /Email normalizer/ }).first());
  }, [
    t.visible('Raw email input', raw),
    t.visible('Normalized email output', result),
  ], { covers: ['open-email-normalizer'] });

  await t.step('Enter one address per line to see a result for each.', async () => {
    await t.fill(raw, addresses);
  }, [
    t.value('Two normalized results', result, addresses),
  ], { covers: ['normalize-email-lines'] });

  await t.step('Copy the displayed results.', async () => {
    await t.click(copyButton);
  }, [
    t.visible('Copy confirmation', page.getByText('Normalized emails copied to the clipboard', { exact: true })),
    t.check('Clipboard matches the results', async () => {
      const displayed = await result.inputValue();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      return copied === displayed;
    }),
  ], { covers: ['copy-normalized-emails'] });

  await t.step('An invalid line gets its own parse error.', async () => {
    await t.fill(raw, 'alice@example.com\nnot-an-email\nbob@example.org');
  }, [
    t.value('Parse error on the invalid line', result, 'alice@example.com\nUnable to parse email: not-an-email\nbob@example.org'),
  ], { covers: ['show-parse-errors'] });

  await t.step('Clear the list and return to the disabled copy state.', async () => {
    await t.click(page.getByRole('button', { name: 'Clear emails' }));
  }, [
    t.value('Entered addresses cleared', raw, ''),
    t.value('Results cleared', result, ''),
    t.check('Copy is disabled without results', async () => copyButton.evaluate(button => button.classList.contains('disabled'))),
  ], { covers: ['clear-emails', 'disable-copy-when-empty'] });
}
