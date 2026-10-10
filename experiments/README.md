# Experiments

How the tour rules were chosen and how tours held up on real apps. These runs used a built-in planner:
Codex (`codex exec`, read-only, no tools, a JSON schema for the answer) writing and repairing tours
from the diff. That planner has since been removed. The coding agent that makes the change now writes
the tour through the `pro-tour` skill, but the findings shaped what the skill and the tour API tell it,
and the runtime still produces the failure context described here. Samples are small, so treat the
numbers as directional.

## 1. Is the diff plus app source enough, without a live page?

The planner gets the PR diff, the app source and the tour API, and never sees the running page before
writing the tour. On a repair it gets the failure message and, from experiment 2 on, the visible DOM at
the failure.

Fixture: [`fixtures/assignee-board`](../fixtures/assignee-board), a task board whose PR adds an Assignee
filter, built to be awkward. It is rendered by JavaScript with random ids. The filter is a custom
dropdown whose accessible name changes after each choice, and whose option names include initials and
counts. "Status" labels six controls, and there are two "Clear filters" buttons.

| Planner input | Passed first try | Passed in the end |
|---|---|---|
| Dropdown source visible | 4/5 | 5/5 after one repair from the error alone |
| Dropdown source hidden, standard ARIA listbox | 2/3 | 3/3 after one repair from the error alone |
| Dropdown source hidden, plain divs with no roles | 0/3 | see experiment 2 |

When a component's source is visible, or it follows a standard pattern, the code is enough. When
neither is true, the planner has to see the page, and only after a failure.

## 2. What to show the planner when a tour fails

The div dropdown with its source hidden; two repair rounds per arm.

| Repair context | Passed |
|---|---|
| Error message only | 0/3 |
| Error plus Playwright ARIA snapshot | 0/3 |
| Error plus visible DOM excerpt | 2/3 |

The ARIA snapshot flattens role-less divs into one line of text with spaces that are not in the DOM, so
exact-text locators written from it never match. The repair prompt now carries the full Playwright error
(strict-mode errors list every match) plus a pruned DOM of visible elements.

## 3. Steps must prove something

The first tours had steps that only asserted what was already on screen, and `expectHidden` passed for
elements that never existed. Steps now declare their checks; the runtime samples each check before the
actions and after each one, and fails a step unless one check went from false to true. A hidden check
must have been visible at some point in the step. Filler steps disappeared. The PR's empty state was
still shown in only 2 of 5 tours, which led to experiment 4.

## 4. Coverage: list the behaviors first

A separate call lists the user-visible behaviors the diff adds, one observable outcome per item. The
tour must set `meta.behaviors` to that list and cover each behavior with a passing step, and the PR
comment shows each behavior with the step that proves it. The empty state was then listed and shown in
5 of 5 tours. Whole-pipeline runs needed about two repairs on average; every remaining failure was a
planner mistake (the fixture's duplicate labels, losing track of page state), none was an app bug.

## 5. Model comparison

Five fresh agent runs per cell, up to three repairs each. "Visible": the planner sees all app source.
"Hidden-divs": the dropdown's source is hidden and it renders plain divs. Logs and the tours each run
wrote are in [`model-comparison/`](model-comparison).

| Model, effort | Scenario | Passed | First try | Avg repairs | Median wall time | Model s/call |
|---|---|---|---|---|---|---|
| gpt-6-luna | visible | 4/5 | 1/5 | 1.8 | 171s | 18 |
| gpt-6-luna, high | visible | 3/5 | 0/5 | 1.8 | 217s | 31 |
| gpt-6-sol | visible | 5/5 | 3/5 | 0.4 | 136s | 32 |
| **gpt-6-sol, high** | visible | **5/5** | **5/5** | **0.0** | 143s | 44 |
| gpt-6-luna | hidden-divs | 3/4* | 0/4 | 2.5 | 184s | 14 |
| gpt-6-luna, high | hidden-divs | 4/5 | 0/5 | 2.2 | 257s | 31 |
| gpt-6-sol | hidden-divs | 5/5 | 0/5 | 1.4 | 217s | 35 |
| **gpt-6-sol, high** | hidden-divs | **5/5** | 0/5 | **1.2** | 250s | 49 |

\* One run crashed when Chrome took more than 180s to launch with five recordings in parallel. Such
failures are now retried without spending a repair.

Decision rule, fixed before reading the results: highest pass rate, then fewest repairs, then wall time.
The default became gpt-6-sol at high effort. High effort did not help gpt-6-luna.

## 6. Replay stability

A saved tour has to pass every time it is replayed, with no model. On the final runtime:

- the 34 passing tours from the model comparison, written by both models against both fixture
  variants, plus the hand-written gold tour: 35/35 passed on replay;
- the nine passing it-tools tours, replayed twice each: 18/18 (after one transient-feedback flake was
  fixed, see [`it-tools/`](it-tools/README.md)).

## 7. Real apps

- [`it-tools/`](it-tools/README.md): three merged PRs from
  [CorentinTh/it-tools](https://github.com/CorentinTh/it-tools) (Vue), which led to the focused
  context for large apps.
- [`mermaid-live-editor/`](mermaid-live-editor/README.md): three merged PRs from
  [mermaid-js/mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor) (SvelteKit), which
  led to the failure DOM leading with the last action's region and open popups.
