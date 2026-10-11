export const meta = {
  title: 'Email normalizer',
  summary: 'Normalize a list of email addresses, handle invalid lines, and copy or clear the result.',
  behaviors: {
    'tool-page': 'The Email normalizer page offers a multiline input and an output area.',
    'normalize-list': 'Multiple email addresses normalize line by line, including Gmail aliases and letter case.',
    'invalid-email': 'An invalid email line shows a clear error while valid lines still normalize.',
    'copy-result': 'The normalized list can be copied to the clipboard.',
    'clear-list': 'Clearing the input removes the results and disables copying.',
  },
};

export async function run(t) {
  const { page } = t;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const input = page.getByPlaceholder('Put your emails here (one per line)...');
  const output = page.getByPlaceholder('Normalized emails will appear here...');
  const copyButton = page.getByRole('button', { name: 'Copy normalized emails' });

  await t.step('Open the Email normalizer', async () => {
    await t.goto('/email-normalizer');
  }, [
    t.visible('Email normalizer page', page.getByRole('heading', { name: 'Email normalizer' })),
    t.visible('Multiline email input', input),
    t.visible('Normalized output', output),
  ], { covers: ['tool-page'] });

  await t.step('Normalize two email addresses', async () => {
    await t.fill(input, 'Alice.Smith+news@Gmail.com\nBOB@Example.COM');
  }, [
    t.value('Gmail alias and case normalized on separate lines', output, 'alicesmith@gmail.com\nbob@example.com'),
  ], { covers: ['normalize-list'] });

  await t.step('Show a line-level error for invalid input', async () => {
    await t.fill(input, 'Alice.Smith+news@Gmail.com\nnot-an-email\nBOB@Example.COM');
  }, [
    t.value('Invalid line identified and valid lines retained', output, 'alicesmith@gmail.com\nUnable to parse email: not-an-email\nbob@example.com'),
  ], { covers: ['invalid-email'] });

  await t.step('Copy the normalized results', async () => {
    await t.click(copyButton);
  }, [
    t.visible('Copy confirmation', page.getByText('Normalized emails copied to the clipboard')),
    t.check('Clipboard contains the normalized list', async () => await page.evaluate(async () => (await navigator.clipboard.readText()) === 'alicesmith@gmail.com\nUnable to parse email: not-an-email\nbob@example.com')),
  ], { covers: ['copy-result'] });

  await t.step('Clear the email list', async () => {
    await t.click(page.getByRole('button', { name: 'Clear emails' }));
  }, [
    t.value('Input cleared', input, ''),
    t.value('Output cleared', output, ''),
    t.check('Copy is disabled with no results', async () => await copyButton.evaluate(button => button.classList.contains('disabled'))),
  ], { covers: ['clear-list'] });
}
