# Repository setup

These instructions are for developing Pro Tour or running it from a checkout. For installing and using the CLI with your own app, see [README.md](README.md).

## Local environment

Use macOS with Python 3.12+, `uv`, `ffmpeg`/`ffprobe`, an authenticated Codex CLI, and Chrome. Node.js is needed only for the sample app and its tests.

From the Pro Tour checkout:

```sh
uv sync --frozen --python 3.12
export PATH="$PWD/bin:$PATH"
```

Put `TYPESAFE_API_KEY` in this checkout’s ignored `.env.local`. For publishing, also provide `GH_MEDIA_TOKEN` and authenticated `gh` with support for `gh pr comment --attach`.

```sh
uv run pro-tour doctor
```

To reuse your logged-in Chrome, enable remote debugging at `chrome://inspect/#remote-debugging`. From this checkout in a separate terminal, run `uv run pro-tour connect`, approve Chrome’s prompt, and leave the connector running.

You can now use `pro-tour` from an app repository in the terminal where you exported PATH. In another terminal, use this checkout’s absolute `bin/pro-tour` path or export PATH there too. The app must already be running.

## Checks and sample app

```sh
uv run python scripts/check-local-release.py
npm ci
npm test
```

The release check runs Python tests, checks the dependency lock, and builds a wheel. The JavaScript tests include a real Chrome journey.

`npm start` runs the synthetic task board at <http://127.0.0.1:4173>. Use **Reset demo** between tours.

The opt-in [benchmark](benchmarks/README.md) exercises the full pipeline and video playback with real, metered Codex and TypeSafe calls:

```sh
uv run python benchmarks/run.py
```

`.artifacts/` holds ignored benchmark runs and release artifacts. `.venv/` holds checkout dependencies. Keep credentials and generated recordings out of tracked files.

## Build a standalone wheel

```sh
uv build --wheel
```

Install the resulting wheel in a dedicated Python 3.12 environment with `uv pip install --python <environment-python> --constraint requirements-runtime.lock <wheel-path>`. Add that environment’s `bin` to PATH. Standalone installations read credentials from `~/.config/pro-tour/.env.local` by default.

Dependencies and Jev’s exact commit pin are defined in [pyproject.toml](pyproject.toml); `uv.lock` and `requirements-runtime.lock` preserve the resolved versions.
