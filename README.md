# Pro Tour

Record a feature walkthrough from an already-running local app. Codex plans the tour from your branch’s committed diff; TypeSafe’s Jev model drives the browser. Pro Tour saves one versioned MP4 locally, with optional publishing to a PR.

## Installation

Requires macOS, Python 3.12+, `uv`, `ffmpeg`/`ffprobe`, an authenticated Codex CLI, and an existing Chrome session.

Install from the current local-CLI branch. The repository is currently private, so Git needs authenticated access:

```sh
git clone --depth 1 --single-branch --branch exp/sol-low-author-grok47-low-reviewer \
  https://github.com/nishilfaldu/pro-tour.git pro-tour-install
uv tool install --python 3.12 \
  --constraints pro-tour-install/requirements-runtime.lock ./pro-tour-install
uv tool update-shell
```

This installs `pro-tour` in an isolated environment using the pinned runtime dependencies. Restart your terminal if `pro-tour` is not on PATH.

Put `TYPESAFE_API_KEY` in `~/.config/pro-tour/.env.local`. Publishing also needs `GH_MEDIA_TOKEN` and authenticated `gh` on PATH with support for `gh pr comment --attach`. GitHub access is optional for recording.

Environment variables override the credentials file. Use `--secrets-file <trusted-path>` to select another file; app repository env files are never loaded automatically.

```sh
pro-tour doctor
```

For contributing or running from a checkout, see [setup.md](setup.md).

## Connect your browser

Log into your app in Chrome, open `chrome://inspect/#remote-debugging`, and enable remote debugging. Run in a separate terminal:

```sh
pro-tour connect
```

Approve Chrome’s prompt and leave the connector running. Tours reuse your app login and close their own tabs afterward. Ctrl-C stops the connector; your Chrome stays open. Optional `--cdp-url` selects an existing Chrome debugging endpoint when discovery is ambiguous.

## Record and publish

Run from the app’s Git repository with its app already running:

```sh
pro-tour record --url http://localhost:3000 --goal "Show the new status filter"
```

The model defaults to `gpt-6-luna`. Branch, PR, and base ref are inferred when available. Override them with `--model`, `--pr`, or `--base origin/main`. Pro Tour uses committed changes against the base; it does not fetch refs, install app dependencies, or start the app.

Videos and adjacent plans, traces, and outcome reports go in the app repository’s ignored `.videos/` directory:

- `<sanitized-branch>-pr<number>-v1.mp4`
- `<sanitized-branch>-no-pr-v1.mp4` without a verified PR association

Later recordings increment the version and never overwrite. Reports distinguish `success`, `failure`, and `unverified`; Jev choosing `DONE` alone does not establish success.

To publish immediately, add `--publish` to `record`. To publish a saved video:

```sh
pro-tour publish --video .videos/feat-status-filter-pr42-v1.mp4 --pr 42
```

`--pr` accepts a number or URL and can be omitted when the adjacent report identifies the PR. Each published version gets a concise comment with an inline video. Upload failures preserve the local recording. Play the saved MP4 and the PR’s inline player to confirm playback.

Use `pro-tour <command> --help` for all options.

## Data and limits

Use synthetic/demo data and log into the app before recording. Codex receives the goal, filtered diff, and page/field context; TypeSafe receives page observations and actions, including entered synthetic text. Videos and traces stay local until you request publishing. Pro Tour has no central collection service. Secrets are passed only to the processes that need them, never to the browser or app.

App URLs must be localhost HTTP(S), without credentials, query strings, or fragments. Checks cover visible text and controls. Frames, shadow DOM, canvas, uploads, pop-up tabs, and arbitrary keyboard widgets are known limitations. Concurrent tours are unvalidated; Linux is experimental and Windows recording is unsupported.

The separate GitHub Actions version is on [`codex/github-actions`](https://github.com/nishilfaldu/pro-tour/tree/codex/github-actions). Jev’s [MIT license](licenses/jev-ultrafast-MIT.txt) is included.
