# pro-tour

PR-triggered app walkthroughs: record the main app journeys and a focused tour of the changes in a pull request.

The implementation provides a configuration validator, local prerequisite inventory, and disposable Linux app/browser isolation primitives tested with a real Chromium fixture. Restricted preflights now pass for the unchanged upstream Jev example and programmatic Grok 4.7 tour planning/text generation. The automatic GitHub workflow, task-board sample, production action loop, recording, and inline uploads are still pending. There is no tour-generation command yet.

Use Python 3.12.12 and uv (tested with 0.9.21):

```sh
export UV_PROJECT_ENVIRONMENT="${XDG_CACHE_HOME:-$HOME/.cache}/pro-tour/venv"
uv sync --locked
uv run --locked pro-tour validate-config examples/task-board.pro-tour.json
uv run --locked python scripts/check.py
```

The standard check command runs Ruff, product tests, the imported skills validator/tests and visualizer tests, Python compilation, and Git whitespace checks. It does not call a model. The [Linux isolation gate](docs/isolation.md), [pristine Jev preflight](docs/pristine-jev.md), and [Grok planning preflight](docs/grok-planning.md) are additional explicit runtime checks requiring a running local Docker engine.

To inventory trusted local tools, write to a new evidence path:

```sh
uv run --locked pro-tour doctor --output /tmp/pro-tour-prerequisites.json
```

An optional `--secrets-file .env.local` checks only whether the three named assignments are present; it never sources the file, prints values, authenticates, or passes those values to a subprocess. Exit 0 means the inventory was saved. Its `integration_ready` field remains false until actual integration proofs are implemented.

See the [configuration contract](docs/configuration.md) and evidence from [visit 001](docs/evidence/coding-001/README.md), [visit 002](docs/evidence/coding-002/README.md), [visit 003](docs/evidence/coding-003/README.md), and [visit 004](docs/evidence/coding-004/README.md). The configuration example describes the planned task-board baseline; that sample has not been implemented or started yet.

The imported skills are preserved in [`skills-main/`](skills-main/).

The updated Easy Loop workflow is installed at [`.agents/skills/df-easy-loop-e2e/`](.agents/skills/df-easy-loop-e2e/). Its repo-level model assignments are in [`.diffusion/skills/models.yaml`](.diffusion/skills/models.yaml): Codex Astra xhigh writes the plan and code; Cursor Grok 4.7 xhigh critiques, validates, and reviews. Override those role assignments on experiment branches to compare combinations.
