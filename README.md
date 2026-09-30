# pro-tour

Local-first, manual feature walkthroughs, with a separate legacy GitHub Actions integration.

## Manual local CLI (MVP)

Record one focused tour from an app repository that is **already running**. The CLI never installs
app dependencies, launches app code, or runs automatically on a PR. The existing Actions workflow
below is a separate integration and is unchanged.

Set up trusted Pro Tour tooling once in this checkout (Python 3.12+, Node is unnecessary for the local CLI):

```sh
uv venv --python 3.12 .tools/local-venv
uv pip install --python .tools/local-venv/bin/python -e .
```

Install `ffmpeg`/`ffprobe` and authenticated `codex` separately. GitHub access is optional for local
recording. Pro Tour discovers `gh` on `PATH` to associate the current branch with a PR when available.
Publishing requires authenticated `gh` with `gh pr comment --attach`;
if your CLI lacks that feature, Pro Tour asks you to update it and preserves the local video. Put `TYPESAFE_API_KEY` and `GH_MEDIA_TOKEN` in this checkout's
ignored `.env.local` (or supply a trusted `--secrets-file`); the app repository's env files are never
loaded implicitly. A non-editable installation defaults to `~/.config/pro-tour/.env.local` instead.
Environment variables with those names take precedence. No secret values are printed.

From the app repository, use the installed `pro-tour` command or this checkout's absolute `bin/pro-tour` path:

```sh
pro-tour record --url http://localhost:3000 --base origin/main \
  --goal "Show the new status filter"
pro-tour record --url http://localhost:3000 --base origin/main \
  --goal "Show the new status filter" --publish
pro-tour publish --video .videos/feat-status-filter-pr42-v1.mp4 --pr 42
```

`--model` defaults to `gpt-6-luna` for planning and on-demand text entry. Override it with
`--model <available-codex-model>`; the selected value goes directly to the authenticated Codex CLI.
The planner runs read-only in a temporary directory with user configuration, shell tools, and web search
disabled. It receives the current branch's committed merge-base diff (`base...HEAD`) and an initial
visible-page observation. Credential-like files are excluded. Uncommitted app edits are not part of the
planned diff. The provider interface in `local/pro_tour/providers.py` allows future planners.

Browser Harness connects to existing Chrome by default. Enable Chrome remote debugging and approve
its connection prompt beforehand. Alternatively use `--cdp-url http://127.0.0.1:9223` for an already-running
local debugging browser. Pro Tour starts a private, credential-free harness daemon, owns only its new
tabs, and closes them and its daemon on completion or interruption; it does not close the user's Chrome.
The recorder captures only the owned tab via CDP at 5 fps and encodes H.264/yuv420p with fast-start MP4
on macOS or Linux, without desktop capture, Xvfb, or screen-recording permission.

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
Use `--pr` to disambiguate an associated PR. Forks and GitHub Enterprise are outside this MVP.

The `.plan.json`, `.trace.json`, and `.report.json` beside the video record goals, safe text, Jev decisions,
action timings, fresh observations, outcome assertions, and media validation. `success` requires executed
actions and passing independent fresh-state checks for every step. `DONE` alone yields no proof.
Missing assertions yield `unverified`; blocked actions, failed assertions, and recorder failures yield
`failure`. A failed demonstration can still retain a playable failure video. Encoding failures retain a
report and any partial artifact. Every output is private by file mode and ignored by Git; page contents
can still contain app data, so use synthetic state.

Local saving and full MP4 decoding happen before publishing. Each publish creates a new concise PR
comment containing one inline video. Upload failures preserve the local video and return a failing exit
code, so `pro-tour publish` can retry it. Uploaded playback is explicitly **unverified** until a person
or browser validation actually plays it; upload success alone is not an end-to-end success claim.

Known Jev limits include frames, shadow DOM, canvas, uploads, pop-up tabs, and arbitrary keyboard widgets.
The browser shares the selected Chrome profile's app session. URLs must be localhost HTTP(S) and contain
no credentials, query string, or fragment. Only safe synthetic values are supported, and assertions
are bounded visible text/control checks rather than a general test oracle.

Run the local tests with:

```sh
PYTHONPATH=local .tools/local-venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm test
```

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
