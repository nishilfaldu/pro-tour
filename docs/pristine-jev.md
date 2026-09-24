# Pristine Jev preflight

The unchanged upstream example passed on 2026-09-24. It requested `jev-latest`, received `jev-1.13.0`, clicked **Learn more** on `https://example.com/`, and finished at `https://www.iana.org/help/example-domains`. There was one executed click and no typing. This establishes the pristine-example prerequisite; it is not a PR tour or a recording.

## Reproduce

Use Python 3.12.12, uv 0.9.21, and a local Linux Docker daemon. From the repository root, with the project's locked environment active:

```sh
uv run --locked python scripts/prepare_jev_preflight.py --output /tmp/jev-image.json
```

The script acquires the immutable upstream archive in an external temporary directory, verifies its archive digest, exports hashed runtime dependencies from its unchanged `uv.lock`, and builds a secret-free image. It prints the immutable image ID and records the external baseline path and all 40 file hashes. No integration clone, source patch, or upstream file is added to this repository. Debian package versions are recorded for the tested image; the apt repository is not snapshot-pinned, so a later build can produce another image ID.

Use that image ID in place of `IMAGE_ID` below. Every evidence output path must be new:

```sh
# No actual credentials: namespace, canary, fixture, egress, and spawn-denial gates.
uv run --locked python scripts/check_jev_pristine.py \
  --image IMAGE_ID --output /tmp/jev-boundary.json

# Runs the same gates before reading only the literal TYPESAFE_API_KEY assignment.
uv run --locked python scripts/check_jev_pristine.py \
  --image IMAGE_ID --output /tmp/jev-example.json --secrets-file .env.local

# Must exit 1, before reading even this deliberately missing credential file.
uv run --locked python scripts/check_jev_pristine.py \
  --image IMAGE_ID --output /tmp/jev-negative.json --negative-control \
  --secrets-file /tmp/pro-tour-deliberately-absent-credential-file
```

Without `--secrets-file`, exit 0 means `boundary-only`; it does not mean the example or authentication passed. With credentials, acceptance requires successful model metadata, a Jev-selected click, the expected final destination, `done`, zero text calls, unchanged source, and verified cleanup. Provider failures produce a failed report with generic diagnostics. The preflight has a 180-second example deadline.

## Credential and network boundary

The browser and controller use separate unprivileged containers with `network=none`, private PID/filesystem namespaces, read-only roots, dropped capabilities, no host mounts, and resource limits. A third, secret-free gateway exposes only two Unix sockets. Its browser socket permits CONNECT to `example.com`, `iana.org`, and `www.iana.org` on port 443. Its provider socket permits only `api.typesafe.ai:443`. It validates every DNS answer as public and connects to the numeric address it validated. TLS is passed through without decryption or request logging.

Only the browser mounts the public socket; only the controller mounts the provider socket. The browser runs Chromium with a fresh disposable profile and starts the installed, pinned `browser-harness==0.1.13` daemon using supported `BU_CDP_URL` and `BH_RUNTIME_DIR` settings. The controller connects through the harness's Unix socket. A per-process seccomp filter denies clone/clone3/fork/vfork before the example starts, so upstream `ensure_daemon()` cannot launch a credential-inheriting fallback. A real missing-harness test verifies this failure path before the key is read.

The key enters a trusted loader through private stdin, then only the example process environment. It is absent from Docker's configured environment, image layers, command arguments, and the browser/harness/gateway. The example has neither the other two real credentials nor any `TEXT_MODEL*` settings. Earlier canary processes deliberately carry synthetic values under the three credential names; those probes are identified separately from the actual example's environment metadata.

Chromium uses `--no-sandbox` inside the restricted container, as in the earlier isolation fixture. These tests prove the container boundary, not Chromium's renderer sandbox. The fixture proxy is preflight-specific; production PR execution, dependency downloads, Grok/GitHub routes, and an actual Actions runner remain unverified.

## Unchanged execution and observation

Inside the controller, the executed command is exactly:

```sh
python examples/run.py --url https://example.com/ \
  --goal "Click the Learn more link to open IANA's Example Domains page, then finish. Do not type."
```

`PYTHONPATH` points to the pristine source and a separate, passive `sitecustomize.py` profiler. It observes function returns and serializes whitelisted model/decision/history fields; it does not replace functions, edit source, make choices, or inject actions. The original example's stdout is retained separately. The complete source-file comparison is checked before and after execution. The TypeSafe selector, target validation, freshness checks, action budget, and missing-text-key failure remain upstream code.

See [visit 003 evidence](evidence/coding-003/README.md). This preflight does not add a typing model or complete the Grok, recorder, uploader, or automatic workflow integration.
