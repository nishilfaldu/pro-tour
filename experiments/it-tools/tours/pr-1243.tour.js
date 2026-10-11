export const meta = {
  title: 'Email normalizer',
  summary: 'Normalize a list of email addresses, spot parse errors, and copy or clear the results.',
  behaviors: {
    'find-email-normalizer': 'The new Email normalizer tool appears in the Development category and opens its own page.',
    'normalize-emails': 'Entering email addresses, one per line, updates a read-only output with a normalized result for each line.',
    'show-parse-error': 'An email address the tool cannot parse displays an “Unable to parse email” message for that line.',
    'copy-results': 'Copy normalized emails copies the displayed results and shows a confirmation toast.',
    'clear-emails': 'Clear emails empties both the input and the normalized output.',
    'disable-empty-copy': 'The copy button is disabled when there are no normalized results.'
  }
};

export async function run(t) {
  const { page } = t;
  const raw = page.getByPlaceholder('Put your emails here (one per line)...');
  const output = page.getByPlaceholder('Normalized emails will appear here...');
  const copyButton = page.getByRole('button', { name: 'Copy normalized emails' });
  const developmentLink = page.getByText('Development', { exact: true })
    .locator('..')
    .locator('xpath=following-sibling::*[1]')
    .getByRole('link', { name: 'Email normalizer' });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await t.step('Open Email normalizer from Development', async () => {
    await t.click(developmentLink);
  }, [
    t.visible('Tool listed under Development', developmentLink),
    t.visible('Email input on its own page', raw),
    t.check('Email normalizer route opened', async () => page.url().includes('/email-normalizer'))
  ], { covers: ['find-email-normalizer'] });

  await t.step('Normalize two email addresses, one per line', async () => {
    await t.fill(raw, 'alice@EXAMPLE.COM\nbob@example.com');
  }, [
    t.value('One normalized result per line', output, 'alice@example.com\nbob@example.com'),
    t.check('Output is read-only', async () => await output.getAttribute('readonly') !== null)
  ], { covers: ['normalize-emails'] });

  await t.step('Show a parse error beside the valid results', async () => {
    await t.fill(raw, 'alice@EXAMPLE.COM\nbob@example.com\nnot-an-email');
  }, [
    t.value('Unparseable line reports the error', output, 'alice@example.com\nbob@example.com\nUnable to parse email: not-an-email')
  ], { covers: ['show-parse-error'] });

  let displayedResults = '';
  await t.step('Copy the displayed results', async () => {
    displayedResults = await output.inputValue();
    await t.click(copyButton);
  }, [
    t.visible('Copy confirmation', page.getByText('Normalized emails copied to the clipboard', { exact: true })),
    t.check('Clipboard matches the output', async () => displayedResults !== '' && await page.evaluate(() => navigator.clipboard.readText()) === displayedResults)
  ], { covers: ['copy-results'] });

  await t.step('Clear both fields and disable copying', async () => {
    await t.click(page.getByRole('button', { name: 'Clear emails' }));
  }, [
    t.value('Email input cleared', raw, ''),
    t.value('Normalized output cleared', output, ''),
    t.check('Copy button disabled', async () => copyButton.evaluate(element => element.classList.contains('disabled')))
  ], { covers: ['clear-emails', 'disable-empty-copy'] });
}
