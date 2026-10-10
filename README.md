# Pro Tour

Pro Tour records a short, captioned video of what a pull request does, so reviewers can see the change
working without running the app. It reads the PR's diff, lists the user-visible behaviors the change
adds, and writes a Playwright script (a *tour*) that demonstrates each one with a visible cursor,
step captions and on-screen checks. The video and a checklist go on the PR as one comment.

The checks are the evidence; the video is supporting material. A tour passes only if every step's
checks pass, every step changed something on screen, and every listed behavior was shown. A failed tour
is published as failed.

Tours are committed with the code (`.tours/<branch>.tour.js`). Later runs replay the saved script with
no model at all, and the model is only called again to repair a tour that stops passing.

## Requirements

- Node.js 20 or newer and pnpm
- ffmpeg and ffprobe (`brew install ffmpeg`, or `sudo apt-get install ffmpeg`)
- [Codex CLI](https://www.npmjs.com/package/@openai/codex), logged in, to plan and repair tours
  (replaying a saved tour needs no model)
- [GitHub CLI](https://cli.github.com) with `gh pr comment --attach` support, to publish

## Install

In your app repository:

```sh
pnpm add -D github:nishilfaldu/pro-tour
pnpm exec playwright install --with-deps chromium
pnpm exec pro-tour doctor --publish
```

`doctor` checks each prerequisite and prints the command that fixes anything missing.

## Record a tour

Start your app, commit your change, then run from the repository:

```sh
pnpm exec pro-tour tour --url http://localhost:5173
```

On the first run this:

1. lists the behaviors the branch's diff adds (against `origin/HEAD`, or `--base <ref>`),
2. writes `.tours/<branch>.tour.js` that covers each behavior,
3. records it into `.videos/<branch>-vN.mp4` with a report beside it (`.json` and `.md`),
4. repairs it from the failure (the error plus the page's visible DOM) up to three times.

The tour file is written only when an attempt passes; every attempt's script is kept beside its video.
Commit the tour. Running the same command again replays it with no model calls.

Publish to the branch's open PR, or pick one with `--pr`:

```sh
pnpm exec pro-tour tour --url http://localhost:5173 --publish
pnpm exec pro-tour publish .videos/my-branch-v3.mp4 --pr 42
```

Publishing is retry-safe: it looks for an earlier comment carrying the same recording's marker before
uploading, and refuses to upload again after an upload whose outcome is unknown until you pass
`--retry-upload`.

### Commands

| Command | What it does |
|---|---|
| `pro-tour tour --url <url>` | Replay the branch's tour, or plan, record and repair one |
| `pro-tour run <file.tour.js> --url <url>` | Record a saved tour, no model |
| `pro-tour publish <video.mp4>` | Comment on the PR with the video and checklist |
| `pro-tour doctor [--publish]` | Check prerequisites |

Useful options for `tour`: `--base <ref>`, `--diff <file>`, `--src <dir>` (the app source the planner
reads; defaults to the repository), `--model` (default `gpt-6-sol`, or `PRO_TOUR_MODEL`), `--effort`
(default `high`, or `PRO_TOUR_EFFORT`), `--rounds 3`, `--replan` (ignore the saved tour),
`--channel chrome` (record with an installed Chrome instead of Playwright's Chromium).

Exit codes: 0 passed, 1 tour failed, 2 usage or setup error, 3 recording failed (app unreachable, browser
or encoder), which never spends a repair.

## In CI

The repository is also a GitHub Action. Start the app in an earlier step, then:

```yaml
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  tour:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the planner diffs against the PR base
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm dev --port 5173 &
      - run: pnpm dlx wait-on http://localhost:5173
      - uses: nishilfaldu/pro-tour@main
        with:
          url: http://localhost:5173
        env:
          GH_TOKEN: ${{ github.token }}
          GH_MEDIA_TOKEN: ${{ secrets.GH_MEDIA_TOKEN }}   # optional, see below
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}   # only needed to plan or repair
```

The action replays the committed tour. If it is missing or broken and `OPENAI_API_KEY` is set, it plans
or repairs one, and the job summary tells you to commit the new tour from the `pro-tour` artifact.
Video uploads to PR comments go through `gh pr comment --attach`; if your workflow token cannot upload
attachments, set `GH_MEDIA_TOKEN` to a user token that can comment on the repository.
[`examples/workflows/ci.yml`](examples/workflows/ci.yml) is this repository's own CI, which dogfoods the
action on the sample app.

## Coding agents

[`docs/agent-rule.md`](docs/agent-rule.md) is a section to paste into your repository's `AGENTS.md` or
`CLAUDE.md`, so agents commit a tour with every user-visible change.

## Writing tours by hand

A tour is an ES module; the full API is in [`src/tour-api.md`](src/tour-api.md).

```js
export const meta = {
  title: 'Filter tasks by status',
  summary: 'Pick a status to narrow the board.',
  behaviors: { 'filter-done': 'The Done filter shows only finished tasks' },
};

export async function run(t) {
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
`t.value` and `t.check`. Checks are sampled before the step's actions and after each one. A step fails unless at least one check
went from false to true, and a `hidden` check must have been visible at some point in the step, so a
step cannot pass by asserting what was already on screen.

## Limitations

- Tour code, including model-written tours, runs with the permissions of the Node process. Run tours
  where the app runs, typically CI.
- Planning uses the Codex CLI. The model call is isolated in `src/planner.js` (`ask()`), the one place
  another backend would plug in.

## Development

```sh
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm test
node sample-app/server.js &   # the sample app, http://127.0.0.1:4173
./bin/pro-tour.js run sample-app/.tours/status-filter.tour.js --url http://127.0.0.1:4173
```

`fixtures/` holds harder test apps (a custom dropdown, duplicate labels, an inaccessible variant), and
[`experiments/`](experiments/README.md) records how the planner, the step rules and the default model were
chosen.
