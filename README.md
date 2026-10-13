# Pro Tour

**[pro-tour.nishilfaldu.site](https://pro-tour.nishilfaldu.site)**

Pro Tour lets your coding agent attach a short, captioned video of what a change does to its pull
request, so you can review the change by watching it instead of running the app.

After a user-visible change, the agent (Claude Code, Codex, Cursor, or any agent that can run shell
commands) writes a *tour*: a small, typed Playwright script that lists the behaviors the change adds and
demonstrates each one. Pro Tour records it with a visible cursor, step captions and on-screen checks,
and posts one comment on the PR: the video, then a "What this PR does" checklist with the step that
shows each behavior. You read the checklist, then watch the video.

The checks are what make the video trustworthy: a step passes only if it changed something on screen,
every listed behavior has to be shown, and a tour that fails is not published.

## Setup

In your app repository:

```sh
pnpm add -D github:nishilfaldu/pro-tour
pnpm exec playwright install --with-deps chromium
pnpm exec pro-tour init
pnpm exec pro-tour doctor
```

`init` installs the `pro-tour` skill where agents look for skills (`.agents/skills/` for Codex and
Cursor, `.claude/skills/` for Claude Code) and adds a short "Feature tours" section to `AGENTS.md` and
`CLAUDE.md`, so agents use it reliably. Commit those files. `doctor` checks the rest:

- Node.js 22.18 or newer (tours are TypeScript, run without a build step)
- [ffmpeg](https://ffmpeg.org) and ffprobe (`brew install ffmpeg`, or `sudo apt-get install ffmpeg`)
- the [GitHub CLI](https://cli.github.com), logged in (`gh auth login`), with `gh pr comment --attach`

No model API key is needed: the agent you already use does the writing.

## The workflow

1. You ask your agent for a change, as usual.
2. When the change works, the agent creates or updates `.tours/<feature>.tour.ts`, one tour per
   feature, named for the feature (`assignee-filter`, not the branch name), and type-checks it with
   `pro-tour check` (about a second, no recording).
3. It records the tour with `pro-tour run`. If the tour fails, it reads the failure file (the full
   error and the visible DOM where it stopped) and fixes the tour, or fixes the change if the failure
   is a real bug.
4. It commits the tour, opens or updates the PR, and runs `pro-tour publish`.
5. You open the PR, read the checklist and watch the video.

When the PR changes again, the agent records the tour again and publishes; the older video's comment
is hidden as outdated. Tours stay in `.tours/` as a current demo of each feature; recordings are
deleted from `.videos/` once they are on the PR.

## Commands

| Command | What it does |
|---|---|
| `pro-tour check [<file.tour.ts>...]` | Type-check tours without recording (default: all of `.tours/`) |
| `pro-tour run <file.tour.ts>... --url <url>` | Type-check, then record tours into `.videos/`; `--json` for agents; on failure, names the failure file |
| `pro-tour publish [<tour>...]` | Post the latest recording of each tour the PR adds or changes, or of the named tours; `--dry-run` prints the comment instead |
| `pro-tour init` | Install or refresh the skill for coding agents |
| `pro-tour api` | Print the tour API |
| `pro-tour doctor` | Check the browser, ffmpeg and GitHub CLI |

Exit codes: 0 passed, 1 a tour failed, 2 usage or setup error, 3 recording failed (app unreachable,
browser or encoder).

`publish` posts a recording only if it passed and shows the code at the head of the PR: the branch is
pushed, and neither the app nor the tour has changed since the recording. After any later commit
outside `.tours/`, record again. The comment names the commit the video shows. Rerunning `publish` is
safe: each comment carries a marker for its recording, so a comment already on the PR is reused, not
posted twice.

## A tour

The full API is in [`docs/tour-api.md`](docs/tour-api.md) (`pro-tour api` prints it).

```ts
import type { Tour, TourMeta } from 'pro-tour';

export const meta = {
  title: 'Filter tasks by status',
  summary: 'Pick a status to narrow the board.',
  behaviors: { 'filter-done': 'The Done filter shows only finished tasks' },
} satisfies TourMeta;

export async function run(t: Tour): Promise<void> {
  const { page } = t;
  await t.step('Filter the board to Done', async () => {
    await t.select(page.getByRole('combobox', { name: 'Status', exact: true }), 'Done');
  }, [
    t.text('2 tasks in view', page.locator('#visible-count'), '2'),
    t.hidden('Draft release notes is hidden', page.getByRole('heading', { name: 'Draft release notes' })),
  ], { covers: ['filter-done'] });
}
```

Actions are `t.click`, `t.fill` (types visibly), `t.select` (draws the open menu, which headless
Chromium does not paint), `t.press` and `t.goto`; checks are `t.visible`, `t.hidden`, `t.text`,
`t.value` and `t.check`. Checks are sampled before the step's actions and after each one. A step fails
unless at least one check went from false to true, and a `hidden` check must have been visible at some
point in the step, so a step cannot pass by asserting what was already on screen.

The `pro-tour` types resolve for `pro-tour check` even in a repository that does not use TypeScript.
Plain `.tour.js` tours also run, without type checking.

## Limitations

- The video shows the app as it runs on the machine that recorded it, with that machine's data. It
  demonstrates the change; it does not replace tests or CI.
- Tour code runs with the permissions of the Node process, like any script in the repository.
- Recording uses Playwright's video capture, which is soft at small text sizes.

## Development

```sh
pnpm install          # also builds dist/
pnpm exec playwright install --with-deps chromium
pnpm test             # type-checks src, tests and tours, then runs the tests
node sample-app/server.js &   # the sample app, http://127.0.0.1:4173
./bin/pro-tour.js run sample-app/.tours/status-filter.tour.ts --url http://127.0.0.1:4173
```

The source is TypeScript in `src/`, run directly by Node in a checkout and compiled to `dist/` by
`pnpm build` for the published package. `src/overlay.js` is plain JavaScript because it is injected
into the page as is.

`site/` is the website, deployed by Vercel on every push to `main`. The experiments that chose the
tour rules, and the harder test apps they ran against, are at the `research-archive` tag.
