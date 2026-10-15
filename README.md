# Pro Tour

**[pro-tour.nishilfaldu.site](https://pro-tour.nishilfaldu.site)**

Your coding agent records a short video of the change it made and posts it on the pull request, so you can
watch the change working instead of running the app.

A tour is a Playwright test the agent writes in `.tours/`. Pro Tour records it with a visible cursor, typing
you can follow, and a notice for each step and check. No API key: the agent you already use writes the tour.

## Setup

In your app's repository:

```sh
pnpm add -D github:nishilfaldu/pro-tour#v0.1.0
pnpm exec pro-tour install-browser
pnpm exec pro-tour init
```

With npm: `npm i -D github:nishilfaldu/pro-tour#v0.1.0`, then `npx pro-tour …`. `init` adds a short "Feature tours"
section to `AGENTS.md` and `CLAUDE.md` (only `AGENTS.md` if `CLAUDE.md` imports it) that points agents at
[the docs](docs/feature-tours.md); commit it. Pro Tour also needs Node.js 22.18+, ffmpeg and the
[GitHub CLI](https://cli.github.com), logged in. `pro-tour doctor` checks them all.

`#v0.1.0` installs that [release](https://github.com/nishilfaldu/pro-tour/releases). To update, or to go back
if a release breaks something, install another one the same way. For the latest commit on main instead, leave
out `#v0.1.0`: `pnpm add -D github:nishilfaldu/pro-tour`, which `pnpm update pro-tour` (or `npm update
pro-tour`) then moves to the newest commit.

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
| `pro-tour run <tour> --url <app url> --fast` | Run the tour without recording it, to fix it quickly |
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

`dist/` is committed, so an install from GitHub has nothing to build. After changing `src/`, run `pnpm build`
and commit `dist/` with it: `pnpm test` fails when `dist/` is out of date (and rebuilds it), and CI fails when
the committed one is.

To release, set `version` in `package.json` and the `#v…` in this README and the website's setup (`pnpm test`
checks they agree), merge it, then tag that commit on main and push the tag:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

CI tests the tag, installs it with pnpm 11, pnpm 12 and npm, and publishes it as a GitHub release.

## License

[MIT](LICENSE)
