# Local MVP validation — September 29, 2026

Historical report from before the September 30 branch split. The GitHub Actions implementation
and its runner tests now live on [`codex/github-actions`](https://github.com/nishilfaldu/pro-tour/tree/codex/github-actions).
The local CLI and sample app remain on this branch; test counts below describe the original run.

The user approved PR #4's sample app as the final target, replacing the original separate-app
requirement. No independent application repository was validated. PR #4 changes a security-runner
marker rather than the status-filter UI; the feature demonstration covers the sample app's existing
status filter. The app ran from an isolated checkout of the real PR head, not from this implementation
worktree. Neither the original `/Users/happyhome/Desktop/pro-tour` nor the Astra worktree was edited.

## CLI simplification follow-up

Local recording now continues when `gh` is missing or PR lookup fails due to authentication/network
access. Its report records `pr_lookup: unavailable`, separately from a confirmed missing PR. The
`no-pr` filename fallback means no verified association. `--publish` still saves the video before
reporting unavailable GitHub access; standalone publishing remains authenticated. Invalid or ambiguous
explicit associations still fail rather than being silently ignored. All 19 Python tests passed,
including orchestration fixtures for both unavailable-access paths with and without publishing. These
follow-up fixtures stub browser/model/media operations; they are not another live video validation.

`--gh` has been removed. The CLI resolves `gh` from `PATH`, gives an installation message if it is
missing, and gives an update message when media attachments are unsupported. For reproducing these
publish checks, put a media-capable GitHub CLI on `PATH`. The follow-up passed 17 Python tests, a real
missing-CLI invocation, capability detection of the downloaded CLI through `PATH`, and the installed
older CLI’s friendly publishing error. The existing local video was preserved.

## Real record and publish

App checkout: `/Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/.tools/app-pr4`

PR head: `demo/sol-low-security-final-20260925` at `c8bf1ffe40109c63464ea6c56079297b334f9b37`.
The test setup started its dependency-free Node server separately. The CLI installed no app
dependencies and started no app code. Existing user Chrome had no remote-debugging endpoint, so test
setup started one credential-free headless Chrome with a temporary profile and port 9223. The CLI
connected to it using Browser Harness. The test setup's server, browser, and preview server were
stopped after validation. The CLI closed its owned tabs, harness daemon, and recorder each time.

The equivalent current command, run from the app checkout (the original validation used an executable
override that has since been removed):

```sh
../../bin/pro-tour record \
  --url http://127.0.0.1:4173 \
  --base origin/exp/sol-low-author-grok47-low-reviewer \
  --goal 'Show the status filter: select To do and Done, visibly showing matching task inclusion and exclusion of tasks with other statuses. Use the existing synthetic tasks.' \
  --model gpt-6-sol \
  --cdp-url http://127.0.0.1:9223 \
  --publish
```

Final successful output:

- Local video: `.tools/app-pr4/.videos/demo-sol-low-security-final-20260925-pr4-v5.mp4`
- [Inline PR comment](https://github.com/nishilfaldu/pro-tour/pull/4#issuecomment-5899293584)
- H.264/yuv420p MP4, 4.8 seconds, 36,583 bytes; full-file FFmpeg decode passed.
- Real authenticated Codex CLI calls used `gpt-6-sol`. TypeSafe returned `jev-1.13.0`.
- Jev selected the filter's To do and Done options. Fresh independent observations confirmed each
  selected value, matching task inclusion, and both other-task exclusions.
- The saved local video and the inline PR video were actually played in browsers. Both reached
  `currentTime = duration = 4.8`, `ended = true`, `readyState = 4`, and no media error. Visual inspection
  showed the board and filtered task states. Upload success was not used as playback evidence.
- Playback metadata is beside the video in `.verification.json`; the screenshot is
  `.tools/evidence/pr-v5-playback.jpg`. These local artifacts are ignored, not committed.

The standalone publish command was also exercised successfully for v1:

```sh
../../bin/pro-tour publish \
  --video .videos/demo-sol-low-security-final-20260925-pr4-v1.mp4 --pr 4
```

Versions v1 and v2 each received their own new PR comment and were played inline to completion.
Existing versions were preserved. Failed encoder attempts reserved v3 and v4, which explains why the
final successful recording is v5. Each failed attempt has a report and trace, without an empty MP4.

## Runtime failure and typing checks

- Real GitHub lookup of `codex/local-no-pr-validation` returned no PR. A `--publish` recording saved a
  playable `codex-local-no-pr-validation-no-pr-v1.mp4` first, reported the missing PR, and exited 1.
  A second recording without publishing succeeded as `no-pr-v2`, proving local recording needs no PR.
- A trusted test-only encoder executable exiting 17 caused real recorder failure. The CLI reported
  `Recording process failed`, `video_saved: false`, and exit 1, saved an action trace/report, and
  cleaned up owned tabs and recorder processes. Existing v1/v2 videos were preserved.
- A deliberately invalid fixture media token was submitted to GitHub through the upload process.
  GitHub rejected it. The command exited 1, saved `.publish-failure.json`, and retained the local v2
  video and its original successful publishing metadata. No rejected comment was posted.
- A real Jev walkthrough opened the task dialog, typed configured synthetic Task name and Details,
  saved the task, independently checked both strings on the board, and reset the demo.
- A full CLI run also used real Codex planning and Jev typing, saving the synthetic task and resetting
  it. Its final feature checks passed; one preparatory step lacked assertions, so the report correctly
  remained `unverified` rather than claiming complete evidence.
- The bounded on-demand Codex text helper made real calls with the selected model for observed fields.
  It receives no TypeSafe or GitHub token. Jev continues to choose the field and execute text entry.
- A Jev-selected Done filter action with no assertions was reported `unverified`. The same action with
  an intentionally false fresh-state assertion was reported `failure`, retaining a playable failure
  video. `DONE` was not sufficient to pass either case.

## Automated verification

```sh
PYTHONPATH=local .tools/local-venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm test
git diff --check
```

14 Python tests and all 12 existing JavaScript tests passed. Tests cover safe environment construction,
credential-like diff exclusions, exact-field synthetic typing, guarded observed-field fallback, visible
outcome checks, no-PR versus GitHub failure, upload preservation, atomic version reservation, ignore-entry
deduplication, output symlink rejection, timeout cleanup including child processes, and existing runner
behavior. The JavaScript browser test used real local Chrome.

Source and JSON artifacts were checked for the two actual credential values without printing them;
neither was present. The Actions workflow was unchanged. The original cleanup was checked against the
initial diff and left uncommitted.

## Limits

The default connection to the user's existing Chrome could not be runtime-tested because that Chrome
was not configured for remote debugging. The local CLI's explicit existing-CDP path was tested on macOS.
No other app, fork PR, or GitHub Enterprise instance was tested. Recording is silent at 5 fps. Login,
credential entry, uploads, canvas, frames, shadow DOM, pop-up tabs, and arbitrary keyboard widgets remain
outside this MVP. Outcome evidence is based on bounded visible text/control assertions; incomplete plans
are conservatively unverified. Normal invocation only records an already-running app and needs preinstalled
Pro Tour tooling, authenticated Codex/GitHub access, and an available Chrome debugging connection.
