# Pro Tour

Record a feature walkthrough from an already-running local app. Codex plans the tour from your branch’s committed diff; TypeSafe’s Jev model drives the browser. Pro Tour saves one versioned MP4 locally, with optional publishing to a PR.

## Installation

Requires macOS, `uv`, Git, `ffmpeg`/`ffprobe`, an authenticated Codex CLI, and Chrome. Installation uses an isolated Python 3.12 environment.

The first public PyPI release is being prepared; this install command becomes available once it is published:

```sh
uv tool install --python 3.12 pro-tour-local
uv tool update-shell
```

Restart your terminal if `pro-tour` is not on PATH, then run:

```sh
pro-tour setup
```

Setup asks for your default Codex model (`gpt-6-luna`), your TypeSafe API key, and whether you want to configure GitHub publishing. Key input is hidden. It saves configuration privately and checks prerequisites; run it again to change preferences or replace keys. Press Enter to keep an existing key.

Publishing needs a GitHub media token and authenticated `gh` on PATH with support for `gh pr comment --attach`. GitHub access is optional for recording. Configuring publishing does not publish automatically.

Advanced: setup saves keys in `~/.config/pro-tour/.env.local` and your model preference in `~/.config/pro-tour/config.json`, both with private permissions. Environment variables `TYPESAFE_API_KEY` and `GH_MEDIA_TOKEN` override saved keys and are not copied to disk by setup. `--secrets-file <trusted-path>` selects another credentials file; app repository env files are never loaded automatically.

```sh
pro-tour doctor
```

Use `pro-tour doctor --publish` to check publishing credentials and GitHub CLI attachment support too.

For contributing or running from a checkout, see [setup.md](setup.md).

Once published, upgrade with `uv tool upgrade pro-tour-local`. Jev's runtime library is bundled with Pro Tour; other Python dependencies resolve to compatible versions during installation.

## Connect your browser

Open Chrome, visit `chrome://inspect/#remote-debugging`, and enable remote debugging. If your app requires login, sign in first. Run in a separate terminal:

```sh
pro-tour connect
```

Approve Chrome’s prompt and leave the connector running. Tours reuse your open app tab, preserving its current page and state. If the app is not open, Pro Tour opens its URL in that Chrome window. The app tab stays open afterward. Ctrl-C stops the connector; your Chrome stays open. Optional `--cdp-url` selects an existing Chrome debugging endpoint when discovery is ambiguous.

## Record and publish

Run from the app’s Git repository with its app already running:

```sh
pro-tour record --url http://localhost:3000 --goal "Show the new status filter"
```

The selected tab and window are shown before planning. If several tabs match, select one with `--tab-id <id>` using the IDs in the error message.

The model uses your setup preference, falling back to `gpt-6-luna`. The branch comes from your current checkout; PR and base ref are inferred when available. Override the model, PR, or base with `--model`, `--pr`, or `--base origin/main`. Without an accessible PR, the base falls back to local `origin/HEAD`; supply `--base <ref>` if that is missing. The base must already exist locally. Pro Tour uses committed changes against the base; it does not fetch refs, install app dependencies, or start the app.

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

Use synthetic/demo data. If the app requires login, sign in before recording. Codex receives the goal, filtered diff, and page/field context; TypeSafe receives page observations and actions, including entered synthetic text. Videos, plans, traces, and reports are saved locally; publishing uploads the video only. Pro Tour has no central collection service. Secrets are passed only to the processes that need them, never to the browser or app.

App URLs must be localhost HTTP(S), without credentials, query strings, or fragments. Checks cover visible text and controls. Frames, shadow DOM, canvas, uploads, pop-up tabs, and arbitrary keyboard widgets are known limitations. Concurrent tours are unvalidated; Linux is experimental and Windows recording is unsupported.

The separate GitHub Actions version is on [`codex/github-actions`](https://github.com/nishilfaldu/pro-tour/tree/codex/github-actions). Jev’s [MIT license](licenses/jev-ultrafast-MIT.txt) is included.
