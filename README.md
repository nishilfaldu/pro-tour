# pro-tour

PR-triggered app walkthroughs: record the main app journeys and a focused tour of the changes in a pull request.

## Sample task board

Run `npm ci`, then `npm start` and open <http://127.0.0.1:4173>. The board starts with three synthetic tasks. Use **Reset demo** before each recording to restore those tasks and clear the status filter. Task changes are stored only in the browser's local storage.

Run `npm test` for the HTTP and real Chrome journey tests. The browser test needs Google Chrome installed locally.

The imported skills are preserved in [`skills-main/`](skills-main/).

The updated Easy Loop workflow is installed at [`.agents/skills/df-easy-loop-e2e/`](.agents/skills/df-easy-loop-e2e/). Its repo-level model assignments are in [`.diffusion/skills/models.yaml`](.diffusion/skills/models.yaml): Codex Astra xhigh writes the plan and code; Cursor Grok 4.7 xhigh critiques, validates, and reviews. Override those role assignments on experiment branches to compare combinations.
