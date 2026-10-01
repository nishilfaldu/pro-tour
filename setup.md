# Repository setup

These instructions are for developing Pro Tour or running it from a checkout. For installing and using the CLI with your own app, see [README.md](README.md).

## Local environment

Use macOS with Git, Python 3.12+, `uv`, `ffmpeg`/`ffprobe`, an authenticated Codex CLI, and Chrome. Node.js and npm are needed only for the sample app and its tests.

From the Pro Tour checkout:

```sh
uv sync --upgrade --python 3.12
export PATH="$PWD/bin:$PATH"
export PYTHONDONTWRITEBYTECODE=1
```

Run the interactive setup from this checkout:

```sh
uv run --no-sync pro-tour setup
```

It saves keys in this checkout’s ignored `.env.local`. Checkout commands read that file by default; standalone installations use `~/.config/pro-tour/.env.local`. The default model preference is user-wide. For noninteractive development, set `TYPESAFE_API_KEY` and optional `GH_MEDIA_TOKEN` in your environment instead. Use `pro-tour doctor` to repeat prerequisite checks without prompts.

To reuse your open Chrome, follow [Connect your browser](README.md#connect-your-browser). From this checkout in a separate terminal, run `uv run --no-sync pro-tour connect`, approve Chrome’s prompt, and leave the connector running.

You can now use `pro-tour` from an app repository in the terminal where you exported PATH. In another terminal, use this checkout’s absolute `bin/pro-tour` path or export PATH there too. The app must already be running.

## Checks and sample app

```sh
uv run --no-sync python -B scripts/check-release.py
npm --prefix sample-app ci
npm --prefix sample-app test
```

The release check runs Python tests, reports bundled Jev provenance and installed dependency versions, and builds a wheel. The sample app’s JavaScript tests launch a separate headless Chrome and close it afterward. The Pro Tour CLI and live benchmark reuse your existing visible Chrome.

`npm --prefix sample-app start` runs the synthetic task board at <http://127.0.0.1:4173>. Use **Reset demo** between tours. Its package files, JavaScript tests, and Node dependencies live entirely inside `sample-app/`.

The opt-in [benchmark](benchmarks/README.md) exercises the full pipeline and video playback with real, metered Codex and TypeSafe calls:

```sh
uv run --no-sync python -B benchmarks/run.py
```

The release-check and benchmark runners use temporary directories and remove their videos, logs, wheels, and build files on success, failure, or interruption. Add `--keep-artifacts` to either runner to retain debugging output in ignored `.artifacts/`, or `--output <new-directory>` to retain it elsewhere. `.venv/` holds checkout dependencies. Normal `pro-tour record` videos remain saved in the app repository’s `.videos/`.

## Build a standalone wheel

```sh
uv build --wheel
```

This manual build retains its wheel in `dist/` and may leave ignored build files in the checkout. Use the release-check runner above when you want build output cleaned up automatically.

Install the resulting wheel in a dedicated Python 3.12 environment with `uv pip install --upgrade --python <environment-python> <wheel-path>`. Add that environment’s `bin` to PATH. Standalone installations read credentials from `~/.config/pro-tour/.env.local` by default.

Dependencies are defined without project version pins in [pyproject.toml](pyproject.toml). Setup resolves the newest compatible versions, including any constraints declared by dependencies themselves. Run `uv sync --upgrade --python 3.12` to refresh an existing environment. UV generates a local ignored `uv.lock` for subsequent runs; it is not committed or used to constrain standalone installations. Recording never installs or updates dependencies.

Jev's runtime sources and browser snapshot script are bundled unchanged under `src/pro_tour/_vendor/jev_ultrafast/`, with their upstream version and commit in `_provenance.py`. The MIT notice ships in the wheel. This avoids a Git dependency, which PyPI does not accept. Updating Jev means replacing these upstream files, updating provenance, and running the release check and live benchmark.
