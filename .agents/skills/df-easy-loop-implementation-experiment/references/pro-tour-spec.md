# Pro Tour frozen product requirements

These requirements consolidate the completed Easy Loop interview from 2026-09-24. They are inputs to this independent implementation experiment. The original interview artifact is `/Users/happyhome/.easyloop/runs/20260924_122700/agents/requirements/004/requirements.md`; this copy removes old branch and development-model assignments. There are no pending interview answers.

## Product

- Build an automatic GitHub Actions workflow for app-changing PRs. Developers add the workflow and configuration to a repository. The workflow checks out the PR revision, runs configured install/start commands, waits for the configured local app URL, and generates tours automatically on PR open and update. A deployed preview is not required.
- Create **two separate screen recordings** for each app-changing PR: a tour of the app's main journeys that includes the PR change, and a focused tour of only the new or changed feature.
- Upload both recordings directly to the PR as playable inline videos. The PR comment contains only the two videos and brief labels. A local file or generic artifact link is insufficient.
- Build a synthetic-data task-board sample in this same repository. Its main journeys are create task, edit task, and change status. Create a real feature PR adding status filtering. The full tour must show those journeys and filtering; the focused tour must show the filter including matching-status inclusion and other-status exclusion. Keep sample state repeatable.

## Browser, models, and recording

- Use `browser-use/jev-ultrafast` for browser action selection. Run its unmodified upstream example with a real selected action before integration changes. Clone or refactor it only for a demonstrated API need; retain its license and attribution and test adaptations.
- Pro Tour calls Grok 4.7 programmatically to plan the tours. Jev selects browser actions. Record the browser separately from Jev's action loop.
- Do not invoke Claude or Grok Fast. Do not add another language model for typing without discussing it with the user. Text entered during journeys must have an approved provenance.

## Credentials and execution

- The required credentials are `TYPESAFE_API_KEY`, `CURSOR_API_KEY`, and `GH_MEDIA_TOKEN`; use the last for video uploads. Never commit or print values.
- Keep all three credentials out of the sample app, browser session, and PR-controlled install/build/start commands, including inherited environment, readable files, and credential-bearing services. Run credentialed planning, Jev action selection, and upload in trusted contexts separate from PR-controlled code. Verify the boundary with evidence.

## Delivery and acceptance

- Test the complete automatic PR-event-to-two-videos flow on a real sample PR using the actual Grok planner, Jev, recorder, and uploader. Record the tested PR revision and workflow run. Mocked integrations alone do not satisfy acceptance.
- Watch both generated videos for coverage and usability. Confirm both play in the PR conversation and that the comment contains only two videos and brief labels.
- Exercise a docs-only PR that skips tour generation. Test a subsequent app change or PR update so behavior on updates is observed.
- Run meaningful tests, runtime validation, and independent review until technical objections are resolved by evidence. Route genuine product disagreements to the user.
- Commit and push finished work on `exp/sol-low-author-grok47-low-reviewer`. Keep this experiment isolated from `exp/astra-xhigh-author-grok47-xhigh-reviewer`.

The first release is the configured local-app GitHub Actions mode. Framework, layout, status names, seeding, recorder implementation, readiness handling, and isolation mechanism are implementation choices; decide and test them without asking repeat interview questions.
