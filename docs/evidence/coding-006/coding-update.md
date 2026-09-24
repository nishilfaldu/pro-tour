# Coding update — visit 006

Status: **P05 implemented and ready for independent validation; full product incomplete.** This visit selected the unchecked GitHub media prerequisite. Decisions were read before acting. The authoritative review/005 plan was not edited and no checkbox was changed. P01/P03/P04 remain accepted; only P05 is proposed complete. No product ambiguity or question is pending.

Implementation commit: `8ddf41af6c8d6c7cf4c58dcf658c218f3c5a7d09` on `exp/astra-xhigh-author-grok47-xhigh-reviewer`, pushed before the CI run. The workflow example, CI evidence, documentation, and this handoff are committed and pushed in the follow-up on the same branch. No imported skills or unrelated files changed. Root/ancestor AGENTS.md and the root semantic index remain absent. The chrome-debug skill supplied the browser-verification workflow; no model was invoked this visit.

## Change and live result

The new trusted media client installs checksum-pinned GitHub CLI 2.101.0, selects only `GH_MEDIA_TOKEN`, maps it to `GH_TOKEN`, and excludes ambient login/configuration. The system CLI remains 2.94.0 and is not used for uploads. `MediaSession` confines the client to an unprivileged, read-only, networkless container with a private socket to a secret-free gateway allowing only `api.github.com` and `uploads.github.com`. Provider credentials and helper settings are absent. Actual positive/negative gateway probes precede token access. No PR code runs in this preflight.

The credential-free image generates two distinct synthetic four-second MP4s. FFprobe verifies H.264/yuv420p, 640×360 and 96 frames; FFmpeg fully decodes each. The checker uploads both with repeated `gh pr comment --attach` flags, reads back the comment using the same media token, verifies the authenticated author and exactly two brief labels/two canonical attachment URLs, records sanitized evidence, and verifies cleanup. The CLI archive verifier extracts only the expected executable after matching its fixed SHA-256.

The supplied media token created the dedicated public repository [nishilfaldu/pro-tour-task-board-demo-20260924-122700](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700), repository ID `1386476546`, owner `nishilfaldu`, with push/admin access. [Bootstrap PR #1](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1) has head `52a22b77799cbdb8eb57e4fb5c39454d4d01e5ae` and only a preflight marker. The task-board baseline and real status-filter feature PR remain unimplemented.

Both real uploads passed on their first invocation:

| Run | Source/runtime | Upload and observed playback |
| --- | --- | --- |
| Local | Linux arm64 Docker image `sha256:85b8dbec4836e39213941d0d59db129bc4a1cc2fea29d9fc45cd955e35c7609b` | [Comment 5823898166](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1#issuecomment-5823898166), two genuine GitHub inline players, both watched through four seconds to `ended`. |
| GitHub Actions | [Successful run 36073840252](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/actions/runs/36073840252), `ubuntu-24.04` x86_64, trusted demo commit `c7de091bb67a8d944d21ae6301ac39d196b7c8d1`; image `sha256:fc209f86512d0ff1853f8c6b52104f75a4b4a59ec42222546aa1aafaff622d9a` | [Comment 5824095753](https://github.com/nishilfaldu/pro-tour-task-board-demo-20260924-122700/pull/1#issuecomment-5824095753), two new inline players, both watched from zero to `ended`, no media errors. |

Playback used a fresh anonymous Chrome profile/context, with no supplied credentials or authenticated cookies. Screenshots show different animated patterns; event records show actual playback progress and completion. Signed CDN query strings were excluded. These are upload fixtures, not app/feature acceptance tours. The checker's `inline_playback_verified: false` correctly leaves playback to this separate browser evidence, and `full_pipeline_verified` stays false.

The CI job is **workflow_dispatch**, not the required automatic PR trigger. Its only credential-bearing step passes the media token to the isolated uploader. The first source fetch showed the implementation repository is private (unauthenticated HTTP 404), so exactly ten newly authored preflight source files were exported to the public demo, with implementation commit and per-file SHA-256 values. CI verifies the exact downloaded demo revision and those hashes before execution; unrelated private source was not exported. The normal Git OAuth credential lacked `workflow` scope and rejected the first workflow push. The installed GitHub connector then committed the exact workflow file successfully. This setup credential was not used for video uploads. The rejection and resolution are preserved in the evidence; no new permission or credential was requested.

## Verification and limits

[Visit evidence](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-006/README.md) contains release/source/image digests, actual token authentication metadata, repository permissions, local upload/readback, browser screenshots/events, and original CI JSON artifacts. Artifact ZIP SHA-256 `faed08178369fc25cd1961effaf82a9130c908025a79e576df49b58110eb02e9` was checked against GitHub's reported digest before extraction. The four committed CI JSON copies preserve evidence after GitHub's 30-day artifact retention. Containers and volumes were removed locally and in CI.

The actual upload egress was limited to API/upload hosts. Probes denied TypeSafe, Cursor, loopback, and IPv6/private-address attempts; `cafe.github.com` telemetry was denied as well. The existing proxy unit tests cover DNS/private-address and destination-bypass rejection. These observations establish the uploader prerequisite, not the future PR-controlled install/build/start and browser isolation on Actions. The image's base and CLI are pinned; Debian package versions are not snapshot-pinned, so image and fixture hashes are recorded per actual build and are not claimed byte-reproducible across architectures.

`UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked python scripts/check.py` exited 0: **274 product + 27 imported + 7 visualizer = 308 passing tests**, plus Ruff, imported skill validation, compilation of 32 imported Python files, and Git whitespace checks. The 24 new media tests cover the important trust and publication-shape checks. No model is called by these tests. After adding the workflow, its YAML, all four shell steps, three embedded Python blocks, installed-file equality, and all ten exported source hashes were checked; the actual CI run then provided runtime proof. No product code changed after the standard test run.

Pinned CLI source shows that an attachment failure can leave a partial comment body when another attachment succeeds. The preflight reports that possibility on error and requires a complete pair on success. It is not a production atomic/idempotent publisher. P18 must still implement complete-pair publication, current-head checks, and safe reruns. [GitHub media documentation](/Users/happyhome/Desktop/pro-tour/docs/github-media.md) links the exact upstream implementation and gives reproducible build/upload commands. No release asset, workflow artifact, external hosting, browser-cookie upload, or manual upload substitutes for the inline videos.

## Every open review finding

| Finding | Response and remaining work |
| --- | --- |
| **F1 — No automatic PR-to-videos run** | Accepted, still open. A real bootstrap PR and manually dispatched media-only CI workflow now exist. They do not implement the task board, real status-filter feature PR, automatic PR event, exact PR app startup, or two product tours. R2/R4/R14/R17–R19 remain incomplete. |
| **F2 — No playable PR comment** | The concrete missing upload prerequisite changed: the actual GH_MEDIA_TOKEN uploaded two pairs into real inline comments; both pairs played in the PR conversation with only brief labels and videos in each body. The finding remains open for actual app/feature recordings and the complete-pair production publisher. P05 completion is proposed, not R3/R11/R15 end-to-end acceptance. |
| **F3 — Product tours are not recorded** | Accepted, still open. Review/005's P04 acceptance is retained without rerunning or altering the Grok adapter. No Jev product action loop or independent screen recorder was added. FFmpeg-generated upload fixtures do not satisfy R7/R8 or any journey coverage. |
| **F4 — PR-controlled execution is not fully isolated** | Accepted, still open. Exact GitHub upload destinations and a restricted uploader now work on a real Actions runner, addressing those two missing pieces. No PR-controlled install/build/start or browser ran there; P06 and complete-pipeline adversarial checks remain required. |
| **F5 — Finished branch is not delivered** | Accepted, still open. This implementation slice, CI workflow, evidence, and handoff are committed and pushed on the named branch. The product is unfinished; R1/R16 are not declared complete. |

No technical objection is rejected. All unfinished portions of F1–F5 are preserved. O1–O3 remain resolved at the plan level. No other unchecked plan item is proposed complete.

## Handoff

Route to **validation**. Run the standard suite, inspect the new media tests and source boundary, compare the installed workflow/exported hashes to the CI artifacts, and independently verify the inline players at the two comment URLs. The [media instructions](/Users/happyhome/Desktop/pro-tour/docs/github-media.md) give an exact live recheck command using the existing arm64 image, supplied `.env.local`, PR #1, and a fresh report path; a rerun intentionally adds another clearly labeled preflight pair. P05 can be assessed independently of the still-missing automatic pipeline. Continue P06/P07 and the remaining product work after review. The authoritative plan is unchanged.
