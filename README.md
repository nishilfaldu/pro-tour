# pro-tour

PR-triggered app walkthroughs: record the main app journeys and a focused tour of the changes in a pull request.

## Sample task board

Run `npm ci`, then `npm start` and open <http://127.0.0.1:4173>. The board starts with three synthetic tasks. Use **Reset demo** before each recording to restore those tasks and clear the status filter. Task changes are stored only in the browser's local storage.

Run `npm test` for the HTTP and real Chrome journey tests. The browser test needs Google Chrome installed locally.

## PR preflight

The `Pro Tour` workflow runs on PR open, reopen, and update. It skips changes confined to documentation. For an app change, it checks out the exact PR head into `pr-source`, reads `pro-tour.config.json`, runs the configured install and start commands in a restricted Docker container, and waits for the configured local HTTP URL. The config currently uses `npm ci`, `npm start`, and `http://127.0.0.1:4173/`.

The workflow reads its scripts from the trusted base revision. The PR app checkout is mounted only into the container. The container receives no GitHub token or Pro Tour credentials, and the local launcher rejects `.env`, `.env.local`, and `.npmrc` in its mount root. This preflight does not yet plan, record, or upload tours.

The imported skills are preserved in [`skills-main/`](skills-main/).

The updated Easy Loop workflow is installed at [`.agents/skills/df-easy-loop-e2e/`](.agents/skills/df-easy-loop-e2e/). Its repo-level model assignments are in [`.diffusion/skills/models.yaml`](.diffusion/skills/models.yaml): Codex Astra xhigh writes the plan and code; Cursor Grok 4.7 xhigh critiques, validates, and reviews. Override those role assignments on experiment branches to compare combinations.
