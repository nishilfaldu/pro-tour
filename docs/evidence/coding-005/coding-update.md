# Coding update — visit 005

Status: **P04 reproducibility fix implemented and ready for independent validation; full product incomplete.** This visit selected the unchecked P04 prerequisite and review/004's specific adversarial-response failure. Decisions were read first. The authoritative plan was not edited and no checkbox was changed. P01/P03 remain accepted; only P04 is proposed for completion again. No product ambiguity or question is pending.

Implementation commit: `dd110431bcf8d0147f66003af96d0d95348bce79` on `exp/astra-xhigh-author-grok47-xhigh-reviewer`. This handoff is delivered in a subsequent documentation-only commit on the same branch. No imported skills or unrelated files were changed. Root/ancestor guidance and root semantic index remain absent.

## Review failure, diagnosis, and fix

The two review failures are accepted and retained unchanged in [the evidence directory](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-005/README.md). An unchanged-checker live reproduction also exited 1 at adversarial with `Invalid preflight data`. Its final answer contained a prose preface immediately followed by the correct blocked-tools JSON. A second targeted live probe showed that both occupy one assistant message, eliminating “select the last message” as a fix. Both had the required model and zero tool events. The old bare `json.loads` call failed before planning.

The diagnosing-bugs skill was used to capture the failure and build a fast regression at the real checker orchestration seam. Before the fix, replaying that actual final answer failed in 0.06 seconds with the same error. The captured final answers contain synthetic material only; raw reasoning and stderr were not retained. Cursor's [output-format documentation](https://cursor.com/docs/cli/reference/output-format) describes terminal results as aggregated assistant text, which does not guarantee bare model JSON.

The checker now uses the shared `request_document` adapter for adversarial, plan, and field stages. It validates client success, exact model identity, tool/hook events, canaries, credential assignment, empty workspace, and unchanged permissions **before** considering document repair. Only a JSON/schema error may trigger one additional request through the same pinned Grok route. Original task and rejected final text are bounded JSON data in the repair prompt. The repair must return a strictly valid document; the code neither extracts JSON substrings nor inserts a hardcoded passing answer.

Every attempt remains in the report with its status, specific error, response byte length/hash, model/usage metadata, and boundary checks. A successful repair cannot erase an original boundary failure. Tool use, changed model, compromised canaries/credentials/permissions, provider failure, oversized repair input, or a second bad document stops the gate. A parsed adversarial report claiming available tools or unexpected audit data is also rejected without repair. Malformed field text produces no usable typing value.

The original adversarial challenge, Cursor version, `grok-4.7-xhigh`, image `sha256:cc242f357c6a31ed1e45846755ac873f5867deccb44a496ced261cab2749e9cb`, 69-tool exclusion list, immutable hook, and provider allowlist are unchanged. No new model or helper was configured.

## Runtime and standard validation

Three consecutive complete live gates exited 0 on the pinned image. Each reproduced the non-JSON adversarial reply, retained that invalid attempt, and obtained a valid blocked-tools document through exactly one same-model repair. Planning and field generation passed on their first attempts in every run. The three plans contain five app goals each and three, four, and four feature goals; they cover the synthetic fixture's main journeys and positive/negative status-filter cases. They are planning evidence, not verified UI journeys.

[Repeated-run evidence](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-005/repeated-runs.json) revalidates all nine final documents and all 12 request audits. Each attempt reports the required CLI model identity, zero tool events, intact canaries, only CURSOR_API_KEY, no TEXT_MODEL settings, unchanged permissions, and an empty workspace. The only allowed provider destination remains `api2.cursor.sh:443`; GitHub attempts were denied. All three cleanups were verified, and no owned containers or volumes remain. These are local Linux arm64 Docker Desktop runs; an Actions runner remains unverified. Three passes are bounded evidence, not a guarantee of future provider availability or format compliance.

`UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked python scripts/check.py` exited 0: **250 product + 27 imported + 7 visualizer tests = 284 passing tests**, plus Ruff, skill validation, compilation of 32 imported Python files, and Git whitespace checks. [checks.txt](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-005/checks.txt) records the standard set. The 29 new tests cover captured-response repair, retry exhaustion, strict plan/field output, unsafe first/repair attempts, claimed tool availability, bounded repair data, evidence retention, and cleanup. No model is called by these tests.

[Source/image inventory](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-005/runtime-inventory.json) records final host-source hashes and unchanged image identity. [The secret scan](/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-005/secret-scan.json) found none of the three actual credential values in the changed source, tests, docs, or evidence. Debug probes were external stdin scripts; no debug hooks or instrumentation remain in product code.

## Every open review finding

| Finding | Response and remaining work |
| --- | --- |
| **F1 — No automatic PR-to-videos run** | Accepted, still open. This visit fixes the planning prerequisite. Task board, Actions workflow, exact PR startup, real PRs, and recordings remain to implement. |
| **F2 — No playable PR comment** | Accepted, still open. GH_MEDIA_TOKEN was not used in a service request; no uploader, media comment, or playback proof exists yet. P05 is the next integration prerequisite after P04 acceptance. |
| **F3 — Grok planning is not reproducible, and recording is absent** | Specific parser failure reproduced and changed as above, with a failing-before/passing-after regression and three consecutive full real gates. The old successful run is not used to dismiss review's two failures. New evidence is offered for independent P04 acceptance. Jev's product action loop and independent recorder are still absent, so the broader finding remains open. |
| **F4 — PR-controlled execution is not fully isolated** | Accepted, still open. All existing Grok checks apply to both original and repair turns; this does not prove PR install/build/start, GitHub media destinations, or execution on Actions. P06 and complete pipeline adversarial checks remain. |
| **F5 — Finished branch is not delivered** | Accepted, still open. This tested slice and handoff are committed and pushed to the required branch. The full product is unfinished; R1/R16 are not declared complete. |

No technical objection is rejected. All unfinished portions of F1–F5 are preserved. O1–O3 remain resolved at the plan level. No other unchecked plan item is proposed complete.

## Handoff

Route to **validation**. Independently rerun the current `scripts/check_grok_preflight.py` against the unchanged pinned image using a new output path and `.env.local`, then inspect every original/repair audit and the P04 proposal. The standard tests and the targeted `tests/test_grok_preflight.py` also run unattended. Continue P05 and the remaining automatic pipeline after this prerequisite is accepted. The authoritative plan is unchanged.
