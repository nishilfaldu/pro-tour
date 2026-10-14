# Pro Tour

**[pro-tour.nishilfaldu.site](https://pro-tour.nishilfaldu.site)**

Your coding agent records a short video of the change it made and posts it on the pull request, so you can
watch the change working instead of running the app.

A tour is a Playwright test the agent writes in `.tours/`. Pro Tour records it with a visible cursor, typing
you can follow, and a notice for each step and check. No API key: the agent you already use writes the tour.

## Setup

In your app's repository:

```sh
pnpm add -D --allow-build=pro-tour github:nishilfaldu/pro-tour
pnpm exec pro-tour install-browser
pnpm exec pro-tour init
```

`init` adds a short "Feature tours" section to `AGENTS.md` and `CLAUDE.md` that points agents at
[the docs](docs/feature-tours.md); commit it. Pro Tour also needs Node.js 22.18+, ffmpeg and the
[GitHub CLI](https://cli.github.com), logged in. `pro-tour doctor` checks them all.

## Use

Ask your agent for a change as usual. Once it works, the agent writes a tour, records it and publishes it on
the PR, or you ask it for one. A tour looks like this:

```ts
import { expect, test } from 'pro-tour';

test('Filter tasks by status', async ({ page }) => {
  await test.step('Filter the board to Done', async () => {
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Done');
    await expect(page.locator('#visible-count'), '2 tasks in view').toHaveText('2');
  });
});
```

| Command | What it does |
|---|---|
| `pro-tour run <tour> --url <app url>` | Record the tour into `.videos/` |
| `pro-tour publish` | Post each recording on the PR, then delete it |
| `pro-tour check` | Type-check tours without recording |

The video shows the app as it runs on your machine, with your data. It shows the change; it does not replace
tests.

## Development

```sh
pnpm install
./bin/pro-tour.js install-browser
pnpm test
node sample-app/server.js &
./bin/pro-tour.js run sample-app/.tours/status-filter.tour.ts --url http://127.0.0.1:4173
```

## License

[MIT](LICENSE)
