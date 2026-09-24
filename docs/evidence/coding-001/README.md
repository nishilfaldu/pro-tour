# Coding visit 001 evidence

This visit implements the read-only prerequisite inventory and the data-only configuration contract. It advances P02, P08, P09, and their P25 tests; those full plan items remain incomplete. P01's baseline/critique prerequisite is the only proposed completed checkbox. The authoritative updated plan is unchanged.

The repository began at `3efcdab` on `exp/astra-xhigh-author-grok47-xhigh-reviewer`. Decisions were read before changes. Critique visit 002 accepted plan-update visit 001 and resolved O1–O3; no open coding review finding or product question was supplied. Applicable root/ancestor `AGENTS.md` and root `docs/SEMANTIC-INDEX.md` were absent. The imported skills were read only to identify their standard validation commands. Their sources and the pre-existing `.gitignore` edit are preserved.

## Reproduction

Run from the repository root. This visit used an external environment to avoid changing the user's existing ignore file:

```sh
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv sync --locked
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked python scripts/check.py
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked pro-tour validate-config examples/task-board.pro-tour.json
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked pro-tour doctor --secrets-file .env.local --output /tmp/pro-tour-new-inventory.json
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv build --wheel --out-dir /tmp/pro-tour-coding-001-dist
```

The first dependency resolution used `uv sync` to create `uv.lock`; subsequent commands used the locked environment. [uv's locked mode](https://docs.astral.sh/uv/concepts/projects/sync/) checks that the committed lock remains current. `uv.lock` contains registry artifact hashes; `.python-version` pins the tested Python. `prerequisites.json` records local executable versions/hashes, commands, statuses, and UTC timestamps. These are host observations, not pinned Linux image identities.

## Observed results

- The standard check command passed: 114 product tests, 27 imported tests, imported skill naming validation, compilation of 32 imported Python files, Ruff lint/format, and Git whitespace checks. `checks.log` retains its output.
- The CLI accepted the example and emitted only status plus input SHA-256. Tests reject origin/port bypasses, unknown policy fields, secret/runtime environment names, unsafe paths, malformed JSON, duplicate keys, and excessive budgets. Input mutation cannot change the immutable parsed policy.
- Real synthetic child-process tests verified the explicit probe environment, fresh temporary home, timeout cleanup, and omission of raw output from the evidence. A macOS interpreter adds a nonsecret `__CF_USER_TEXT_ENCODING` variable; the test documents that observation.
- The first test run found a real trailing-newline schema bypass and a macOS environment assertion mismatch (104 passed, 2 failed). The schema now uses an absolute end assertion and has regression coverage for controls in names/values/journey text. The final suite above passed after these changes; the initial failure is not presented as successful validation.
- The wheel was built, installed without the source checkout into a separate environment using hash-checked runtime dependencies exported from the lock, and its CLI/schema were exercised from `/tmp`. `verification.json` records the command results, source hashes, and wheel hash.
- All three required secret assignments were present; operational validity was **not tested**. No secret value is recorded or supplied to version-probe subprocesses. `TEXT_MODEL`, `TEXT_MODEL_BASE_URL`, and `TEXT_MODEL_API_KEY` were absent in the inherited environment.
- The host is macOS arm64. Docker CLI 29.5.3 is present, but there is no local daemon socket. Xvfb, unshare, nft, and iptables are absent. Chromium's binary exists; no browser was started.
- Cursor CLI 2026.09.23-86fc751, GitHub CLI 2.94.0, FFmpeg/FFprobe 9.0.2, Node 25.9.0, npm 11.12.1, Python 3.12.12, and uv 0.9.21 returned versions. A version query is not model invocation, API authentication, attachment support, or Linux compatibility evidence.

## Required follow-up

Establish a disposable Linux runner/container environment and prove isolation with synthetic canaries before credentialed browser work. Then perform P03's unchanged upstream example, P04's Grok 4.7 tool-denial/planning/text proof, and P05's pinned uploader/inline playback proof. Do not adapt Jev before its pristine-example prerequisite passes. No integration source was cloned or refactored here, and no model was invoked.

P06 runtime network/process isolation is unimplemented. The probe environment helper is only hygiene for trusted version commands, not protection against malicious PR code. The configuration validator does not fetch/authenticate a base revision, contain archive extraction, resolve symlinks, enforce network rules, or start the sample. Those responsibilities remain P06/P09–P12/P24. The task-board example is a contract fixture, not evidence of sample startup.

The end-to-end workflow, independent recordings, two-video comment, real PRs, provider validity, and watched/inline playback acceptance remain unverified. P02/P08/P09/P25 must stay unchecked; see the handoff for their exact remaining work.
