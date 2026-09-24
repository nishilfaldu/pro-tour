# Runtime and provider conventions

Use the bundled `scripts/run_lane.py` beside the loaded skill. It requires Python
3.8+, Codex, and Pi >= 0.85.1; no personal shell wrapper is required.

```text
python3 <loaded-skill-dir>/scripts/run_lane.py glm --project-dir <original-clone> --runs-dir <private-run>/glm-preflight --preflight
python3 <loaded-skill-dir>/scripts/run_lane.py deepseek --project-dir <original-clone> --runs-dir <private-run>/deepseek-preflight --preflight
python3 <loaded-skill-dir>/scripts/run_lane.py astra --project-dir <original-clone> --runs-dir <private-run>/astra-preflight --preflight
```

After all three preflights pass, launch these two execution calls concurrently:

```text
python3 <loaded-skill-dir>/scripts/run_lane.py glm --project-dir <glm-worktree> --runs-dir <private-run>/glm --prompt-file <private-glm-prompt>
python3 <loaded-skill-dir>/scripts/run_lane.py deepseek --project-dir <deepseek-worktree> --runs-dir <private-run>/deepseek --prompt-file <private-deepseek-prompt>
```

After candidate assessment and original-clone drift checks, launch synthesis:

```text
python3 <loaded-skill-dir>/scripts/run_lane.py astra --project-dir <original-clone> --runs-dir <private-run>/astra --prompt-file <private-supervisor-prompt>
```

The runner sets the provider/model explicitly:

```sh
codex exec --profile lunaroute --model glm-5.3-vision
pi --provider lunaroute --model deepseek-4.1-flash --thinking high --mode json --print --no-session
codex exec -c 'model_provider="openai"' --model gpt-6-astra
```

LunaRoute uses one existing profile, defaulting locally to GLM Vision; DeepSeek does not use that Codex profile. No global config is edited. On the tested CLI,
`$CODEX_HOME/lunaroute.config.toml` (default `~/.codex/lunaroute.config.toml`) is:

```toml
model_provider = "lunaroute"
model = "glm-5.3-vision"
```

Base configuration supplies `[model_providers.lunaroute]`, gateway URL,
`wire_api = "responses"`, and existing authentication. Astra uses normal OpenAI
Codex authentication, not the LunaRoute profile. Reuse authorized existing setup;
report missing configuration without printing or copying credentials. Never
silently route Astra through LunaRoute. Verify `codex exec --help` if CLI syntax
differs on the target host.

Preflight uses a disposable working directory. The Pi harness has a 120-second
deadline after setup (up to 15 seconds for version and 30 seconds for catalog fetch).
Codex retains its existing runtime timeout behavior; the Pi deadline does not apply.
Codex uses read-only permissions; Pi exposes only its bash tool for the smoke
command and has no OS filesystem sandbox. The runner requires an observed
successful shell event and final success marker. Codex uses `--ephemeral`; Pi
uses `--no-session`. Codex execution uses `workspace-write`; approval behavior
otherwise follows existing Codex settings. Pi execution uses built-in tools in
the assigned worktree, with explicit prompt boundaries rather than a sandbox.
Pi rejects `--add-dir` instead of pretending to enforce that Codex permission.
For Codex, repeated `--add-dir <exact-path>` flags can grant narrowly required sandbox
access during execution; they are ignored for isolated preflight. They grant
write access, not a read-only mount. Follow the skill's path restrictions and
perform a harmless access check on first use in linked worktrees.
The runner passes prompts on stdin and stores stdout JSONL events and stderr
in owner-only files, with no automatic retry or model fallback. It waits in the
foreground; use process handles for concurrency and read logs for progress.
Receipt metadata is client-side evidence, not independent upstream attestation.

Each invocation prints its private run directory and writes `receipt.json`,
`stdout.log`, and `stderr.log`. Receipts include requested model/provider,
profile, project, timestamps, process exit code, and runner exit code. By default
runs live under `$CODEX_HOME/lunaroute-runs`; this workflow supplies per-role
`--runs-dir` paths. Logs can contain private project content. Do not commit them
or dump raw logs in reports. Remove temporary prompts once their lane finishes.
No worktree, branch, or log cleanup is automatic. SIGINT/SIGTERM cancellation
terminates the harness process group and records a nonzero exit; retain worktrees
and inspect for any detached processes before cleanup.

## DeepSeek Pi transport (verified 2026-09-15)

LunaRoute's [Connect page](https://app.lunaroute.com)
recommends `npx @lunaroute/cli setup pi`. Pi must be installed separately:
`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`.
The interactive extension syncs its catalog on first interactive launch;
a scripted `pi -p` before that launch may lack the model. The runner avoids
that dependency using the documented `models.json` Chat Completions setup.

For every DeepSeek invocation, `pi_runtime.py` fetches the exact model from
`https://gw.lunaroute.com/v1/models`, retaining the provider's context limits,
vision capability, `thinkingLevelMap`, and `client_compat.pi` metadata. It checks
`deepseek_v41` as a catalog version marker and requires `high -> high` before
launching. Pi 0.85.1 does not implement that format name: it passes through
the catalog value and uses its generic `reasoning_effort` path. Compatibility
is established by the live tool round trip, not by the metadata string. The
receipt calls this `catalog_thinking_format`, separately from `reasoning_effort`. The observed
catalog's `medium` maps to `medium`, which DeepSeek rejects; do not default to it.

It writes a temporary owner-only `PI_CODING_AGENT_DIR` with an env reference
`$LUNAROUTE_API_KEY`, never the key value, and deletes it after the process ends.
Reuse the existing authorized environment key. No global Pi settings, auth files,
model catalog, extensions, or skills are copied. Extensions, skill discovery,
prompt templates, themes, and context-file auto-loading are disabled. Pi
`--no-approve` ignores project-local extension files; it does not auto-approve them. Workers must explicitly read project instructions.
Prompts travel via stdin. Logs and receipts remain private. Avoid dumping
`setup pi --print` output: it can include existing credentials from other providers.

Pi's process can exit zero even after a provider error. The runner therefore
requires a successful model/provider-matched final assistant message followed by
`agent_settled`, rejects error/aborted messages, and additionally requires the
matched bash tool result and final marker for preflight. No retries or fallback
models are used. Tests cover this false-success case and transport/config drift.

Codex's DeepSeek Responses route rejected typed `input_text`; flattening text
was insufficient for the full tool request. The failed adapter was removed.
DeepSeek now uses Pi; GLM remains Codex/LunaRoute and Astra remains Codex/OpenAI.
A live DeepSeek Pi preflight passed with both a real bash event and final marker.
Private qualification receipts were saved under
`~/.codex/clarity-pi-qualified/`; these local receipts are not distributed evidence.
This qualifies the observed tool/text path, not vision, sprint acceptance, or
future provider availability. Fresh preflight remains mandatory for each run.
