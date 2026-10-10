---
name: pro-tour
description: Record a captioned video tour of a user-visible change and attach it to its pull request, so reviewers can watch the change working instead of running the app. Use after making a change users can see or do in the app, before opening or updating its PR, or when asked for a feature tour or demo video. Not for refactors, backend-only, dependency, test or documentation changes.
---

# Feature tours

A feature tour is a short Playwright script, committed in `.tours/`, that demonstrates what a change
does. `pro-tour run` records it as a video with a visible cursor, step captions and on-screen checks.
`pro-tour publish` posts the video to the pull request together with a checklist of the behaviors the
change adds. The reviewer reads the checklist, then watches the video to see each behavior working.

## When to make one

- The change adds, changes or removes something a user can see or do in the app.
- The change works, and you are about to open or update its pull request.

Skip it for refactors, backend-only, dependency, test and documentation changes, or when the user says
not to.

## Steps

1. **Run the app** if it is not running, the way the project starts it (see `package.json` scripts or
   the README), and note its URL.
2. **Choose the tour file**: `.tours/<feature>.tour.js`, named for the feature as a user sees it, in
   kebab-case (`assignee-filter`, not `add-dropdown-v2` or the branch name). If a tour for this feature
   already exists, update it rather than adding a second one. If the change removes a feature, delete
   its tour.
3. **Write `meta.behaviors` first**: each thing this change lets a user see or do, one observable outcome
   per entry, in words a reviewer would use. Include new states the change introduces, such as empty
   states, errors and resets. Leave out what the app already did before the change. This list is what the
   reviewer checks the change against, so make it complete and accurate.
4. **Write the steps.** Run `{{run}} pro-tour api` for the tour API. Each behavior must be covered by a
   step whose checks prove it.
5. **Record it**: `{{run}} pro-tour run .tours/<feature>.tour.js --url <app url>`. It starts a headless
   browser and opens the app's URL. If your sandbox blocks either (exit code 3, "The browser could not
   start"), ask the user to let you run `pro-tour` outside the sandbox; it is not a problem with the tour.
6. **If it fails**, read the failure file the command names: the full error and the visible DOM where it
   stopped. Fix the tour and run it again. If the failure is a real bug in your change, fix the change
   instead. After about three failed attempts, stop and tell the user what is failing.
7. **Commit the tour** with the change.
8. **Publish**: open or update the pull request, then run `{{run}} pro-tour publish`. It posts the video
   and checklist of every tour the pull request changed and hides older videos of the same tours. Give
   the user the comment link.

## Rules

- Never weaken a check, drop a behavior or skip a step to make a tour pass. A tour that fails because the
  change is broken is a correct result: fix the change, or tell the user.
- Do not publish a failed tour (`publish` refuses one unless given `--allow-failed`).
- Keep tours short: 3 to 7 steps, each one visible action and the checks that prove what it did.
- The recording shows your local app and data. Do not put secrets or personal data on screen.

## Commands

| Command | What it does |
|---|---|
| `{{run}} pro-tour api` | Print the tour API |
| `{{run}} pro-tour run <file.tour.js> --url <url>` | Record a tour; prints the video, the result and, on failure, the failure file |
| `{{run}} pro-tour publish [<tour>...]` | Post the latest recording of each tour this PR changed (or the named tours); `--dry-run` prints the comment instead |
| `{{run}} pro-tour doctor` | Check the browser, ffmpeg and GitHub CLI |

Exit codes: 0 passed, 1 a tour failed, 2 usage or setup error, 3 recording failed (app unreachable,
browser or encoder).
