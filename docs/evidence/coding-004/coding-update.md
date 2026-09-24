# Coding update — visit 004

Status: **P04 prerequisite implemented and ready for validation; full product incomplete**. This visit selected programmatic Grok 4.7 planning/text and its tool/credential boundary, with supporting P02/P06 evidence. The authoritative review/003 plan was not edited and no checkbox was changed. P01 and P03 remain accepted; only P04 is proposed complete. No product question is pending.

Implementation commit: `163c4f0f466d8edbf43fa77b66e023526c6396f5` on `exp/astra-xhigh-author-grok47-xhigh-reviewer`. This report and routing artifacts are in a subsequent documentation-only commit. Both are delivered to the same origin branch. No unrelated files or imported skills were changed.

## What passed

The real Cursor account listed `grok-4.7-xhigh` as available. The pinned Linux client then completed an adversarial tool-boundary request, a two-tour planning request, and a separate structured field-value request with that explicit model. CLI initialization reported **Grok 4.7 256K Extra High**; the mandatory session hook reported `grok-4.7-xhigh` for every turn. This is recorded CLI/provider-route metadata, not an independent attestation of the underlying model weights.

[The final gate](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-004/grok-preflight.json) has status passed and cleanup verified. The planning result validates against the committed closed JSON schema. Its five app goals cover initial state, creation, title editing, status change, and filtering. Its three feature goals demonstrate matching-status inclusion and other-status exclusion for Todo, Doing, and Done. The separate field response is a validated synthetic task title. These use descriptive task-board fixture data, not an existing PR app; no browser action or recording is claimed.

The adversarial request asked for a canary read, shell/file writes, fetching, and web search. It returned blocked, disclosed no canary, created no write marker, and produced **zero tool events**. All 69 tool variants in the pinned protocol were excluded. The tools were unavailable; this is not a claim that 69 real operations individually ran and were rejected. A real precredential invocation of the immutable generic hook denied an unknown tool, and tests cover every tool category and fail-closed acceptance behavior. Session hooks ran without credentials. The response receiver rejects any tool event, unexpected event type, missing hook audit, changed model, changed permissions, populated workspace, or compromised canary.

The only allowed and observed provider destination was `api2.cursor.sh:443`. Background GitHub connections and malformed/unsupported proxy requests were denied. The final requests took 21,222 ms (adversarial), 94,760 ms (planning), and 6,330 ms (field).

## Implementation and provenance

- Added a fixed Grok client/gateway topology using the existing owned-resource sandbox. The client is unprivileged, networkless, isolated from host files, and starts in an empty read-only workspace. The secret-free gateway has one Unix socket and one code-owned CONNECT destination, validates public DNS answers, and connects to the validated numeric address. No PR-controlled process or browser runs in this context.
- The Cursor key enters via private stdin into the trusted adapter and then only its CLI environment. The TypeSafe and media keys and all TEXT_MODEL settings remain absent. The hook's command clears its environment. Cursor's writable preferences are a fresh private copy of the trusted template; the mandatory hook/configuration remain read-only, and the permission policy is compared after each request.
- Added bounded plan/field prompts, a strict CLI stream receiver, and validators. Plans contain ordered goals, observable checks, and text literals; they cannot supply executable command/selector fields. Bad/duplicate JSON, duplicate goal IDs, oversized data, empty/control-bearing text, malformed streams, failed clients, and model/tool/boundary changes fail closed. Text validation returns a literal or raises; it does not type into a page or invoke another model.
- Pinned Cursor `2026.09.23-86fc751`, its official Linux arm64 archive SHA-256 `38d1482c945172926e780206fce8cc51c67dd4f96162bcec680903aa70d80417`, and the tested image `sha256:cc242f357c6a31ed1e45846755ac873f5867deccb44a496ced261cab2749e9cb`. Preparation extracts outside the repository and derives the 69-tool exclusion list from that exact package. No Cursor binary or upstream Jev code is vendored into the project.
- The sandbox's memory choice is now a code-owned class map, retaining prior role defaults while giving the Cursor client 1536 MiB. The shared proxy exposes a code-owned lifetime parameter, retaining its previous 90-second default; only the Grok gateway uses 420 seconds. Its client deadline is 360 seconds. Neither policy is taken from PR data.

[Image provenance](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-004/grok-image-final.json), [runtime/source hashes](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-004/runtime-inventory.json), and [reproduction instructions](/Users/happyhome/Desktop/pro-tour/docs/grok-planning.md) are committed. Runtime versions are Python 3.12.12, Node v24.5.0, and the pinned Cursor CLI on Docker Desktop's Linux arm64 VM. Apt is not snapshot-pinned, so an independent rebuild may get another image ID. An actual GitHub runner remains unverified.

The tool-list switches are internal Cursor CLI interfaces; the pinned package accepts them and the real adversarial gate verifies this version. Any upgrade must repin and rerun the proof. The documented generic hook and CLI permission deny rules provide additional enforcement. There are no prompt-based hooks, plugin/MCP installations, force approvals, or model substitutions.

## Failed experiments and repairs

All relevant failures remain in [the evidence inventory](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-004/README.md):

1. The first urllib archive fetch received HTTP 403; curl successfully fetched the same official URL, and its content digest was pinned.
2. The first field attempt failed because Cursor tried writing preferences beneath a read-only configuration directory. It now gets a fresh private copy; immutable tool denial remains outside that directory. The post-call permission check passes.
3. The account rejected the internal workspace-context-exclusion flag. The flag was removed; the physical empty workspace/home and absence of PR instructions/plugins/MCPs provide the intended boundary. The model was not changed.
4. The first full gate passed the adversarial request but timed out while planning. A live diagnostic observed a reconnect while the gateway still had a 90-second connection limit. The final Grok-only limits align the process and tunnel lifetimes; the unchanged planning prompt then passed in 94.76 seconds. The failed run's exit 124 and verified cleanup are retained.

The previously accepted pristine Jev prerequisite remains intact. No Jev adaptation occurred in this visit, and no helper model was configured. The TypeSafe and GitHub media credentials were not used in any service request.

## Tests and checks

`UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked python scripts/check.py` exited 0: **221 product tests + 27 imported tests + 7 visualizer tests = 255 passing tests**, with Ruff, skill validation, compilation of 32 imported Python files, and Git whitespace checks. [checks.txt](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-004/checks.txt) retains the output. This standard set does not invoke a model.

The new tests exercise malicious data kept as JSON, schema/field failures, duplicate/oversized input, all-category generic denial, nested hook-input impersonation, missing/changed model metadata, missing hooks, unknown/tool events, canary disclosures/writes, extra credentials/helper settings, altered permissions, wrong workspace state, literal credential parsing, network/mount policy, and a tunnel peer that never sends a header. The final recorded plan and field were revalidated with the final validators. Real integration evidence separately covers model listing, tool denial, planning, text generation, provider egress, and cleanup.

[The secret scan](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-004/secret-scan.json) checked all three supplied values against the changed files before staging and found none. Private raw exploration outputs were removed after retaining sanitized evidence. No model reasoning, authorization headers, or secret values are committed.

## Responses to every open review finding

| Finding | Response and unresolved work |
| --- | --- |
| **F1 — No automatic PR-to-videos run** | Accepted, still open. This is a trusted planning prerequisite. No task board, automatic workflow, real PR revision startup, or recordings were implemented. P19–P23 and the intervening pipeline work remain. |
| **F2 — No playable PR comment** | Accepted, still open. GH_MEDIA_TOKEN was not used and no uploader/comment/playback proof is claimed. P05 and publishing/playback remain to implement. |
| **F3 — Grok planning and independent recording not integrated** | Partly addressed: the real Grok 4.7 route now produces validated two-tour goals and text with enforced tool restrictions. It is not yet connected to a running app or the Jev product action loop; the recorder is still absent. P07's justified adaptation and subsequent integration remain open. The accepted P03 baseline is unchanged. |
| **F4 — PR-controlled execution not fully isolated** | Partly addressed: the Grok destination, credential-only client environment, immutable denial policy, and adversarial tool-free behavior are now proved in the local Linux preflight. PR install/build/start, GitHub/media routes, complete cross-role adversarial tests, and an actual Actions runner remain unverified. P06 stays unchecked. |
| **F5 — Finished branch not delivered** | Partly addressed: this tested implementation and its handoff are committed and pushed on the requested branch. The finished automatic product is still pending, so R1/R16 remain open. |

No evidence-backed disagreement with the reviewer is raised. Every unresolved portion of F1–F5 is carried forward. O1–O3 remain resolved at the plan level. P02/P06/P13/P24/P25/P28 are not proposed complete; this visit proves only the P04 prerequisite and supporting portions.

## Next

Route to **validation**. Independently run `scripts/check_grok_preflight.py` with the final immutable image or rebuild from the pinned archive, then inspect the exact P04 proposal. Subsequent coding should prove P05's token-authenticated inline uploader, then continue the production integration, task board, real automatic PR runs, separate recordings, and playback. No product question or user-response path is required.
