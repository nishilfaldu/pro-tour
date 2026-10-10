# Fixtures

Apps used to test the planner and the runtime. Serve one with:

```sh
node fixtures/serve.js fixtures/assignee-board/head 4180
```

`assignee-board/` is a task board whose PR adds an Assignee filter, built to be hard to tour:

- `base/` and `head/` are the app before and after the PR; `pr.diff` is the diff between them.
- The page is rendered by JavaScript with random ids, so `#id` selectors do not work. The filter is a
  custom dropdown whose accessible name changes after each choice and whose option names include
  initials and counts. "Status" labels six controls, and there are two "Clear filters" buttons.
- `head-divs/` is the same app with the dropdown rebuilt from plain divs with no ARIA roles.
  `libvariant/` is the planner input for it: the diff and source without the dropdown component, as if
  it came from a library.
- `gold.tour.js` is a hand-written tour of the PR.

[`experiments/`](../experiments/README.md) describes the runs made against these fixtures.
