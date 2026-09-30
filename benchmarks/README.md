# Local pipeline benchmark

Run from the trusted Pro Tour checkout after `uv sync --frozen` and `pro-tour connect`:

```sh
uv run python benchmarks/run.py
uv run python benchmarks/run.py --cases delayed-search-empty-recovery cancel-unsaved-edit
uv run python scripts/check-local-release.py
```

This is an opt-in suite with real Codex (`gpt-6-luna` by default), TypeSafe Jev, Browser Harness,
and the production MP4 recorder. It starts only its own dependency-free synthetic fixture server;
the product CLI does not start app code. It never starts Chrome and never publishes automatically.
The fixture is the same Fieldnotes sample app, extended with delayed search, empty states, forms,
cancellation, and a synthetic HTTP-only demo session cookie. Its independent event oracle checks
actual state changes, including session reuse across newly owned tabs. It does not change the
product's outcome-check rules. No real login credentials are entered or exported.

Each case records one version, decodes the MP4 fully, and opens its own Chrome player to verify
playback reaches the end. Playback tabs may become foreground and are closed afterward. Fixture
servers and temporary browser connections are stopped in `finally`; an existing shared connector
is left alive for its owner. Output defaults to a new ignored `.artifacts/benchmarks/<timestamp>/`
directory. Do not reuse an output directory. Reports include task completion, false success,
video playability, duration, provider token usage, and preserved version paths. Dollar costs remain
unknown because provider billing totals are unavailable. Runs make paid/provider-metered calls.

Cases:

- Create a task, edit its name/details/status, then show filter inclusion and exclusion.
- Search through a delayed update, clear results, demonstrate a no-match state, and recover.
- Cancel an unsaved edit, verify the original task, filter To do, then restore All statuses.

The local regression suite also tests ambiguous browser discovery, stale/private connector metadata,
capture/input serialization, fork-base inference, process cleanup, read/model retries, and upload
reconciliation. Live publishing, repeat recordings, missing PRs, encoder failure, and upload failure
are separate release validation steps against a real PR; the synthetic benchmark never posts to GitHub.
Those checks must include playing the saved video and the inline GitHub player. A successful upload
alone is insufficient. Existing BrowserGym/browser-use benchmarks are not integrated.

Release target: macOS, Python 3.12, existing visible Chrome, localhost, synthetic data. This small suite
is a regression signal, not a broad reliability estimate. Retain failing runs when diagnosing changes.
Do not call a release ready if any case falsely reports success or its video cannot be played.
