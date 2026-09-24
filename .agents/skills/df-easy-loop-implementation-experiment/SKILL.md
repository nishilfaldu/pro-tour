---
name: df-easy-loop-implementation-experiment
description: Run the Pro Tour implementation experiment from frozen requirements, skipping requirements interviews, planning, and plan critique; loop coding, runtime validation, and review until accepted.
---

# Pro Tour implementation experiment

Use this skill only for the separate Sol-low/Grok-low Pro Tour experiment. Read [the frozen product spec](references/pro-tour-spec.md) before launch. It records the user's earlier product answers; do not repeat those interview questions. A new product ambiguity may still be routed to the user. Do not start from code on the Astra-xhigh experiment branch.

## Run setup

Work in this skill's Git worktree, on `exp/sol-low-author-grok47-low-reviewer`. Do not work in `/Users/happyhome/Desktop/pro-tour`, the active Astra experiment. Resolve models with this skill's `scripts/resolve_models.py --project-dir <worktree>` as described in [model configuration](references/models.md). Freeze the result in `~/.easyloop/runs/<timestamp>/setup/resolved-models.json` and copy this `SKILL.md` and `references/pro-tour-spec.md` into `setup/` as well. The frozen copy controls this run. Check `cursor-agent models` for `grok-4.7-low` before launching a Cursor role. Do not use Claude or Grok Fast.

Make run directories `agents/coding`, `agents/validation`, and `agents/review`, with numbered visits starting at `001`. Create `decisions.md` initially empty. Start with **coding**, using the frozen spec as its input. There is no requirements, plan, plan-critique, or plan-update visit. Do not create a checklist merely to reproduce the other experiment's 28-step plan.

The orchestrator invokes each role in the foreground, waits for its exact CLI process to exit, then reads only `outcome.yaml` to route. Do not perform the roles' work yourself. Supply each role its visit directory, frozen spec path, `decisions.md`, and the prior artifacts named below. For a returning role, use its prior session ID when its context is `continue`; start fresh when `empty`. Keep a `session-id.txt` per visit. A missing required artifact after a successful exit, a nonzero CLI exit, or a missing session ID needed for continuation is a terminal orchestration error. Do not treat repeated objections as agreement or impose a visit limit.

Use the resolved model and effort arguments exactly. For Codex, invoke `codex exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --cd <worktree> -c model_reasoning_effort="low" --model gpt-6-sol <prompt>`; on continuation use `codex exec ... resume <thread-id> <prompt>`. For Cursor, invoke `cursor-agent --print --trust --force --output-format json --workspace <worktree> --add-dir <run-dir> --model grok-4.7-low <prompt>`; on continuation include `--resume <session-id>`. Capture IDs from the CLI JSON. Construct prompts as data; quote safely and never interpolate PR content into a shell command. Confirm the final command names the isolated worktree and resolved model before launch.

If a role writes `question.md` and routes to itself, relay the exact product question to the user. Append the exact question and response to `decisions.md`, pass the response in the next visit's `user-response.md`, and resume that role. Do not infer an answer from silence. Technical disagreement belongs in review and coding artifacts, with evidence and a response on the next visit.

## Workflow

```yaml
top_level_agent:
  model: inherit
agents:
  coding:
    model: gpt-6-sol
    reasoning_effort: low
    context: continue
    reads: [pro-tour-spec.md, decisions.md, latest-review.md-if-any]
    creates: [coding-update.md, outcome.yaml]
    next: [validation, coding]
  validation:
    model: grok-4.7
    reasoning_effort: low
    context: empty
    reads: [pro-tour-spec.md, decisions.md, latest-coding-update.md]
    creates: [validation.md, outcome.yaml]
    next: [review]
  review:
    model: grok-4.7
    reasoning_effort: low
    context: continue
    reads: [pro-tour-spec.md, decisions.md, all-coding-updates.md, latest-validation.md]
    creates: [review.md, outcome.yaml]
    next: [coding, review, end]
```

### Coding prompt

Read the frozen spec and decisions. Implement a coherent vertical slice, test it, and write `coding-update.md` with changed files, commands, results, remaining gaps, and responses to every open review finding. Continue from the prior coding session. Commit changes on this experiment branch; add explicit paths, not `git add -A` or wildcards. Route `next: validation` after a tested slice; use `next: coding` only for a product question or a clear self-contained continuation. Keep working until the entire spec, including real PR videos, is delivered.

### Validation prompt

Independently exercise the running software, not just unit tests. Read the spec, decisions, and latest coding update. Write `validation.md` with exact commands, observed results, passed and failed acceptance criteria, and unresolved runtime risks. A mocked or partial check cannot establish the complete PR-to-two-playable-videos flow. Route `next: review` even when validation fails.

### Review prompt

Read the spec, decisions, every coding update, and latest validation report. Inspect changes and perform focused checks. Write `review.md` with each finding marked open or resolved and evidence for any disagreement with coding or validation. Route `next: coding` when any criterion, test, or objection remains open. Route `next: end` only after all frozen requirements pass, validation has watched both videos and confirmed PR playback, review objections are resolved, and finished work is committed and pushed. Use `next: review` only for a product question handoff.

## Experiment boundaries

The development roles are Sol low and Grok 4.7 low. The **product's** tour planner remains Grok 4.7 as specified; changing the build models does not authorize changing product behavior. Preserve the unmodified Jev baseline requirement, the restrictions on a third typing model, and credential isolation. The sample app and real product demo PRs remain in the Pro Tour repository; a separate disposable repository may be used only for media-upload preflight, as the user allowed. Do not merge this branch into the other experiment or reuse its implementation artifacts; compare outcomes after both runs.
