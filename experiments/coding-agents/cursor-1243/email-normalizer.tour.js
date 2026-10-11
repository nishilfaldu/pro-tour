export const meta = {
  title: 'Email normalizer',
  summary: 'Normalize a list of email addresses, flag lines that cannot be parsed, copy the result, and clear it.',
  behaviors: {
    'open-from-search': 'Email normalizer shows up in search and opens its tool page.',
    'normalizes-list': 'Addresses entered one per line are normalized: lowercased, with Gmail dots and plus-tags removed and googlemail.com rewritten to gmail.com.',
    'copies-result': 'Copy normalized emails puts that list on the clipboard and confirms it.',
    'flags-invalid': 'An address that cannot be parsed is shown on its own line as "Unable to parse email: ...".',
    'clears-and-disables-copy': 'Clear emails empties both fields and disables copying until there is a result again.',
  },
};

const normalized = [
  'username@gmail.com',
  'ab@gmail.com',
  'ada@example.com',
].join('\n');

export async function run(t) {
  const { page } = t;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const rawEmails = page.getByPlaceholder('Put your emails here (one per line)...');
  const normalizedEmails = page.getByPlaceholder('Normalized emails will appear here...');
  const copyButton = page.getByRole('button', { name: 'Copy normalized emails' });

  await t.step('Open Email normalizer from search', async () => {
    await t.click(page.getByRole('button', { name: /Search/ }));
    await t.fill(page.getByPlaceholder('Type to search a tool or a command...'), 'Email normalizer');
    await t.click(page.getByRole('option', { name: /Email normalizer/ }));
  }, [
    t.visible('Email normalizer heading', page.locator('#app').getByRole('heading', { name: 'Email normalizer' })),
    t.visible('Raw email field', rawEmails),
    t.hidden('Search dialog closes', page.getByPlaceholder('Type to search a tool or a command...')),
  ], { covers: ['open-from-search'] });

  await t.step('Normalize a list of addresses', async () => {
    await t.fill(rawEmails, [
      'User.Name+tag@gmail.com',
      'A.B+news@googlemail.com',
      'Ada@Example.com',
    ].join('\n'));
  }, [
    t.value('Each address is normalized', normalizedEmails, normalized),
    t.check('Copy is available', async () => {
      const className = await copyButton.getAttribute('class');
      return Boolean(className) && !className.split(/\s+/).includes('disabled');
    }),
  ], { covers: ['normalizes-list'] });

  await t.step('Copy the normalized addresses', async () => {
    await t.click(copyButton);
  }, [
    t.visible('Copy confirmation', page.getByText('Normalized emails copied to the clipboard')),
    t.check('Clipboard has the normalized list', async () => {
      const text = await page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        }
        catch {
          return '';
        }
      });
      return text === normalized;
    }),
  ], { covers: ['copies-result'] });

  await t.step('Flag an address that cannot be parsed', async () => {
    await t.fill(rawEmails, [
      'User.Name+tag@gmail.com',
      'not-an-email',
    ].join('\n'));
  }, [
    t.value('Invalid line is reported', normalizedEmails, [
      'username@gmail.com',
      'Unable to parse email: not-an-email',
    ].join('\n')),
  ], { covers: ['flags-invalid'] });

  await t.step('Clear the list', async () => {
    await t.click(page.getByRole('button', { name: 'Clear emails' }));
  }, [
    t.value('Raw emails are cleared', rawEmails, ''),
    t.value('Normalized emails are cleared', normalizedEmails, ''),
    t.check('Copy is disabled', async () => {
      const className = await copyButton.getAttribute('class');
      return Boolean(className) && className.split(/\s+/).includes('disabled');
    }),
  ], { covers: ['clears-and-disables-copy'] });
}
