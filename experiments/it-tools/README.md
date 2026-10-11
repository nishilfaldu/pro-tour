# A real app: it-tools

[CorentinTh/it-tools](https://github.com/CorentinTh/it-tools) is a Vue 3 and Vite app with about a
hundred developer tools (363 source files). It runs in the browser with no backend, and most merged
PRs add one tool. Three deterministic tool PRs were toured with the default settings (gpt-6-sol, high
effort, up to three repairs):

| PR | Adds | Diff |
|---|---|---|
| [#1243](https://github.com/CorentinTh/it-tools/pull/1243) | Email normalizer | 6 files, +101 |
| [#729](https://github.com/CorentinTh/it-tools/pull/729) | Numeronym generator (with unit and e2e tests) | 8 files, +87/-1 |
| [#456](https://github.com/CorentinTh/it-tools/pull/456) | Percentage calculator (with an e2e test) | 5 files, +129/-1 |

## Method

For each PR: a worktree at the squash-merge commit, `base-<n>` at its parent, dependencies installed
with the pnpm version its lockfile needs (`--frozen-lockfile --ignore-scripts`), `vite` on its own port,
and then from the worktree:

```sh
pro-tour tour --url http://127.0.0.1:5301/ --base base-1243
```

The app's source is too large to send whole, so the planner sends the changed files and their direct
neighbors. it-tools' code is not part of this repository; only the tours Pro Tour wrote and the run logs
are. `logs/` holds each run's history, tokens and timings; `tours/` holds the tour each run saved.

## Results

Three context strategies, in the order they were tried:

| Context | Runs | Passed | First try | Avg repairs | Input tokens per run |
|---|---|---|---|---|---|
| Changed files, their imports and importers | 3 | 3/3 | 1/3 | 1.0 | 173k–353k |
| As above, but not following a hub file's imports | 3 | 2/3 | 1/3 | 1.3 | 42k–112k |
| As above, plus components used in changed templates | 6 | **6/6** | **5/6** | **0.2** | **41k–67k** |

- The first strategy followed `components.d.ts`, a generated registry that imports every component,
  and so sent 120 unrelated tool files.
- Skipping hubs (files with more than 15 imports) cut the context to the relevant files, but a tour then
  could not learn how `c-button` shows itself disabled (a CSS class, not the `disabled` attribute); it
  failed three repairs checking `isDisabled()`. The app's buttons are globally registered, with no
  import to follow.
- Resolving template tags (`<c-button>`) to their source files fixed that. This is the planner's
  current behavior.

Every tour opened the new tool from the app's own navigation, and every behavior listed was a real
part of the PR: exact outputs (`internationalization` becomes `i18n`, `alice@EXAMPLE.COM` becomes
`alice@example.com`), parse errors, empty inputs, copy feedback read back from the clipboard, and
clearing.

## Replay stability

The nine passing tours were replayed with no model. One replay in six of
`pr-729-neighbors-1` failed: its "Copied!" tooltip lasts about a second and a half, and the checks were
polled one after another with a chip animation between them. Checks are now polled together right
after the step's last action; after that change the tour passed 5/5 replays, and a sweep of all nine
tours, twice each, passed 18/18.

## A finding about the app

The PR #1243 tours check that "Copy normalized emails" is disabled with no input. `c-button` only adds
a `disabled` class and ignores clicks; the `<button>` element is not disabled, so keyboard and
assistive-technology users are not told. The tours describe the behavior accurately either way.
