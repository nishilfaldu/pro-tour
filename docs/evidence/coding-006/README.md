# Coding visit 006 evidence

P05's token-authenticated inline-media prerequisite passed locally and on a real GitHub Actions runner. Both runs posted two synthetic four-second MP4s; all four players were watched through completion in an anonymous PR conversation. No app or feature journey was recorded. The automatic PR-to-tours product remains incomplete.

## Source and runtime identity

- Implementation: `8ddf41af6c8d6c7cf4c58dcf658c218f3c5a7d09`, branch `exp/astra-xhigh-author-grok47-xhigh-reviewer`.
- CLI: `2.101.0`, official source commit `0cf1092493af067646fc5f3db9421c6a6ec9c938`; pinned archive/source metadata in `gh-release.json`. The system CLI remains `2.94.0`.
- Local upload: Linux arm64 Docker Desktop, image `sha256:85b8dbec4836e39213941d0d59db129bc4a1cc2fea29d9fc45cd955e35c7609b`; `media-image-final.json` records build input hashes. Earlier build metadata outside this directory is superseded, not additional upload evidence.
- CI upload: Ubuntu 24.04 x86_64, image `sha256:fc209f86512d0ff1853f8c6b52104f75a4b4a59ec42222546aa1aafaff622d9a`; `ci/media-image.json` records Linux amd64 archive/binary and build input hashes.
- Dedicated repository: public `nishilfaldu/pro-tour-task-board-demo-20260924-122700`, ID `1386476546`, owner `nishilfaldu` (ID `63477134`); the supplied token authenticates with `repo` scope and repository push/admin permissions.
- [Bootstrap PR #1](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1): head `52a22b77799cbdb8eb57e4fb5c39454d4d01e5ae`, original base `7d8db9d5a6807e9ba235bb6d2d02d323c65355f1`. Its sole change is a synthetic preflight marker. The PR metadata continues to report that original base SHA after the default branch advances; the CI source SHA below is recorded separately.
- Exported source commit: `d9f6d579291405c75ab9497e437b8c0c801ecac4`. Workflow/default-branch commit: `c7de091bb67a8d944d21ae6301ac39d196b7c8d1`.

## Live evidence

| Evidence | Observation |
| --- | --- |
| `auth-check.json` | Task-local verified macOS CLI, only the supplied media credential, fresh config, HTTP 200 for the actual owner. Scope metadata is retained; credential values and raw user profile are not. |
| `media-preflight.json` | Local credential-gated upload and API readback passed, 23:21:23–23:21:38 UTC on 2026-09-24; cleanup verified. |
| `inline-playback.json`, `app-inline-playing.png`, `feature-inline-playing.png` | [Local upload comment](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1#issuecomment-5823898166): both native players advance to `ended` at four seconds, without error. App frame count is cumulative across repeated playback; clip frame count comes from FFprobe. |
| `ci-setup.json` | Only `GH_MEDIA_TOKEN` installed as the demo repository secret through the isolated token client. Unauthenticated private source fetch returned 404 and was replaced with the bounded public source export. |
| `ci-dispatch.json` | Successful real workflow dispatch; the immediate run-list poll was empty. `ci/run.json` supplies the subsequent completed run and job evidence. |
| `ci/run.json`, `ci/runner.json` | [Run 36073840252](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/actions/runs/36073840252), job `107880564878`, succeeded. Event is `workflow_dispatch`, not a PR event. No session containers or volumes remain. |
| `ci/media-preflight.json` | CI token upload/readback passed, 23:40:24–23:40:30 UTC, with the exact two-label/two-URL comment and verified cleanup. |
| `ci/inline-playback.json`, `ci/app-inline-playing.png`, `ci/feature-inline-playing.png` | [CI upload comment](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1#issuecomment-5824095753): two anonymous native players, both watched from zero to `ended` at four seconds, no errors. Actual synthetic pattern frames differ. |
| `ci/source-manifest.json` | The ten publicly exported files match the private implementation commit and the current local source byte-for-byte. No unrelated private files were published. |

The four original CI JSON artifacts (`media-image.json`, `media-preflight.json`, `runner.json`, `source-manifest.json`) were downloaded unchanged through the GitHub connector. ZIP artifact ID `10839220770` has SHA-256 `faed08178369fc25cd1961effaf82a9130c908025a79e576df49b58110eb02e9`, verified against GitHub's artifact digest before extraction. It expires 2026-10-24; these committed copies retain the proof. Browser screenshots/events and run metadata were collected separately. No signed download/media URLs, browser profile, MP4s, release binaries, or raw tokens are committed.

Both uploader runs allowed only `api.github.com` and `uploads.github.com`. Credential-free probes denied TypeSafe, Cursor, loopback, and malformed/IPv6 destinations; actual CLI telemetry to `cafe.github.com` was also denied. The client has only `GH_TOKEN`, a fresh configuration, and no other model/helper settings. Each MP4 is H.264/yuv420p, 640×360, four seconds, and 96 frames; FFmpeg decoded both fully before upload. Different architecture/package builds produced different bytes, whose actual hashes and sizes are preserved. This is bounded uploader evidence, not the complete P06 app/build/browser isolation proof.

## Tests and integration issues

`checks.txt` records the repository standard command, exit 0: **274 product + 27 imported + 7 visualizer = 308 passing tests**, plus Ruff, imported skill validation, compilation of 32 imported Python files, and Git whitespace checks. The 24 new media cases test archive integrity/limited extraction, exact comment shape, environment/config isolation, credential-safe errors, bounds, key parsing, and uploader container policy. These are mock/local tests, independent of the real uploads above. No model was called this visit.

`workflow-check.json` records YAML parsing, all shell-step syntax checks, compilation of embedded Python, exact installed-workflow equality, and exported-source hash equality. The successful actual CI run is the runtime check. `secret-scan-final.json` checks the three actual credential values against this visit's changed files without retaining those values.

The first workflow push using the normal configured Git OAuth credential was rejected because that credential lacks `workflow` scope. The unpublished local commit was replaced by a source-only export; the GitHub connector then committed the exact workflow on the default branch. `integration-events.json` preserves the observed rejection and resolution. No authentication failure was hidden or treated as a passing upload. The media upload itself succeeded on its first local and first CI invocation.

GitHub CLI may publish a partial attachment body if a later upload fails; this is a source-backed limitation, not an observed failure in these successful runs. P18 still needs complete-pair publication and rerun/current-head handling. The preflight's reports intentionally retain `full_pipeline_verified: false` and `inline_playback_verified: false`; the latter means playback was checked separately in the browser, not by the upload script.

See [reproduction instructions and boundary details](../../github-media.md). P05 alone is proposed complete. F1–F5 remain open for the full product, with the new upload/CI evidence narrowing F2 and F4. No product question or technical disagreement is pending.
