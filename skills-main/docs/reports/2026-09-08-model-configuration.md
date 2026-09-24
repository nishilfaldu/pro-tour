# Model configuration change and test report

Date: 2026-09-08. Base revision: `2830b00` on `main`.

## Changes

All seven skills now resolve model settings in this order, with later files
overriding individual fields of individual roles:

1. Defaults in the loaded skill's `SKILL.md`.
2. `~/.config/diffusion/skills/models.yaml`.
3. `<project-root>/.diffusion/skills/models.yaml`.

Both skill mirrors contain the same resolver and configuration reference.
Overrides can change the model and reasoning effort. The resolver reports the
effective CLI arguments and the source of each setting. Default-only operation
requires the Python standard library; reading YAML override files requires
PyYAML. Blank and comment-only files retain defaults without requiring PyYAML.
No user or project override file was created in the working repo or
the user's home directory during testing.

For example, put this in either override file to change only E2E coding effort:

```yaml
skills:
  df-easy-loop-e2e:
    coding:
      model: gpt-6-astra
      reasoning_effort: medium
```

See the [README](../../README.md#model-configuration) for all role defaults and
configuration examples.

The prior Claude Opus 4.8 and Fable 5 assignments now use `claude-fable-5-1`.
The prior GPT 5.6 Sol assignments now use `gpt-6-astra`. Easy Loop retains
`high` reasoning effort for every workflow role, freezes resolved settings in
`setup/resolved-models.json`, and explicitly selects the model on resume.

Sprint planning and execution now explicitly select Fable 5.1 for their Claude
lanes and Astra for their Codex lanes. Gemini retains its configured CLI
default unless overridden; its live override test used
`gemini-3.8-flash-high`. All skills expose a configurable `main` role, defaulting
to the invoking agent; semantic indexing also exposes `reader`.

The README documents the schema and role defaults. The repository SOP now
includes the model regression suite and its dependency setup. Sprint execution
uses the supported Codex `--sandbox workspace-write` flag in place of the
removed `--full-auto` flag.

## Automated checks

- 18 regression tests passed, including all roles, both mirrors, independently
  installed bundles, field-level precedence and source attribution, partial
  overrides, null effort removal, provider changes, provider-lane restrictions,
  malformed configuration, duplicate keys, project-root discovery, and CLI
  error behavior, and blank/comment-only override files.
- All 14 installed skill copies resolved identical defaults with and without
  PyYAML; missing PyYAML produces installation guidance when overrides exist.
- Repository skill/mirror validator passed.
- Python compilation and staged/unstaged whitespace checks passed.
- No old model identifiers remain in the skill bundles.
- Final required Claude critique: **no actionable findings** after addressing
  the earlier dependency, validation, test-gate, and documentation findings.

Run the regression suite with a Python environment containing PyYAML:

```bash
python -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/validate-skills.py
```

The generic skill-creator validator passes Easy Loop E2E, Easy Loop Simple,
and Promise. It rejects the existing `argument-hint` frontmatter on the other
four skills; that field predates this change and is supported by this repo's
validator. It was preserved.

## Live smoke tests

The tests used isolated temporary projects and actual CLI model invocations.
These are bounded stage exercises, not full multi-visit delivery workflows.

| Skill | Exercise | Result |
|---|---|---|
| `df-chapter-create` | Create a 12–20 sprint chapter with Pyramid Index and ledger entry, using a project model override | Passed; chapter and ledger verified |
| `df-semantic-index` | Build an index over three short documents and run metrics | Passed; three leaves and zero orphan leaves |
| `df-promise` | Initialize and validate a tiny deterministic contract | Passed; contract validated, no fulfillment badge issued |
| `df-easy-loop-e2e` | Run the requirements role with supplied answers | Passed; requirements, validation holdout, and `next: plan` verified |
| `df-easy-loop-simple` | Run the planning role from a tiny specification | Passed; ten unchecked tasks and `next: plan-critique` verified |
| `df-sprint-plan` | Independently draft the same tiny sprint through Claude, Codex, and Gemini | Passed all three lanes; every required section present |
| `df-sprint-execute` | Use Astra to implement an empty-name greeting fallback and tests | Passed; all three generated unit tests passed |

The first E2E test assertion expected a short `visit/` path, while the worker
used the skill's numbered visit layout inside the temporary project. The
actual artifacts and routing were inspected and passed; no skill change was
needed for that test-harness assumption.

Live model probes accepted `claude-fable-5-1`, `gpt-6-astra`, and
`gemini-3.8-flash-high`. Claude usage metadata reported exactly
`claude-fable-5-1`. Gemini authentication used the supplied key file parsed as
an environment-variable assignment, passed only through the subprocess
environment.

Additional Claude and Codex fresh/resume checks both passed: each resumed call
explicitly selected the intended model and recalled the previous turn's test
token.

The additional `main` handoff exercise selected Astra and its worker completed
a chapter and ledger successfully, with the model confirmed in the Codex log.
The parent test wrapper exceeded its 240-second limit before writing its final
evidence summary. This extra wrapper test was therefore not an unqualified
pass, although the handoff and worker artifacts were verified.

Local raw artifacts and logs are under `/tmp/diffusion-models.wNaBms/`; those
temporary files are not part of the repository.
