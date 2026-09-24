# pro-tour

PR-triggered app walkthroughs: record the main app journeys and a focused tour of the changes in a pull request.

## Sample task board

Run `npm ci`, then `npm start` and open <http://127.0.0.1:4173>. The board starts with three synthetic tasks. Use **Reset demo** before each recording to restore those tasks and clear the status filter. Task changes are stored only in the browser's local storage.

Run `npm test` for the HTTP and real Chrome journey tests. The browser test needs Google Chrome installed locally.

## PR tours

The `Pro Tour` workflow runs on PR open, reopen, and update. It skips changes confined to documentation. For an app change, it checks out the exact PR head into `pr-source`, reads `pro-tour.config.json`, runs the configured install and start commands in a restricted Docker container, and waits for the configured local HTTP URL. The config currently uses `npm ci`, `npm start`, and `http://127.0.0.1:4173/`.

The workflow reads its scripts and `tour-profile.json` from the trusted base revision. The PR app checkout is mounted only into the container. The container receives no GitHub token or Pro Tour credentials, and the local launcher rejects `.env`, `.env.local`, and `.npmrc` in its mount root. Grok 4.7 plans separate full and focused goal sequences. The pinned upstream Jev policy selects browser actions. Its optional typing model is replaced by exact values from `tour-profile.json`; no extra language model writes task text. A separate credential-free process records the Jev tab to MP4. GitHub CLI attaches both videos directly to one PR comment containing only brief labels and the two players.

The sample profile uses its first Jev goal to reset synthetic state before each recording. Adapt `tour-profile.json` when installing the workflow in another repository: describe the app, its main journeys, its changed feature, a repeatable setup goal, and exact text values that may be typed. Store `TYPESAFE_API_KEY`, `CURSOR_API_KEY`, and `GH_MEDIA_TOKEN` as repository Actions secrets. Keep credential files outside the PR checkout.

Jev is installed from unmodified [`browser-use/jev-ultrafast`](https://github.com/browser-use/jev-ultrafast) commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`; its MIT license is in [`licenses/jev-ultrafast-MIT.txt`](licenses/jev-ultrafast-MIT.txt). The integration intercepts Jev's optional `TYPE_TEXT` helper to use configured strings and requires a browser daemon started before the credentialed Jev process.

The imported skills are preserved in [`skills-main/`](skills-main/).

The updated Easy Loop workflow is installed at [`.agents/skills/df-easy-loop-e2e/`](.agents/skills/df-easy-loop-e2e/). Its repo-level model assignments are in [`.diffusion/skills/models.yaml`](.diffusion/skills/models.yaml): Codex Astra xhigh writes the plan and code; Cursor Grok 4.7 xhigh critiques, validates, and reviews. Override those role assignments on experiment branches to compare combinations.
