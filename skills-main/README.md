# skills

<!-- df-promise-badges:start -->
[![Skills validate](https://img.shields.io/static/v1?label=Skills+validate&message=fulfilled+2026-08-26+%40+d0cdcd6&color=brightgreen)](.promises/all-skills-validate/PROMISE.md)
<!-- df-promise-badges:end -->

Diffusion skills for chapter creation, sprint planning, sprint execution,
semantic index maintenance, multi-model delivery loops, and durable repository
Promise Loops.

## Namespace

Diffusion-owned skills use the `df-` prefix. Directory names and `SKILL.md`
frontmatter `name:` fields must match exactly, use lowercase ASCII kebab-case,
and avoid colon-delimited names. The prefix keeps these skills distinct from
platform commands and other plugins while keeping filesystem paths portable.

Run the skill validation check after adding, renaming, or changing skills:

```bash
python3 scripts/validate-skills.py
```

## Change SOP

The model resolver tests require PyYAML. Before the first gate, create the
following environment, or set `DIFFUSION_TEST_PYTHON` to an existing Python with
PyYAML installed (do not skip the tests when the dependency is missing):

```bash
python3 -m venv ~/.local/share/diffusion/skills/venv
~/.local/share/diffusion/skills/venv/bin/python -m pip install PyYAML
```

For any non-trivial skill formatting, namespacing, or workflow change:

1. Update both mirrors together: `.claude/skills/df-*` and
   `.agents/skills/df-*`. Apply equivalent changes, not byte-identical copies:
   `.claude` skills use `.claude/skills/...` helper paths and `CLAUDE.md`
   references, while `.agents` skills use `.agents/skills/...` helper paths and
   `AGENTS.md` references. Claude helper searches use `.claude` then
   `~/.claude`; agent helpers use `.agents`, `~/.agents`, then `~/.codex`.
   Mirror user-scope examples accordingly. Supporting resources must exist in
   both mirrors, text resources must differ only by documented substitutions,
   and binary resources must be byte-identical. Never mention the opposite
   mirror's skill path in bundled-resource prose or comments.
2. Run the local gates:
   ```bash
   git add -N AGENTS.md README.md .claude/skills .agents/skills scripts 2>/dev/null || true
   python3 scripts/validate-skills.py
   python3 -m py_compile scripts/validate-skills.py scripts/test_*.py $(find .claude/skills .agents/skills -path '*/scripts/*.py' -type f | sort)
   DIFFUSION_TEST_PYTHON="${DIFFUSION_TEST_PYTHON:-$HOME/.local/share/diffusion/skills/venv/bin/python}"
   "$DIFFUSION_TEST_PYTHON" -m unittest discover -s scripts -p 'test_*.py'
   git diff --check --cached
   git diff --check
   ```
3. Shell out to Claude for a focused critique before calling the change done:
   ```bash
   git add -N AGENTS.md README.md .claude/skills .agents/skills scripts 2>/dev/null || true
   {
     git status --short
     git diff --cached --stat
     git diff --stat
     git diff --cached -- AGENTS.md README.md .claude/skills .agents/skills scripts
     git diff -- AGENTS.md README.md .claude/skills .agents/skills scripts
   } | claude -p "Review this skills repo change for skill formatting, namespacing, mirror consistency, helper paths, and actionable SOP regressions. Do not modify files, the index, or the worktree. Return concise findings with severity and file/line references, or say no actionable findings." --dangerously-skip-permissions
   ```
4. Fix any actionable Claude findings, then repeat steps 1-3 until Claude
   reports no actionable findings or only explicitly accepted non-blocking
   tradeoffs.

## Skills

- **`df-sprint-plan`** — Multi-agent collaborative planning: draft, critique, and
  merge sprint documents across Claude (Fable 5.1) and Codex (GPT-6 Astra) by
  default. Gemini through `agy` is off unless explicitly requested for the run.
  Bundles the sprint ledger CLI at
  `.claude/skills/df-sprint-plan/scripts/ledger.py`. When a repo has
  `docs/chapters/`, planning can optionally read active chapter context and
  preserve sprint-to-chapter links in sprint docs, sprint ledgers, and chapter
  ledgers. Chapters do not get their own fan-out or critique workflow. Sprint
  docs should carry a short `Pyramid Index` for summary enumeration.
- **`df-sprint-multi-execute`** — Parallel LunaRoute GLM Vision and DeepSeek
  implementations, followed by Astra synthesis into the original clone.
- **`df-sprint-execute`** — Hand the current sprint plan to a chosen agent
  (claude, codex, or gemini through `agy`) for execution. Depends on the ledger
  CLI bundled with `df-sprint-plan`. Chapter-linked sprints load their chapter
  before execution and verify that the chapter link remains intact during status
  updates.
- **`df-chapter-create`** — Create a concise long-range chapter under
  `docs/chapters/` for design direction, architecture, and themes across roughly
  12-100 future sprints. Chapter docs include a compact `Pyramid Index` and stay
  under 3000 tokens. Bundles a chapter ledger helper at
  `.claude/skills/df-chapter-create/scripts/chapter.py`.
- **`df-semantic-index`** — Build, upsert, benchmark, rebalance, and maintain
  semantic indexes over large filesystem corpora. Keeps the format flexible
  while requiring an entrypoint, routing nodes, leaf citations, housekeeping
  state, retrieval evals, and tree/index metrics. Bundles a structural metrics
  helper at `.claude/skills/df-semantic-index/scripts/semantic_index_metrics.py`.
- **`df-promise`** — Interview, configure, run, resume, and verify a repository
  Promise Loop for recurring security, brand, performance, reliability, or
  similarly bounded assurance. Keeps compact durable state and promise-local
  tools under the target repository's `.promises/` directory, records evidence
  and resource usage across bounded runs, requires runner and order-of-magnitude
  cost declarations plus gate-linked evidence, and issues a commit-pinned README
  badge only after every fulfillment gate passes. Bundles the generic state and
  badge helper at `.claude/skills/df-promise/scripts/promise.py`.
- **`df-easy-loop-e2e`** — Run a requirements interview, repeated plan critique
  until acceptance, then coding/validation/review until all objections resolve.
  Supports foreground Claude Code, Codex, and Cursor Grok 4.7 sessions.
- **`df-easy-loop-simple`** — Run the same governed multi-model delivery loop
  from an existing specification, without the requirements interview.

### Sprint Multi Execute

`/df-sprint-multi-execute 007` runs the same planned sprint concurrently in
isolated worktrees using LunaRoute `glm-5.3-vision` and `deepseek-4.1-flash`.
Both start from one recorded commit. After both finish, an OpenAI `gpt-6-astra`
supervisor compares the implementations and integrates the best changes into the
original clone, then validates the combined result. This is separate from
ordinary sprint-execute and does not change planning lanes.

Install it alongside `df-sprint-execute` and `df-sprint-plan`. See the
[multi-execution workflow](.claude/skills/df-sprint-multi-execute/SKILL.md).
Its three model assignments are fixed; the seven skills' model resolver below
does not override them. Each lane has private receipts and logs. All three
preflights must pass before implementation; DeepSeek's previously observed
Responses incompatibility is avoided by running DeepSeek through Pi Chat Completions; GLM and Astra remain on Codex. Fresh tool preflights remain mandatory.

## Model configuration

The seven resolver-based skills resolve model settings in this order, with later layers winning
per role and field:

1. Defaults inside the installed skill's `SKILL.md`.
2. User overrides in `~/.config/diffusion/skills/models.yaml`.
3. Project overrides in `<project-root>/.diffusion/skills/models.yaml`.

Both override files use the same schema. Include only the fields to change:

```yaml
skills:
  df-easy-loop-e2e:
    coding:
      model: gpt-6-astra
      reasoning_effort: high
    plan-critique:
      model: grok-4.7
      reasoning_effort: xhigh
  df-easy-loop-simple:
    plan:
      model: claude-fable-5-1
  df-sprint-plan:
    claude:
      model: claude-fable-5-1
  df-sprint-execute:
    codex:
      model: gpt-6-astra
  df-chapter-create:
    main:
      model: claude-fable-5-1
  df-semantic-index:
    reader:
      model: gpt-6-astra
  df-promise:
    main:
      model: gpt-6-astra
```

| Skill | Default role assignments |
|---|---|
| `df-easy-loop-e2e` | Requirements, plan, plan-update, review: `claude-fable-5-1`; plan-critique, coding, validation: `gpt-6-astra`. All use `high` effort. |
| `df-easy-loop-simple` | Plan, plan-update, review: `claude-fable-5-1`; plan-critique, coding: `gpt-6-astra`. All use `high` effort. |
| `df-sprint-plan` (Gemini opt-in only), `df-sprint-execute` | `claude`: `claude-fable-5-1`; `codex`: `gpt-6-astra`; `gemini`: `cli-default` (agy's configured model). |
| `df-chapter-create`, `df-promise` | `main`: `inherit` (the invoking agent). |
| `df-semantic-index` | `main`, `reader`: `inherit`. Readers inherit the effective main model. |

Every skill also exposes `main`, defaulting to `inherit`, for its invoking
orchestrator. A concrete `main` override hands the skill to one worker using
that
model; it does not pretend to change the current session's model. Easy Loop
roles accept Claude or Codex models; sprint provider lanes keep their provider.
Sprint Codex commands use `--sandbox workspace-write`; current Codex no longer
accepts the older `--full-auto` flag. Set the Gemini role to a concrete
`gemini-...` model to pin it.
`reasoning_effort: null` removes a lower-layer effort setting. Missing files and
omitted entries retain defaults; malformed configuration is reported before a
model launches. Normal resolution does not write either override file.

Each skill bundles its own `scripts/resolve_models.py` and
`references/models.md`, so installation needs no additional skill dependency.
The resolver needs only Python 3 when no override files exist. Reading YAML
overrides requires PyYAML. One-time setup for overrides and the test suite:

```bash
python3 -m venv ~/.local/share/diffusion/skills/venv
~/.local/share/diffusion/skills/venv/bin/python -m pip install PyYAML
```

Inspect effective assignments, CLI arguments, and the source of each field:

```bash
~/.local/share/diffusion/skills/venv/bin/python \
  .claude/skills/df-easy-loop-e2e/scripts/resolve_models.py \
  --project-dir /path/to/project
```

Use the helper alongside the skill actually loaded (including user-scoped
installs). The target project is independent of that install location. Without
`--project-dir`, the resolver finds the current Git worktree root, or uses the
current directory outside Git. Easy Loop saves the effective configuration in
`setup/resolved-models.json` and keeps it fixed across resumed visits.

Run the model configuration regression tests with the same Python:

```bash
~/.local/share/diffusion/skills/venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
```

## EasyLoop visualizer

`tools/easyloop-visualizer/build_insights.py` builds a self-contained HTML
report from runs under `~/.easyloop/runs`. It recognizes both EasyLoop flows
from each run's copied `setup/SKILL.md`: **E2E** includes requirements and
validation, while **Easy** starts from a supplied specification and omits those
stages. Python 3 is the only runtime dependency.

Run it directly from a checkout:

```bash
# List available runs.
python3 tools/easyloop-visualizer/build_insights.py --list

# Build the two most recent runs, one tab per run plus Combined.
python3 tools/easyloop-visualizer/build_insights.py

# Or select exact run IDs or full run-directory paths.
python3 tools/easyloop-visualizer/build_insights.py \
  20260824_180531 20260824_180612

# Open the generated, network-free report on macOS.
open tools/easyloop-visualizer/easyloop-workflow.html
```

To install a user-local copy independent of the checkout:

```bash
install -d "$HOME/.local/share/easyloop-visualizer"
install -m 0755 tools/easyloop-visualizer/build_insights.py \
  "$HOME/.local/share/easyloop-visualizer/build_insights.py"

"$HOME/.local/share/easyloop-visualizer/build_insights.py"
open "$HOME/.local/share/easyloop-visualizer/easyloop-workflow.html"
```

The generated report has all CSS, JavaScript, and run data inline. Re-run the
builder whenever the EasyLoop run directories change. Use repeatable
`--timeline-rows FILE` arguments to add versioned external interval rows. Run
`python3 tools/easyloop-visualizer/build_insights.py --help` for CLI usage.

## Install

Copy the `.claude` skill directories into a project's `.claude/skills/`
(project scope) or `~/.claude/skills/` (user scope):

```bash
cp -R .claude/skills/df-sprint-plan /path/to/project/.claude/skills/
cp -R .claude/skills/df-sprint-execute /path/to/project/.claude/skills/
cp -R .claude/skills/df-sprint-multi-execute /path/to/project/.claude/skills/
cp -R .claude/skills/df-chapter-create /path/to/project/.claude/skills/
cp -R .claude/skills/df-semantic-index /path/to/project/.claude/skills/
cp -R .claude/skills/df-promise /path/to/project/.claude/skills/
cp -R .claude/skills/df-easy-loop-e2e /path/to/project/.claude/skills/
cp -R .claude/skills/df-easy-loop-simple /path/to/project/.claude/skills/
```

Install `df-sprint-plan` and `df-sprint-execute` together:
`df-sprint-execute` invokes the ledger CLI bundled with `df-sprint-plan`.
Install both dependencies alongside `df-sprint-multi-execute` when using the
parallel implementation and Astra synthesis workflow.

For Codex-style agent bundles, copy the mirrored `.agents/skills/df-*`
directories into the target project's `.agents/skills/` (project scope),
`~/.agents/skills/`, or `~/.codex/skills/` (user scope). The `.agents` mirrors
keep the same `df-*` skill names.
