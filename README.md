# pro-tour

Local-first, manual feature walkthroughs, with a separate legacy GitHub Actions integration.

## Manual local CLI (0.2.0)

Record one focused tour from an app repository that is **already running**. The CLI never installs
app dependencies, launches app code, or runs automatically on a PR. The existing Actions workflow
below is a separate integration and is unchanged.

Set up trusted Pro Tour tooling once in this checkout (Python 3.12+, Node is unnecessary for the local CLI):

```sh
uv sync --frozen --python 3.12
uv run pro-tour doctor
```

Install `ffmpeg`/`ffprobe` and authenticated `codex` separately. GitHub access is optional for local
recording. Pro Tour discovers `gh` on `PATH` to associate the current branch with a PR when available.
Publishing requires authenticated `gh` with `gh pr comment --attach`;
if your CLI lacks that feature, Pro Tour asks you to update it and preserves the local video. Put `TYPESAFE_API_KEY` and `GH_MEDIA_TOKEN` in this checkout's
ignored `.env.local` (or supply a trusted `--secrets-file`); the app repository's env files are never
loaded implicitly. A non-editable installation defaults to `~/.config/pro-tour/.env.local` instead.
Environment variables with those names take precedence. No secret values are printed.

The lockfile pins transitive dependencies; Jev also has an exact Git commit pin. For a standalone
installation, build the wheel with `uv build --wheel`, then install it in a dedicated Python 3.12
environment with `uv pip install --python <environment-python> --constraint requirements-runtime.lock
<wheel-path>`. Put that environment's `bin` on PATH. Installation is a separate, explicit setup step.

From the app repository, use the installed `pro-tour` command or this checkout's absolute `bin/pro-tour` path:

```sh
pro-tour record --url http://localhost:3000 \
  --goal "Show the new status filter"
pro-tour record --url http://localhost:3000 \
  --goal "Show the new status filter" --publish
pro-tour publish --video .videos/feat-status-filter-pr42-v1.mp4 --pr 42
pro-tour publish --video .videos/feat-status-filter-pr42-v1.mp4
```

`--model` defaults to `gpt-6-luna` for planning and on-demand text entry. Override it with
`--model <available-codex-model>`; the selected value goes directly to the authenticated Codex CLI.
The planner runs read-only in a temporary directory with user configuration, shell tools, and web search
disabled. It receives the current branch's committed merge-base diff (`base...HEAD`) and an initial
visible-page observation. Credential-like files are excluded. Uncommitted app edits are not part of the
planned diff. The provider interface in `local/pro_tour/providers.py` allows future planners.

The current branch and PR are discovered from Git and `gh`. The base defaults to the associated
PR's target branch on a matching local remote, then to local `origin/HEAD` when there is no verified
PR association. Pro Tour does not fetch refs; if the inferred ref is absent, it asks for `--base` or a
manual fetch. `publish` infers its PR from the adjacent recording report; `--pr` overrides that target.

Browser Harness connects to an existing visible Chrome by default; Pro Tour never launches Chrome.
In your logged-in Chrome, open `chrome://inspect/#remote-debugging`, enable remote debugging, and run
`pro-tour connect` in a terminal. Approve Chrome's prompt once and leave that command running while
tours reuse its approved connection. Ctrl-C disconnects it and removes its private connection metadata.
A single `record` can also connect directly, with Chrome's prompt at recording time. For unattended
runs, establish the connection first. `--url` is the app address; optional `--cdp-url` selects a particular
existing Chrome debugging endpoint. If discovery finds multiple instances, it asks for that override.
Discovery ignores headless instances and prints the selected process, user-data directory, and profile
when Chrome exposes it. It reports an unknown profile honestly; it does not read other tabs or cookies
to identify a profile. Your app login is reused through the browser itself.

Pro Tour starts a private, credential-free harness daemon, owns only its new tabs, and closes them on
completion or interruption. A shared `connect` daemon lives until that command stops; it does not close
the user's Chrome. If that connector is killed abruptly, confirm it has stopped and remove its stale
`~/.config/pro-tour/connection.json` before reconnecting. A dead connection fails without starting a
replacement browser. Keep `connect` alive for sequential tours; concurrent tours are not validated.
The recorder captures only the owned tab via CDP at 5 fps and encodes H.264/yuv420p with fast-start MP4
without desktop capture, Xvfb, or screen-recording permission. Capture and input share a per-tab lock
because Chrome screenshots temporarily change coordinate scaling. Interactions include a short pause
for readable playback; accessible `aria-busy` states settle before new observations (bounded at 5 seconds).

The pinned Jev Python library chooses every browser action using TypeSafe's Jev model. Codex only plans
natural-language goals and exact synthetic typing values. Configured text entry requires an exact observed field label. For a field hidden during planning,
the selected Codex model supplies a bounded synthetic value only after Jev selects that observed field.
This helper runs in its own temporary directory and receives no TypeSafe or GitHub token; password
and credential fields are rejected. Authenticate manually before recording. Browser and encoder
processes receive no model or GitHub token. Only the Jev worker receives the TypeSafe key; only the upload
command receives the media token. The CLI never reads or executes app configuration or app code.

Data sent outside your machine during a local tour:

| Recipient | Data sent | When |
| --- | --- | --- |
| Codex's model provider | Feature goal, filtered Git diff, initial page text and controls; observed field context and recent synthetic values when text is needed | Planning and optional text entry |
| TypeSafe | Step goal, current page URL/title/text, available controls and values, and recent browser actions including entered synthetic text | Browser action decisions |
| GitHub | MP4 and its concise PR comment | Only when you request publishing |

Pro Tour saves videos, plans, traces, and reports in the app repository's ignored `.videos/` directory.
It does not upload those artifacts to a Pro Tour service. Local-first refers to artifact storage;
Codex and TypeSafe calls still use remote model services. Use synthetic test data, because visible
app content can appear in model inputs, traces, and video frames. Review the MP4 before publishing it.

Each recording reserves `.videos/<sanitized-branch>-pr<number>-v<N>.mp4` without overwriting earlier
versions; a branch with no verified PR association uses `-no-pr-v<N>.mp4`. `.videos/` is added to
`.gitignore` once. Missing GitHub tooling, authentication, or connectivity does not block local recording.
The report's `pr_lookup` distinguishes `matched`, confirmed `missing`, and `unavailable`; the filename
alone does not prove that no PR exists. If `--publish` cannot access GitHub, the video is saved first and
publication returns an error. Publish it later with `pro-tour publish --video <path> --pr <number-or-url>`.
Use `--pr` to disambiguate an associated PR. Fork bases can use a matching `upstream` remote; head
repository matching is checked before recording. Fork handling is covered by local tests, with live
fork-PR validation still pending. GitHub Enterprise is outside this release.

The `.plan.json`, `.trace.json`, and `.report.json` beside the video record goals, safe text, Jev decisions,
action timings, fresh observations, outcome assertions, and media validation. `success` requires executed
actions and passing independent fresh-state checks for every step. `DONE` alone yields no proof.
Missing assertions yield `unverified`; blocked actions, failed assertions, and recorder failures yield
`failure`. A failed demonstration can still retain a playable failure video. Encoding failures retain a
report and any partial artifact. Every output is private by file mode and ignored by Git; page contents
can still contain app data, so use synthetic state.

Local saving and full MP4 decoding happen before publishing. Each newly published version creates its
own concise PR comment containing one inline video. Re-publishing the same version finds its existing
comment using a content/version marker. A private upload journal and per-video lock prevent blind
duplicate uploads after a lost response. If the result remains uncertain, inspect the PR and pass
`--retry-upload` only after confirming there is no matching comment. Upload failures preserve the local
video and return a failing exit code. Uploaded playback is explicitly **unverified** until a person
or browser validation actually plays it; upload success alone is not an end-to-end success claim.

Known Jev limits include frames, shadow DOM, canvas, uploads, pop-up tabs, and arbitrary keyboard widgets.
The browser shares the selected Chrome profile's app session. URLs must be localhost HTTP(S) and contain
no credentials, query string, or fragment. Only safe synthetic values are supported, and assertions
are bounded visible text/control checks rather than a general test oracle.

The release target is macOS with Python 3.12, existing Chrome, localhost apps, and synthetic/demo data.
Linux remains experimental; Windows recording is not supported. `pro-tour doctor --url <local-url>`
checks setup without model calls or app startup; `--publish` also requires publishing access, and
`--connect` performs an actual browser handshake. Recording does not require GitHub access. Transient
model/read requests have bounded retries; browser mutations and upload POSTs are never blindly retried.
Reports identify the failed phase. `--timeout` bounds Jev execution (default 600 seconds), alongside
separate planning, connection, recording, and upload deadlines.

Run the local tests with:

```sh
uv run python -m unittest discover -s tests -p 'test_*.py'
npm test
uv run python scripts/check-local-release.py
uv run python benchmarks/run.py
```

The [local benchmark](benchmarks/README.md) makes real Codex and TypeSafe calls against trusted
synthetic fixtures using the connected Chrome. It tests forms, delayed search, empty states, cancellation,
session reuse, versioning, and actual MP4 playback. Its independent fixture oracle evaluates the pipeline;
it does not add stronger runtime assertions to the product. Run it explicitly: it is never an automatic
PR job, incurs model usage, and temporarily shows owned playback tabs. Provider token usage and wall
time are recorded; dollar cost remains unknown when the providers do not expose billing totals.

## Sample task board

Run `npm ci`, then `npm start` and open <http://127.0.0.1:4173>. The board starts with three synthetic tasks. Use **Reset demo** before each recording to restore those tasks and clear the status filter. Task changes are stored only in the browser's local storage.

Run `npm test` for the HTTP and real Chrome journey tests. The browser test needs Google Chrome installed locally.

## PR tours

The `Pro Tour` workflow runs on PR open, reopen, and update. It skips changes confined to documentation. For an app change, it checks out the exact PR head into `pr-source`, reads `pro-tour.config.json`, runs the configured install and start commands in a restricted Docker container, and waits for the configured local HTTP URL. The config currently uses `npm ci`, `npm start`, and `http://127.0.0.1:4173/`.

The workflow reads its scripts and `tour-profile.json` from the trusted base revision. The PR app checkout is mounted only into the container. The container receives no GitHub token or Pro Tour credentials, and the local launcher rejects `.env`, `.env.local`, and `.npmrc` in its mount root. Grok 4.7 plans separate full and focused goal sequences. The pinned upstream Jev policy selects browser actions. Its optional typing model is replaced by exact values from `tour-profile.json`; no extra language model writes task text. A separate credential-free process records the Jev tab to MP4. GitHub CLI attaches both videos directly to one PR comment containing only brief labels and the two players.

The sample profile uses its first Jev goal to reset synthetic state before each recording. Adapt `tour-profile.json` when installing the workflow in another repository: describe the app, its main journeys, its changed feature, a repeatable setup goal, and exact text values that may be typed. Store `TYPESAFE_API_KEY`, `CURSOR_API_KEY`, and `GH_MEDIA_TOKEN` as repository Actions secrets. Keep credential files outside the PR checkout.

Jev is installed from unmodified [`browser-use/jev-ultrafast`](https://github.com/browser-use/jev-ultrafast) commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`; its MIT license is in [`licenses/jev-ultrafast-MIT.txt`](licenses/jev-ultrafast-MIT.txt). The integration intercepts Jev's optional `TYPE_TEXT` helper to use configured strings and requires a browser daemon started before the credentialed Jev process.

The imported skills are preserved in [`skills-main/`](skills-main/).

The updated Easy Loop workflow is installed at [`.agents/skills/df-easy-loop-e2e/`](.agents/skills/df-easy-loop-e2e/). Its repo-level model assignments are in [`.diffusion/skills/models.yaml`](.diffusion/skills/models.yaml): Codex Astra xhigh writes the plan and code; Cursor Grok 4.7 xhigh critiques, validates, and reviews. Override those role assignments on experiment branches to compare combinations.
