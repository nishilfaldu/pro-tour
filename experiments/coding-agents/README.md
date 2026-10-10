# Coding agents with only the skill

Can a coding agent, given nothing but the `pro-tour` skill, make a tour of its own change and attach it
to the pull request, without being asked to?

## Setup

For each run, a fresh repository:

- `main`: the app at the PR's base commit, plus the files `pro-tour init` writes (the skill in
  `.agents/skills/` and `.claude/skills/`, and the Feature tours pointer in `AGENTS.md` and `CLAUDE.md`).
- `feature`: the real PR's change, committed.
- `origin`: a local bare repository. A stand-in `gh` (first on PATH) answered `pr create`, `pr view` and
  `pr comment --attach` and kept what was posted; nothing reached GitHub.

The app was already running. The prompt said nothing about tours, only:

> I've finished adding the new Email normalizer tool on this branch (it's committed). The dev server is
> already running at http://127.0.0.1:5301/. Please open a pull request for this branch against main.

(with the feature and URL for each PR). Codex ran as `codex exec -m gpt-6-sol` outside its sandbox,
standing in for the user approving `pro-tour` to run outside it: Chromium cannot start inside Codex's
macOS sandbox. Cursor ran as `cursor-agent -p --force` with its default model.

## Results

All six runs made a tour, recorded it until it passed, committed it, opened the PR and published, and
ended by giving the PR and comment links.

| Agent | PR | Tour | Recordings | Behaviors | Time |
|---|---|---|---|---|---|
| Codex | it-tools #1243, email normalizer | `email-normalizer` | 3 (2 failed, fixed) | 5 | 3.7 min |
| Codex | mermaid #1987, example picker | `sample-diagram-examples` | 4 (2 failed, fixed) | 4 | 9.2 min |
| Codex | mermaid #1918, rename history entries | `rename-history-entries` | 2 | 6 | 9.0 min |
| Cursor | it-tools #1243 | `email-normalizer` | 2 (1 failed, fixed) | 5 | 7.2 min |
| Cursor | mermaid #1987 | `sample-diagram-examples` | 1 | 5 | 5.9 min |
| Cursor | mermaid #1918 | `rename-history` | 1 | 7 | 7.9 min |

Each directory holds the tour the agent committed, the comment it published (`comment.md`) and its
`pro-tour` calls. Times include reading the code and opening the PR.

## Observations

- The skill triggered from "open a pull request" alone, through the description and the `AGENTS.md`
  pointer. Every agent read `pro-tour api` first.
- Tours were named for the feature, not the branch, and committed with the change.
- Mermaid #1987, the PR the built-in planner failed on until its repair context was fixed, passed for
  both agents; the Codex video opens the picker, picks another example, returns to the default and shows
  that a single-example diagram has no picker.
- In one run Codex edited the tour after recording it; `publish` refused the stale recording, and Codex
  recorded again before publishing.
- The two agents chose different but accurate checklists for the same PR (for #1918, Codex included
  renaming Timeline snapshots, Cursor included a blank name being discarded). That checklist is what
  the reviewer judges.
