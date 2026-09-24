# Coding update — visit 001

Implemented and committed a coherent first slice: the trusted controller's configuration parser and read-only prerequisite/evidence tools. Route to **validation** for this slice. The full PR-to-videos product remains incomplete.

Implementation commit: `7b08fe92629f54eb51f4080fbbcf5327e939e8f4` on `exp/astra-xhigh-author-grok47-xhigh-reviewer`. A subsequent documentation commit records this handoff and the additional existing visualizer suite. No remote push was performed; finished-deliverable push and runtime-pinned demonstration remain P20/P28 work.

## Inputs and scope

Read `decisions.md` before acting and used `agents/plan-update/001/updated-plan.md` with `agents/requirements/004/requirements.md`. Critique visit 002 explicitly accepted that plan with no open objections. The decisions preserve automatic GitHub Actions, the task-board sample/real status-filter PR, and workflow-started local apps. No genuine product ambiguity arose, so no question.md was created.

No root/ancestor AGENTS.md or root docs/SEMANTIC-INDEX.md exists. The imported skills' source files were unchanged. The existing `.gitignore` addition of `.env.*` remains intact and unstaged. Frozen role metadata was read; no subagent or model was invoked, and there was no Claude or Grok Fast invocation. `agent --version` was only a local version query.

Chosen plan subset: P01 and initial P02/P08/P09/P25 work. Only P01 is proposed for checking. The other selected items still contain unimplemented requirements, explicitly listed below. The authoritative updated plan and all its checkboxes are untouched.

## Changes and evidence

- Added a Python 3.12.12 project with pinned direct dependencies, `uv.lock`, packaged JSON Schema, and a thin CLI in `src/pro_tour/`. `pro-tour validate-config` parses without executing commands and emits only a status and exact-input digest.
- Added a bounded `.pro-tour.json` contract for app root, argument-array install/build/start commands, local URL/port/readiness, literal public environment variables, app-path patterns, main journeys, fresh-browser reset instructions, and provider/action/tour deadlines and limits. The parser rejects unknown policy extensions, traversal, external or mismatched origins, credential/runtime environment names, duplicate JSON keys, invalid IDs, control characters, and excessive budgets. Parsed data is immutable; integral JSON numbers are normalized to runtime integers.
- Added the task-board baseline configuration fixture. It is explicitly labeled illustrative: `samples/task-board` does not yet exist and the commands have not started an app. No feature filter was implemented prematurely.
- Added `pro-tour doctor`, which inventories trusted installed tools using argument arrays, an explicit environment and temporary home, finite timeouts, process-group cleanup, and output restricted to version/status/hash metadata. It never launches a browser or authenticates to a provider. Optional dotenv checking does not source the file or pass its values to children. Report files are private and cannot overwrite an existing file or follow an existing output symlink.
- Added documentation separating config validation and probe environment hygiene from future authentication, sandboxing, and network enforcement. The probe helper is not suitable for executing PR code.
- Added the standard `uv run --locked python scripts/check.py` command, which runs product lint/format/tests and the imported repository's documented local gates without invoking models.

Committed evidence lives at `/Users/happyhome/Desktop/pro-tour/docs/evidence/coding-001/`: `prerequisites.json`, `verification.json`, `checks.log`, `visualizer-checks.log`, and README.md. The manifest records source/input hashes, commands, exit status, the built-wheel hash, and limitations. Executable inventory probes have UTC start/end times; the broader command manifest records collection time and explicitly notes that individual test/build timestamps were not captured.

## Tests and runtime observations

- Standard command: **PASS**, 114 product tests and 27 imported tests; Ruff lint/format, imported skill validation, compilation of 32 imported Python files, and Git whitespace checks also passed.
- Additional existing visualizer suite: **PASS**, 7 tests. Total observed tests: **148 passed**.
- Built a wheel, installed it into a separate environment with hash-checked runtime dependencies exported from `uv.lock`, and ran the installed CLI from `/tmp`. The packaged schema and example validation passed independently of the source checkout. The wheel was rebuilt and smoke-tested after the final integer-normalization change.
- The first product test run failed on an actual trailing-newline schema bypass and a macOS-injected nonsecret environment variable. Fixed the schema, added control-character regression coverage, and accounted for the observed `__CF_USER_TEXT_ENCODING` variable. No failure was counted as a successful test. Final checks.log reflects the final code.
- A scan comparing all staged implementation/evidence content against the three supplied credential values reported zero matches, without printing values.
- All three required credential assignments are present, but operational validity is **not tested**. The inherited `TEXT_MODEL*` settings are absent. Synthetic child-process tests prove that supplied key names, model-helper settings, inherited proxy configuration, and credential values are absent from the probe environment; raw probe output is omitted from reports.
- The host is macOS arm64. Docker CLI 29.5.3 is installed but no local daemon socket exists; Xvfb/unshare/nft/iptables are absent. Chromium's binary exists but was not launched. This is a real prerequisite gap, not an isolation success.
- Python/uv/Node/npm/Cursor/GitHub/FFmpeg version queries succeeded; see prerequisites.json for versions and hashes. No actual provider request, source archive acquisition, integration fork, upload, GitHub mutation, PR, recording, or playback occurred.

## Responses to review findings

No open review finding was supplied for this first coding visit. The latest critique explicitly resolved O1–O3. Their technical requirements are retained, with runtime evidence still pending:

| Prior objection | Response in this slice | Remaining proof |
| --- | --- | --- |
| O1: Jev selection requires the TypeSafe key | Accepted. Configuration cannot add `TYPESAFE_API_KEY` to public app environment; trusted probe children receive no keys. Documentation reserves it for the trusted Jev/TypeSafe client. | P02/P03/P11/P14 must prove real TypeSafe authentication, pristine action selection, and controller-only injection. No operational claim yet. |
| O2: Controller egress was incorrectly constrained | Accepted. The config origin list governs only the local app/page; it cannot select controller destinations or add provider access. The unavailable Linux daemon is recorded. | P04/P05 must identify exact provider/media routes; P06/P24 must enforce and test separate positive/negative controller/app/browser policies. No environment-only isolation claim. |
| O3: Upstream typing must not call DeepSeek | Accepted. `TEXT_MODEL`, `TEXT_MODEL_BASE_URL`, and `TEXT_MODEL_API_KEY` cannot be configured as public app variables and are absent in launched probe children. No Jev code or typing helper was added. | P03 must precede any P07 adaptation. P04/P07/P14/P25 still need the actual Grok 4.7 plan-literal/structured-text route, freshness/failure checks, and proof of zero third-model/helper calls. |

No technical objection is rejected. Provider feasibility, isolation, and upload/playback remain unresolved proof tasks, rather than a request to narrow the product.

## Remaining work and next validation

P02 is partial: local inventory/evidence is implemented; live credential checks, Linux/image provenance, and retained workflow evidence remain. P08 is partial: Python/package/CLI structure exists; action entry point, lifecycle/providers/recorder/publisher modules, and sample are pending. P09 is partial: schema/parser are implemented; authenticated base-revision loading, sandbox-only command execution, and an actually started sample are pending. P25 is partial: configuration/probe tests pass; the rest of the pipeline/failure/adversarial tests remain.

Validate this foundation with `UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked python scripts/check.py`, the supplementary visualizer test command in verification.json, and CLI rejection/smoke cases. Do not treat those results as full requirements acceptance or check P02/P08/P09/P25.

The next coding slice should establish a disposable Linux execution environment and canary-tested isolation before credentialed browser work, then prove the pristine Jev example, tool-restricted Grok 4.7 planning/text, and pinned GH_MEDIA_TOKEN uploader in the required dependency order. No Jev source may be adapted before P03 passes. The automatic workflow, task-board/feature PRs, independent recording pair, video-only comment, watched/inline playback, final review, and push remain required.
