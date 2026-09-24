# Coding visit 002 evidence

This visit advances P02/P06/P24/P25 with a real Linux container and Chromium isolation proof. It does not complete any additional plan checkbox or close the full-product review findings. The authoritative plan is `agents/review/001/updated-plan.md`; P01 was already accepted. The updated decisions explicitly authorize committing the intentional `.gitignore` `.env.*` rule, which is retained in this visit.

## Observed runs

| Artifact | Outcome | Interpretation |
| --- | --- | --- |
| `isolation-attempt-01.json` | Failed; cleanup verified | The initial gate rejected LinuxKit's inactive tunnel interface names. No configured external route or credential access was observed. This remains failed evidence. |
| `isolation-attempt-02.json` | Passed; cleanup verified | Address/route checks distinguish inactive tunnels from usable interfaces. Real Chromium reached the app and denied forbidden endpoints. |
| `isolation-final.json` | Passed; cleanup verified | Final gate additionally exercised a real command timeout and injected cancellation, each removing all owned resources. |
| `isolation-negative-control.json` | Expected failure; cleanup verified | The same real page was reached, but the deliberately wrong required marker failed verification. It is not a passing acceptance run. |
| `prerequisites.json` | Inventory saved | Docker now reports a live Linux daemon. All three credential assignments remain present but unauthenticated; no actual key was injected into the fixture. |
| `image.json`, `image-packages.tsv` | Recorded | Immutable local image/base digest, build-input hashes, architecture, and installed OS package versions. This image is not published or proven on GitHub runners. |
| `checks.log` | Passed | 125 product tests, 27 imported tests, 7 existing visualizer tests; Ruff lint/format, imported skill validation, 32 imported Python compilations, and Git whitespace checks. |
| `verification.json` | Recorded | Commands, exit codes, timestamps, source/input hashes, preserved-source checks, and scope limitations. |

The successful runtime used Docker 29.5.3, LinuxKit kernel 6.12.76, Linux aarch64, and Chromium 153.0.8010.52. App, browser, and controller had different network/PID/mount namespace IDs, UID 10000, zero effective capabilities, no-new-privileges, and read-only roots. Only the controller could see the three fresh synthetic credentials in `/proc` or read its canary file. Its private listener was a positive control, not an absent destination. The browser's positive app request succeeded while its controller, redirect, metadata, TypeSafe, GitHub, candidate Cursor, IPv4, and IPv6 requests failed. No actual provider or upload request succeeded or was counted as authenticated.

The fixture controller is deliberately offline. Positive provider egress and production client separation are not implemented. App phase probes launch fresh diagnostics in the app namespace; they are not a real PR checkout or dependency build. See [isolation.md](../../isolation.md) for reproduction and limits, and [coding-update.md](coding-update.md) for the response to each F1–F5 finding.

Read-only upstream inspection observed Jev candidate commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`. Its `Browser` calls `ensure_daemon()` before creating a CDP target. The locked browser-harness 0.1.13 wheel SHA-256 is `2491459e4bfc0ee8aea22dc6c4680fc0f791b7ba553446323c50d2883449d769`; its admin module recognizes `BU_CDP_WS`/`BU_CDP_URL` and loads `.env` files on import. The future pristine example must therefore use clean workspaces and a prestarted, isolated harness. This was source inspection only: no Jev source archive was acquired for execution, no integration fork/refactor occurred, and no pristine-example pass is claimed.

The complete automatic PR-to-videos run, task-board feature PR, Jev/Grok providers, independent recordings, GH_MEDIA_TOKEN uploads, watched inline players, final review, and finished-product delivery remain open.
