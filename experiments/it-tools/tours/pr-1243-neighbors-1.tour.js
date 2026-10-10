export const meta = {
  title: 'Email normalizer',
  summary: 'Normalize a list of email addresses, spot invalid lines, and copy the results.',
  behaviors: {
    'find-email-normalizer': 'The Email normalizer appears in the Development tools and opens at /email-normalizer.',
    'normalize-emails': 'Entering email addresses one per line shows a normalized result for each line in the read-only output.',
    'show-invalid-email': 'An email that cannot be parsed shows “Unable to parse email:” followed by the original line.',
    'show-empty-state': 'With no input, the output is empty and the Copy normalized emails button is disabled.',
    'copy-results': 'Copy normalized emails copies the displayed results and shows a confirmation toast.',
    'clear-emails': 'Clear emails removes the input and resets the output to its empty state.'
  }
};

export async function run(t) {
  const { page } = t;
  const input = page.getByPlaceholder('Put your emails here (one per line)...');
  const output = page.getByPlaceholder('Normalized emails will appear here...');
  const copyButton = page.getByRole('button', { name: 'Copy normalized emails' });
  const raw = 'Alice@EXAMPLE.COM\nBob@EXAMPLE.ORG';
  let developmentListingSeen = false;

  await t.step('Find Email normalizer in Development and open it', async () => {
    const development = page.getByText('Development', { exact: true }).first();
    const link = page.locator('a[href$="/email-normalizer"]').first();
    if (!(await link.isVisible())) await t.click(development);
    developmentListingSeen = await development.isVisible() && await link.isVisible();
    await t.click(link);
  }, [
    t.check('Shown in Development tools', async () => developmentListingSeen),
    t.check('Opened the Email normalizer route', async () => new URL(page.url()).pathname === '/email-normalizer'),
    t.value('Output starts empty', output, ''),
    t.check('Copy starts disabled', async () => await copyButton.count() === 1 && await copyButton.evaluate(el => el.classList.contains('disabled')))
  ], { covers: ['find-email-normalizer', 'show-empty-state'] });

  await t.step('Normalize two email addresses, one per line', async () => {
    await t.fill(input, raw);
  }, [
    t.value('Two input lines', input, raw),
    t.check('Two normalized lines in read-only output', async () => {
      const value = await output.inputValue();
      const lines = value.split('\n');
      return await output.evaluate(el => el.readOnly) && lines.length === 2 && lines.every(line => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(line)) && value !== raw;
    }),
    t.check('Copy is enabled', async () => !(await copyButton.evaluate(el => el.classList.contains('disabled'))))
  ], { covers: ['normalize-emails'] });

  await t.step('See an invalid line reported alongside the results', async () => {
    await t.fill(input, `${raw}\nnot-an-email`);
  }, [
    t.check('Original invalid line is reported', async () => (await output.inputValue()).split('\n').at(-1) === 'Unable to parse email: not-an-email'),
    t.check('Each input still has an output line', async () => (await output.inputValue()).split('\n').length === 3)
  ], { covers: ['show-invalid-email'] });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await t.step('Copy the displayed results', async () => {
    await t.click(copyButton);
  }, [
    t.visible('Copy confirmation', page.getByText('Normalized emails copied to the clipboard')),
    t.check('Clipboard matches the displayed results', async () => {
      try {
        return await page.evaluate(async () => navigator.clipboard.readText()) === await output.inputValue();
      } catch {
        return false;
      }
    })
  ], { covers: ['copy-results'] });

  await t.step('Clear the list and return to the empty state', async () => {
    await t.click(page.getByRole('button', { name: 'Clear emails' }));
  }, [
    t.value('Input cleared', input, ''),
    t.value('Output cleared', output, ''),
    t.check('Copy is disabled again', async () => await copyButton.evaluate(el => el.classList.contains('disabled')))
  ], { covers: ['clear-emails'] });
}
