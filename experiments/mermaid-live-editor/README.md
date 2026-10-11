# A second real app: mermaid-live-editor

[mermaid-js/mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor) is a SvelteKit app
with shadcn-svelte (bits-ui) components, a Monaco code editor and a live diagram preview. It runs in
the browser with no backend. Three recent merged PRs, each a different kind of change, were toured with
the default settings (gpt-6-sol, high effort, up to three repairs):

| PR | Change | Diff |
|---|---|---|
| [#1918](https://github.com/mermaid-js/mermaid-live-editor/pull/1918) | Rename history entries | 4 files, +122/-11 |
| [#1987](https://github.com/mermaid-js/mermaid-live-editor/pull/1987) | Example picker dropdown on sample diagrams | 3 files, +87/-27 |
| [#2045](https://github.com/mermaid-js/mermaid-live-editor/pull/2045) | Remove a retired option from the Share dialog | 3 files, +11/-17 |

Method as for [it-tools](../it-tools/README.md): a worktree at each merge commit, `base-<n>` at its
first parent, `pnpm install --frozen-lockfile --ignore-scripts` under the Node version the repository
requires (24.16, from its `.nvmrc`), `vite dev` per PR, then `pro-tour tour --base base-<n>`.

## Results

| Run | Passed | Repairs | Wall time | Input tokens |
|---|---|---|---|---|
| #1918 | ✓ | 1 | 269s | 229k |
| #1987 | ✗ | 3 (budget spent) | 455s | 384k |
| #2045 (a removal) | ✓ | 0 | 119s | 55k |
| #1987, after the fix below | ✓ | 1 | 197s | 227k |
| #1987, after the fix below | ✓ | 0 | 180s | 149k |

The four passing tours each replayed 2/2 with no model.

### Why #1987 failed, and the fix

The PR adds an arrow beside a diagram type with several examples, which opens a bits-ui popover listing
them. Only one type in the installed example data (Wardley Maps) has more than one example, and the
popover's content has no `dialog` role. The first tour assumed it did. Each repair got the failure plus a
DOM excerpt, but the excerpt was the first 12,000 characters of the page, and on this page (a banner,
the Monaco editor, the rendered diagram) that ended before the Sample Diagrams panel. Three repairs
never saw the popover.

The excerpt now leads with the region around the element the tour last acted on and with the last
elements in `<body>` (where popovers, menus and dialogs mount), then fills with the rest of the page.
With that, the repair saw the open popover and its four example buttons, and #1987 passed twice.

### What the tours show

- #1918: rename with Enter, cancel with Escape, a whitespace-only name keeps the original, long names
  are truncated with the full name on hover, and Timeline snapshots can be renamed too.
- #1987: the arrow opens the titled examples, default first; a non-default example replaces the editor
  code and the rendered diagram; picking the default restores both.
- #2045: the Share dialog no longer shows the retired section or offers its URL. A removal is shown by
  opening the dialog and checking what is no longer there.
