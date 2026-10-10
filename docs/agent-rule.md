# Feature tours for agent-written changes

Paste the section below into your app repository's `AGENTS.md` (or `CLAUDE.md`, `.cursor/rules`, and so on)
so coding agents ship a tour with every user-visible change. Reviewers then get a captioned video and a
checklist of what the change does, without running the app.

---

## Feature tours

When a change adds or changes something a user can see or do in the app, commit a feature tour with it.

1. Start the app locally (for example `pnpm dev`) and note its URL.
2. Commit your change, then run:

   ```sh
   pnpm exec pro-tour tour --url http://localhost:5173
   ```

   This lists the behaviors your diff adds, writes `.tours/<branch>.tour.js`, records it and repairs it
   until every check passes. If a tour for this branch already exists, it is replayed first and only
   repaired if it no longer passes.
3. Read the generated tour and its report in `.videos/` (`<branch>-vN.md`). Check that the
   behaviors listed under "What this PR does" match what you changed. If one is wrong or missing, fix the
   `meta.behaviors` entries and the step that covers them, and run step 2 again.
4. Commit `.tours/<branch>.tour.js` with the change. Do not commit `.videos/`.

If the tour fails and the failure is a real bug in your change, fix the change, not the tour. Never
weaken a check so that a broken behavior passes.

When you write or edit a tour by hand, follow the tour API in `node_modules/pro-tour/src/tour-api.md`:
every step declares the checks that prove what its actions changed, and every behavior in
`meta.behaviors` must be covered by a passing step.
