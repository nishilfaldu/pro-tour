---
name: df-sprint-multi-execute
description: Execute one planned sprint with parallel LunaRoute GLM 5.3 Vision and DeepSeek implementations in isolated Git worktrees, then have Astra synthesize the best changes into the original clone. Use when the user asks for Sprint Multi Execute, dual implementations, or this fan-out and synthesis workflow; ordinary single-agent execution remains df-sprint-execute.
argument-hint: "[sprint-number]"
---

# Sprint Multi Execute

Usage: `/df-sprint-multi-execute [sprint-number]`.

Produce two independent implementations of the same sprint, then a validated
combined implementation in the original clone. This skill is execution only:
do not run planning, drafting, or planning critiques. Do not replace it with two
agents editing the same checkout or with a blind merge of their branches.

## Fixed roles

| Role | CLI/provider | Model |
|---|---|---|
| Implementation A | Codex exec, `lunaroute` profile | `glm-5.3-vision` |
| Implementation B | Pi, LunaRoute Chat Completions | `deepseek-4.1-flash` |
| Synthesis supervisor | Codex exec, OpenAI provider | `gpt-6-astra` |

Launch A and B concurrently, using separate worktrees from one recorded commit.
After both reach terminal states, Astra compares their evidence and integrates
selected changes into the original clone. Always launch the explicit Astra CLI
supervisor, even when the invoking model is Astra. The invoking agent coordinates
and checks results; it must not substitute its own synthesis for the named role.
The seven existing skills' model resolver does not override these fixed roles.
GLM and Astra use Codex; DeepSeek always uses Pi. Do not send DeepSeek through
Codex Responses or substitute GLM for it after a transport error.
If a user requests different models, clarify the changed scope before deviating.

Read [references/runtime.md](references/runtime.md) for runner commands,
receipts, provider setup, and compatibility diagnostics.

Dependencies: install `df-sprint-execute` and `df-sprint-plan` alongside this
skill. Read the installed sibling `df-sprint-execute/SKILL.md` only for its
**Phase 1 steps 1–4** (sprint discovery, semantic-index resolution, chapter and
Pyramid Index context), its **Phase 2 prompt content**, and **Phase 3 validation**.
Do not invoke that skill wholesale: its model resolution, single-agent launch,
and ledger-start timing are replaced by this workflow. Resolve the ledger helper
from the installed sibling `df-sprint-plan/scripts/ledger.py`; user-scope installs
must not assume project-local helper paths. Respect repository-specific YAML
ledger helpers and preserve chapter links.

Resolve the ledger helper before using the borrowed context steps. Prefer the
sibling of the loaded skill; if absent, discover installations with:

```sh
find .claude ~/.claude -maxdepth 5 -type d -name df-sprint-plan 2>/dev/null
```

Choose the installation associated with the loaded skill, verify its
`scripts/ledger.py` exists, and set `ledger_py` to that absolute path. If none
exists, stop with an install-dependency error. Replace all borrowed project-local
ledger paths with this resolved helper. Run from the target repository root:

```sh
python3 "$ledger_py" current
python3 "$ledger_py" next          # only if there is no current sprint
python3 "$ledger_py" start NNN     # only at section 3's ledger-start step below
python3 "$ledger_py" complete NNN  # only after section 6 validation below
```

These are commands for their named phases, not a block to execute at once.
For repository-specific YAML ledgers, substitute the repository's documented
helper and status commands instead; do not run the bundled TSV CLI against YAML.

## 1. Establish the common input

1. Identify the original clone and target branch. "Original clone" means the
   user's designated integration checkout, not necessarily a branch named `main`.
   Record its absolute path, branch, HEAD SHA, and Git status. If invoked from a
   worktree and the integration target cannot be inferred from the request and
   `git worktree list`, ask for that target before creating worktrees.
2. Load the selected/current/next sprint and its chapter, Pyramid Index, and
   semantic-index citations using the shared context steps above. Do not create
   a new sprint. Both workers receive the same plan and resolved citations.
3. Require a clean integration checkout and a sprint document tracked at HEAD
   before fan-out. If it contains user changes, report the specific dirty paths
   and request their disposition; never auto-stash, discard, commit, or silently
   omit them. Do not claim uncommitted sprint inputs were included in the baseline.
4. Create a private run directory outside the repository. Record the baseline
   commit, target branch, sprint ID, exact models, prompt paths, and subsequent
   worktree/receipt paths in `manifest.json`. Use mode 0700 for directories and
   0600 for prompts and manifests. Keep private source material and logs out of Git.

## 2. Preflight all three roles

Run the bundled runner's `--preflight` for `glm`, `deepseek`, and `astra`; these
can run concurrently. Collect all three receipts and require each runner to exit
zero with `preflight_verified: true`. This proves a text/tool round trip, not
image interpretation, correctness of a sprint, or deployment readiness.

If any preflight fails, stop before starting the ledger or implementation. Name
the failed role and sanitized error; retain diagnostics. No model substitution,
repeated automatic retry, or one-worker fallback. DeepSeek uses Pi with a fresh
isolated catalog, `deepseek_v41` catalog metadata,
and a validated `high -> high` catalog mapping. The runner rejects a missing/incompatible catalog
and a Pi provider error even if Pi exits zero. A successful preflight proves
this tool/text path on the current provider; it cannot guarantee future uptime.

## 3. Create isolated worktrees and fan out

Create two uniquely named branches/worktrees from the recorded **same baseline
SHA**, using the user's branch convention (default `codex/`). For example, with
actual unique run ID and external paths substituted:

```sh
git -C "$main_clone" worktree add -b "codex/multi-$run_id-glm" "$glm_tree" "$base_sha"
git -C "$main_clone" worktree add -b "codex/multi-$run_id-deepseek" "$deepseek_tree" "$base_sha"
```

Do not reuse occupied paths or existing branches. Verify both HEADs equal the
baseline and both worktrees are initially clean. Provision ignored dependencies
using the project's documented setup, without copying secrets or unrelated dirty
files into either tree. Handle partial setup failure by reporting what was
created; do not force-remove worktrees. Check access with a harmless read command in each worktree before implementation.
Codex uses its workspace sandbox. Pi has no equivalent filesystem sandbox:
worktrees and prompt boundaries provide workflow isolation, not OS enforcement.
Pi loads only built-in tools and a private provider config; no auto-discovered
extensions or skills. Read project instructions explicitly in the worker prompt.
For a Codex lane, if a repository operation
needs writable Git metadata outside that worktree, resolve its exact path with
`git rev-parse --absolute-git-dir` and grant only that path using `--add-dir`.
Do not grant workers write access to the original clone's working files; never
broaden to the common `.git` directory without a demonstrated repository need.

Only the coordinator changes the canonical ledger. Mark the sprint in progress
in the original clone immediately before launching workers. Record the resulting
HEAD, branch, status, and a content fingerprint of the ledger-only delta in the
manifest. Any unrelated change at this point is a blocker. Workers use the
committed plan at the baseline; their local ledger need not say in progress.

Build two private prompts from the shared execution prompt, with identical sprint
scope, acceptance criteria, chapter constraints, and resolved prior art. Add:

> You are one of two independent implementation workers. Work only in your
> assigned worktree. Do not inspect the other implementation or modify the
> integration clone. Implement the complete sprint and run relevant validation.
> Do not change sprint/chapter ledger status, commit, merge branches, push, deploy, or
> publish. Leave your changes (including new files) in this worktree. Report tasks
> completed, tests and exact outcomes, design decisions, tradeoffs, and blockers.
> Preserve the sprint's chapter links and Pyramid Index. Stop on an infrastructure
> failure rather than claiming completion. Your result will be reviewed by Astra.

Launch both `run_lane.py` execution calls **before waiting for either one**.
Launch the Python runner directly, use `exec python3 ...` in a shell wrapper,
or record its PID and signal that PID directly on cancellation. Killing only
a parent shell can orphan the runner and its separate harness process group (Codex or Pi).
Use the host's parallel process/tool calls or asynchronous process handles; do
not serialize two blocking invocations. Keep ownership of both process handles,
run directories, and receipts. Wait for both, surfacing meaningful progress from
private logs without printing secrets. On cancellation, stop both worker processes
and their children, verify they have stopped, and retain the worktrees and logs.
Do not clean up a live worktree.

## 4. Freeze and assess the candidates

Before synthesis, verify both workers are stopped and record for each:

- Runner and process exit codes, final response, and test evidence.
- Final HEAD, tracked diff against the common baseline (including staged changes
  and worker commits), and new/untracked files relevant to the implementation.
- Completed tasks, known failures, and any changes outside sprint scope.

Use `git diff <base-sha>` plus `git status --short` and inspect untracked files;
`git diff` alone misses new files. A zero exit code is not sprint acceptance.
Preserve both trees as read-only evidence during synthesis; do not reset them.

If either lane fails, produces an incomplete candidate, or has unresolved tests,
report this and keep the run blocked before synthesis. Ask whether to repair that
lane or explicitly proceed with degraded evidence. Do not relabel a single
successful candidate as completed dual execution. Record any authorized exception
in the manifest and the final report.

Recheck the original clone's branch, HEAD, and working state against the recorded
post-ledger snapshot. Stop on unexpected drift; do not overwrite concurrent user
work. Ensure no other agent is writing to the integration clone.

## 5. Astra synthesis into the original clone

Prepare a private supervisor prompt containing the sprint/chapter scope, common
baseline, original-clone path, both worktree paths, receipts, worker reports, and
validation commands. Give Astra read access to both candidate paths using the
runtime's scoped approval mechanism if needed; candidate worktrees are not write
targets. The runner accepts repeated `--add-dir` for narrowly required sandbox
access; this grants write capability too, so prefer default read access and keep
the supervisor prompt's prohibition on candidate writes. Do not grant parent
directories or the entire home directory. Run `run_lane.py astra` with the original clone as `--project-dir`.
Include these instructions:

> Compare both implementations against the sprint acceptance criteria. Inspect
> code and tests yourself, including committed, staged, unstaged, and new files;
> do not rely only on worker summaries. Identify which design or pieces are best
> and why. You may use one implementation as the foundation, selectively port
> changes from the other, or rewrite overlapping pieces to preserve coherence.
> Do not blindly merge both branches or accept both sides of a conflict.
>
> Modify only the original clone. Preserve the coordinator's ledger changes and
> chapter links. Do not reset the clone, alter candidate worktrees, push, deploy,
> or publish. Check for unexpected original-clone drift before writing and stop
> if it occurs. Run the required tests on the combined implementation, resolve
> integration defects within sprint scope, and review the final diff for omissions,
> conflicting assumptions, duplication, and out-of-scope changes.
>
> Return a synthesis report in your final response: acceptance
> coverage, adopted/rejected ideas from each worker with file references, reasons
> for those choices, integration changes, tests and results, and remaining blockers.
> Keep the result uncommitted for review unless the user separately authorized
> commits. Do not mark the sprint complete; the coordinator owns the ledger.

Wait for Astra's terminal result. Save its final synthesis report in the private
run directory and record its path in the manifest. On failure, retain partial
integration changes
and report them; do not auto-reset or blindly replay synthesis. A separate attempt
must first reconcile the current original-clone state.

## 6. Validate and finish

The coordinator reviews Astra's report and the actual integrated diff. Check
coverage of every sprint acceptance criterion, chapter links, and Pyramid Index.
Require the repository's validation gates to pass on the combined result, not
just on candidate worktrees. Use Astra's recorded checks when they prove the
unchanged final state; rerun checks only for new changes, failures, or gaps.

Mark the canonical sprint completed only when synthesis, acceptance coverage, and
required validation pass. Otherwise leave it in progress/blocked according to
repository conventions. Do not mark a chapter completed without explicit scope.
Record final branch/HEAD, working-tree state, receipts, synthesis report, and
validation disposition in the manifest. Report the integrated result, which ideas
were selected, tests, remaining blockers, and all retained worktree locations.
Retain candidate branches/worktrees and private receipts until cleanup is
explicitly requested. Publication or deployment requires its own authorization.
