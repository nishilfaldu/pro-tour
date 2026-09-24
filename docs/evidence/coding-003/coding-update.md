# Coding update — visit 003

Status: **partial implementation; ready for validation of this slice**. The selected work was P03, the pristine Jev prerequisite, plus its necessary source/credential/egress evidence. P03 is proposed complete. The authoritative plan was not edited and no checkbox was changed. No product ambiguity or question is pending.

Implementation commit: `3c11100559dcb8262b8bebf70403b16f2d17e5ee` on `exp/astra-xhigh-author-grok47-xhigh-reviewer`. This report and routing artifacts are in a subsequent documentation-only handoff commit. Both commits are delivered to the same origin branch; the overall product is still incomplete.

## Result

The unchanged `browser-use/jev-ultrafast` example at commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` ran successfully against the public click-only Example Domain fixture, before any integration clone, fork, vendor copy, or upstream source change. Acquisition and locked dependency installation were solely for the external pristine baseline. All 40 upstream files matched the recorded manifest before and after execution. The source archive hash is `3bed2171ef064135c5192bad354b4a187f71ec397639d5ab676d02be37822211`.

The final run requested `jev-latest` and returned `jev-1.13.0`. Jev selected CLICK on Learn more, then DONE. The history records one actual click, zero typing/helper calls, and `https://www.iana.org/help/example-domains`, titled Example Domains. Exit status was 0, the example reported 854 ms, and every owned container/volume was removed. The successful provider responses, model identity, action history, stdout, exact command, and pre/post source comparison are in [pristine-example.json](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-003/pristine-example.json). This was a real provider call, not a mocked selector.

The final trusted image is `sha256:a26c2e3578d44b37234d624d98909ed9a95af3568b3655ab1d107f684541fdd3`. [pristine-image.json](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-003/pristine-image.json) records its external source location, file digests, and hashed lock export. [runtime-inventory.json](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-003/runtime-inventory.json) records Python 3.12.12, browser-harness 0.1.13, Chromium 153.0.8010.52, installed dependency versions, support-source hashes, and Docker 29.5.3 on the local arm64 LinuxKit VM. Apt is not snapshot-pinned; independent rebuilds may have different image IDs.

## Changes and boundary evidence

- Added a fixed preflight-only topology: a networkless browser and controller use separate Unix sockets to a secret-free CONNECT gateway. Browser egress allows only the three public fixture hosts on 443; controller egress allows only api.typesafe.ai:443. All DNS answers must be public, and connection uses the validated numeric address. Direct IPv4/IPv6/private/metadata traffic and cross-role proxy destinations are denied. No TCP listener or host mount exposes the provider path to the browser.
- Started Chromium and the pinned upstream harness with clean environments and a fresh profile before reading the actual key. Supported BU_CDP_URL/BH_RUNTIME_DIR configuration lets the unchanged example reuse the daemon. A stacked seccomp filter denies process creation before credential injection reaches the example. The real missing-harness probe demonstrates that upstream cannot spawn a credential-inheriting fallback.
- Passed synthetic process/file canary tests, successful browser fixture traffic, successful controller TLS traffic to TypeSafe, denied browser TypeSafe/GitHub/helper traffic, and denied controller fixture/GitHub/helper traffic. The actual example launch recorded only TYPESAFE_API_KEY among the three named credentials, no TEXT_MODEL settings, and two seccomp filters. The key is supplied only over private stdin to the trusted loader and then to the example's environment; it never enters Docker configured env, argv, browser/harness/gateway, or image layers. The canary processes use synthetic values under all three names and are distinguished from the actual example environment.
- Added a passive Python startup profiler to retain whitelisted function-return evidence. It does not patch or replace upstream functions, alter choices, inject actions, or change examples/run.py. The original selector, target validation, freshness checks, and budgets remain unchanged. The first successful run retained an upstream stale-page retry before DONE; the final run needed no retry. No DeepSeek or other typing model was invoked.
- Refactored the existing sandbox's hardcoded policy maps so this fixed preflight can reuse its owned-resource cleanup. Its existing offline app/browser/controller policy and real regression gate still pass. This does not add arbitrary configuration-driven mounts or egress.

See [the reproduction guide](/Users/happyhome/Desktop/pro-tour/docs/pristine-jev.md) and [evidence inventory](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-003/README.md). The browser uses Chromium --no-sandbox inside the restricted container, as the earlier fixture did; this proves the container boundary rather than the renderer sandbox. The gateway is a preflight fixture, not the finished policy for arbitrary PR code.

## Tests

The standard `UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked python scripts/check.py` exited 0: 163 product tests, 27 imported tests, and 7 visualizer tests (197 total), plus Ruff, skill validation, compilation of 32 imported Python files, and whitespace checks. [checks.txt](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-003/checks.txt) retains the output. The set does not invoke a model.

The 49 focused proxy/preflight/sandbox tests passed. They cover role separation, malformed CONNECT authorities, alternate ports, provider/host/IP bypasses, mixed DNS answers containing private or reserved IPv4/IPv6, opaque relay behavior, literal credential parsing, and lifecycle cleanup. An initial test failed because pytest's long macOS temporary path exceeded the Unix-socket path limit; using a short disposable /tmp path corrected the fixture without changing runtime policy.

The real credential-free preflight passed, and its deliberately wrong fixture marker exited 1 before credential-file reading with cleanup verified. The real final-image authenticated example passed. The earlier `check_isolation.py` gate also passed again, including timeout/cancellation cleanup; see [isolation-regression.json](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-003/isolation-regression.json). All three supplied secret values were checked against the changed files before staging; no value was found. No actual Cursor or GitHub media credential was used.

## Responses to every open review finding

| Finding | Response and remaining work |
| --- | --- |
| **F1 — No automatic PR-to-videos run** | Accepted, still open. This visit adds a prerequisite check, not an automatic workflow or task board. The sample app, actual feature/docs-only PRs, configured PR install/build/start, and two-tour automatic event path remain to implement. |
| **F2 — No playable PR comment** | Accepted, still open. No uploader, GH_MEDIA_TOKEN operation, two-video comment, or playback observation is claimed. P05 and the publishing/playback work remain. |
| **F3 — Jev, Grok 4.7, and independent recording absent** | Partly addressed. The specific pristine-example objection is resolved by the unchanged-source, real TypeSafe-selected click evidence above. No upstream adaptation preceded it. Grok 4.7 planning/tool denial, any justified text callback adaptation, production Jev integration, and the independent recorder remain open. |
| **F4 — PR-controlled execution not fully isolated** | Partly addressed. This visit adds proven positive TypeSafe/controller egress, denied browser provider access, and safe prestarted-harness reuse with a real no-spawn fallback test. It still does not execute PR-controlled dependencies/build/start, prove Grok/GitHub destinations, or run on GitHub Actions. P06 remains unchecked. |
| **F5 — Finished branch not delivered** | Partly addressed. The tested implementation and handoff are committed and pushed on the requested experiment branch. They deliver this slice only; finished-product delivery remains open until the workflow, tours, uploads, playback, and review complete. |

There is no evidence-backed disagreement with the reviewer. All unresolved portions of F1–F5 are preserved for the next round. O1–O3 remain resolved in the plan, with unfinished runtime obligations carried by F3/F4. P02/P06/P24/P25/P28 remain incomplete; only P03 is proposed for checking.

## Next

Route to **validation**. Independently check P03 using the immutable image, evidence, and reproduction scripts. Subsequent coding should tackle P04's real tool-restricted Grok 4.7 route and P05's pinned token-authenticated inline uploader, then the production integration and automatic task-board flow. The user rulings, model restrictions, pristine-first order, and secret boundary remain in force.
