# Local release validation — 2026-09-29

Historical report from before the September 30 branch split. The GitHub Actions implementation
and its runner tests now live on [`codex/github-actions`](https://github.com/nishilfaldu/pro-tour/tree/codex/github-actions).
The local CLI and sample app remain on this branch; test counts below describe the original run.

Validated on macOS arm64, Python 3.12.12, existing everyday Chrome 153.0.8010.54,
Codex 0.156.1, and media-capable GitHub CLI 2.101.0. The local implementation is
separate from the existing Actions integration; its workflow is unchanged.

The user approved the existing Chrome debugging connection, the Fieldnotes sample app
as the target, and an expanded fixture with longer/trickier scenarios. No separate app
repository or live fork PR was tested. Pro Tour never started Chrome or app code; the
validation harness separately started trusted sample/fixture servers and closed them.
The user’s app session is assumed to be established before tours.

## Exact successful commands

Run from `/Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/.tools/app-feature-validation`.
The media-capable `gh` directory was placed on PATH for this machine because its older
system `gh` lacks attachments. Users need a media-capable `gh` on PATH; there is no `--gh` flag.
Chrome had been connected with `bin/pro-tour connect` from the trusted tooling checkout.

```sh
PATH=/Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/.tools/gh_2.101.0_macOS_arm64/bin:$PATH /Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/bin/pro-tour record --url http://127.0.0.1:4173 --goal 'Demonstrate the delayed task search feature in four stages. First Reset demo, search onboarding using Apply search, wait for Search updated, and show only Review onboarding flow. Second Clear search and show all three original tasks. Third search synthetic-no-match using Apply search, wait for Search updated, and show No tasks match the selected filters. Fourth Clear search and finish with all three original tasks restored. Keep the empty result and restored result in separate walkthrough steps.' --publish
```

This recorded v2 with inferred PR/base/browser and default `gpt-6-luna`. A repeat using
the installed, non-editable wheel recorded v3:

```sh
PATH=/Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/.tools/gh_2.101.0_macOS_arm64/bin:$PATH /Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/.tools/release-venv/bin/pro-tour record --url http://127.0.0.1:4173 --goal 'Demonstrate the delayed task search feature in four stages. First Reset demo, search onboarding using Apply search, wait for Search updated, and show only Review onboarding flow. Second Clear search and show all three original tasks. Third search synthetic-no-match using Apply search, wait for Search updated, and show No tasks match the selected filters. Fourth Clear search and finish with all three original tasks restored. Keep the empty result and restored result in separate walkthrough steps.' --publish --secrets-file /Users/happyhome/Desktop/pro-tour-sol-low-grok47-low/.env.local
```

The installed wheel was tested with an explicit trusted credential path; its default is
`~/.config/pro-tour/.env.local`. No keys were copied into app code, browser state, or tracked files.

## Video and publication evidence

- v2: `.tools/app-feature-validation/.videos/demo-local-production-validation-pr5-v2.mp4`, 15.0 seconds.
- v3: `.tools/app-feature-validation/.videos/demo-local-production-validation-pr5-v3.mp4`, 14.8 seconds.
- PR: https://github.com/nishilfaldu/pro-tour/pull/5 (draft feature-validation PR).
- v2 comment: https://github.com/nishilfaldu/pro-tour/pull/5#issuecomment-5905073242
- v3 comment: https://github.com/nishilfaldu/pro-tour/pull/5#issuecomment-5905128873

Both MP4s decoded fully and played to `ended=true` in local Chrome players. Both GitHub
inline players were clicked and played to the end with no player error. Separate private
`.local-playback.json` and `.inline-playback.json` artifacts record this validation. Screenshots
are in `.tools/release-artifacts/pr5-v2-inline-played.png` and `pr5-v3-inline-played.png`.
Product upload reports deliberately remain `playback: unverified`; the CLI does not claim to
have watched an upload. Actual playback evidence comes from this validation session.

Re-publishing v2 without `--pr` inferred its metadata and returned the original comment with
`reused=true`. v3 got its own comment. SHA256 checks matched uploaded recordings and preserved
v1/v2/v3. The failure video v1 was retained locally and was not published. Each app checkout's
`.gitignore` has exactly one `.videos/` entry.

## Tests and failures

- 31 Python tests passed, covering secrets isolation, recording ownership, capture/input
  locking across processes, stale/private connections, versioning, ambiguous/malformed PR data,
  fork-base inference, retries, DONE versus evidence, upload locks and lost-response reconciliation.
- All 12 existing JavaScript tests passed, including the sample app browser journey.
- `uv lock --check`, `git diff --check`, manual release script, wheel build and installation passed.
  The non-editable installed command completed a real tour and its setup doctor returned `ready`.
- Final real Codex → TypeSafe Jev → MP4 benchmark: 3/3 task completion, 3/3 full browser playback,
  zero false success, distinct no-PR versions, reused synthetic HTTP-only session across owned tabs.

| Case | Wall time (seconds) | MP4 duration (seconds) | Completed | Played |
| --- | ---: | ---: | --- | --- |
| create-edit-filter | 48.18 | 16.0 | yes | yes |
| delayed-search-empty-recovery | 43.35 | 13.8 | yes | yes |
| cancel-unsaved-edit | 42.31 | 13.2 | yes | yes |

Raw final benchmark evidence is under `.tools/benchmark-runs/release-candidate/`. Earlier failed
runs are retained. They exposed a screenshot/input scaling race and decisions against delayed
DOM state; execution now serializes capture/input and waits on bounded `aria-busy` readiness.
A broad initial live plan also asserted both empty and restored search states after a single
step; it failed accurately. Planning guidance now separates incompatible visible end states.
Runtime verification was not expanded into a stronger general oracle.

Meaningful live failures:

- Confirmed missing PR: `--publish` saved a playable `no-pr-v2.mp4`, then returned exit 1 and
  “No associated PR; local recording saved. Publish later with --pr”.
- Missing GitHub CLI: a PATH without `gh` still recorded and played `no-pr-v3.mp4`, exit 0;
  `pr_lookup` was `unavailable`, with installation/auth instructions.
- Encoder failure: an intentionally failing trusted ffmpeg wrapper caused exit 1, a failure
  trace/report and no valid video. Its reserved failed version was not reused.
- Upload access failure: a synthetic invalid media token caused GitHub reconciliation to fail,
  exit 1 and a private `.publish-failure.json`; the valid local video was unchanged, with no
  upload/comment attempted after access failed. Actual lost-response POST recovery is tested
  with controlled responses; destructive network fault injection against GitHub was not used.

## Remaining boundaries

macOS/Python 3.12/localhost/synthetic data is the validated target. This is a small release
regression suite, not a broad production reliability estimate. Linux is experimental; Windows,
GitHub Enterprise, concurrent tours, live fork PRs and existing browser-use benchmark adapters
are not validated. Jev retains its frames/shadow-DOM/canvas/pop-up/upload/widget limits. Runtime
checks remain bounded visible text/control assertions, as requested. Automatic masking and
general outcome verification are deferred. Dollar costs are unknown; actual provider token
usage and timing are recorded. Publishing needs a gh version with `--attach` and a valid media
token. Chrome approval must be established before an unattended run; a dead connector fails.

Final cleanup confirmed no remaining Pro Tour worker/recorder/harness or validation-server
processes and no shared connection metadata. The user's Chrome remains running; only owned
validation/setup tabs were closed. The original uncommitted cleanup is preserved outside the
implementation commit. The built wheel's SHA256 is
`ba65e87fd2ab5e43edaa1afb812436c9b7d8d0ed9247b1153fe3546844f95d03`.
