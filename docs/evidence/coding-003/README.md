# Coding visit 003 evidence

This visit completes the pristine upstream Jev prerequisite (proposed P03), with supporting credential/network evidence for portions of P02/P06. The full product remains incomplete.

| Evidence | Result |
| --- | --- |
| `pristine-image.json` | Upstream commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, archive SHA-256 `3bed2171ef064135c5192bad354b4a187f71ec397639d5ab676d02be37822211`, all 40 source hashes, locked dependency-export hash, external baseline path, final image ID. |
| `pristine-example.json` | Final image `sha256:a26c2e3578d44b37234d624d98909ed9a95af3568b3655ab1d107f684541fdd3`; real authentication; requested `jev-latest`, returned `jev-1.13.0`; one Learn more click, correct IANA destination, `done`, no typing, unchanged source, cleanup verified. |
| `boundary-attempt-01.json` | Credential-free real browser/harness gate passed on the preceding image. Browser reached the fixture and was denied TypeSafe/GitHub/helper/private/IPv6 targets; controller reached TypeSafe with HTTP 404 on an unauthenticated root-path request and was denied other routes. |
| `boundary-negative-control.json` | Intentionally wrong fixture marker: exit 1 before credential-file reading; `real_credentials_used: false`; cleanup verified. |
| `runtime-inventory.json` | Tested image's Python/Chromium/dependency versions, Linux Docker Desktop runner details, and support-source hashes. |
| `isolation-regression.json` | Earlier offline app/browser/controller gate still passes after the policy-map refactor, including its lifecycle failure probes and cleanup. |
| `checks.txt` | Standard repository set: 163 product tests, 27 imported tests, 7 visualizer tests; Ruff, skill validation, 32 imported compilation checks, and whitespace checks pass. No model is called by these tests. |

`pristine-image-attempt-01.json` and `pristine-image-attempt-02.json` retain earlier successful builds. `pristine-example-attempt-01.json` retains the first successful real Jev run, before adding explicit launch-environment/seccomp-count evidence. In that first run, an initial DONE prediction met upstream's stale-page check and was refreshed; no extra click occurred. The final run used two model calls (CLICK, DONE), one executed click, and 854 ms reported by the example. The preparation scripts never altered upstream source.

The first targeted unit-test run had one fixture failure: macOS's Unix-socket path limit rejected pytest's long temporary path. The test now uses a short disposable `/tmp` path; all 49 targeted proxy/preflight/sandbox tests passed before the full standard set. No security policy was relaxed for that correction.

Reproduction commands and the exact boundary are in [the preflight guide](../../pristine-jev.md). No real Grok or GitHub credential was used in this visit. No PR-controlled install/build/start, Actions runner, task-board PR, recorder, video upload, or playback was exercised.
