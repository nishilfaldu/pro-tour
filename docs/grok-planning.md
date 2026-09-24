# Grok 4.7 planning preflight

The real preflight passes with `grok-4.7-xhigh` through Cursor CLI `2026.09.23-86fc751`. It queries available models, challenges the tool boundary, generates a schema-valid two-tour plan, and obtains a separate synthetic field value from the same model. This is the P04 integration prerequisite. It does not start a PR app or record a tour.

## Reproduce

The tested runtime is Linux arm64 in Docker Desktop on the development Mac. Use Python 3.12.12 and the project's locked environment. Download the matching official CLI archive into a task-local path:

```sh
curl --fail --silent --show-error \
  https://downloads.cursor.com/lab/2026.09.23-86fc751/linux/arm64/agent-cli-package.tar.gz \
  --output /tmp/pro-tour-cursor-2026.09.23.tar.gz

uv run --locked python scripts/prepare_grok_preflight.py \
  --archive /tmp/pro-tour-cursor-2026.09.23.tar.gz --output /tmp/grok-image.json
```

The preparer requires SHA-256 `38d1482c945172926e780206fce8cc51c67dd4f96162bcec680903aa70d80417`. It extracts only into an external temporary directory, builds without credentials, records the image ID, and derives the complete tool exclusion list from that pinned package's protocol enum. No CLI files are installed into the user's home or committed here. The source was acquired from Cursor's official HTTPS download service; the digest is our recorded content pin, not a claim of a separately published signature. Apt packages are not snapshot-pinned, so rebuilds can produce different image IDs.

Replace `IMAGE_ID` with the preparer's immutable image ID and use a new evidence path:

```sh
uv run --locked python scripts/check_grok_preflight.py \
  --image IMAGE_ID --output /tmp/grok-preflight.json --secrets-file .env.local
```

Only the literal `CURSOR_API_KEY` assignment is used. The script reports progress without printing the key or raw model reasoning. Exit 0 requires all three requests to pass, the specified model identity, an unchanged permission policy, an empty workspace, intact canaries, zero tool events, validated documents, and cleanup. A request has a 360-second process deadline; the Grok gateway permits a connection lifetime of 420 seconds so it cannot truncate a valid long response before that deadline. The existing Jev proxy default remains 90 seconds.

## Fixed execution boundary

The client runs unprivileged in a private, networkless container with a read-only root, dropped capabilities, no host mounts, and an empty `/workspace`. A secret-free gateway exposes one Unix socket mounted only by the trusted client. It permits CONNECT only to `api2.cursor.sh:443`, validates DNS answers as public, and connects to the validated numeric address. TLS is not decrypted. Successful listing and all three requests used that destination; background attempts to reach GitHub were denied. No browser or PR-controlled process shares this namespace or socket.

The Cursor key enters through private stdin into the trusted adapter, then only its CLI environment. The other supplied credentials and every `TEXT_MODEL*` variable are absent. Home, data, and cache directories are disposable. Cursor requires writable preferences, so each invocation receives a fresh private copy of the trusted CLI configuration. Its permission policy is compared afterward. The generic hook and its configuration stay immutable under the image's read-only `/opt` and `/etc/cursor` paths. Hook commands explicitly clear their environments.

The pinned CLI receives an empty allowed-tool list and exclusions for all 69 protocol tool variants, including shell variants, file operations, search/fetch, MCP, browser/computer use, and delegation. These switches are internal CLI interfaces, so the version and archive are pinned and the full real gate must be repeated for an upgrade. The immutable `preToolUse` hook also denies every tool, including unknown names, and uses fail-closed behavior. CLI permission rules separately deny shell, reads/writes, web fetch, and MCP. No `--force`, auto-review, or MCP approval flag is used.

The adversarial request asks for synthetic canary reads/writes, shell execution, fetching, and searching. It returned blocked, disclosed no canary, and produced zero tool events; the tools were unavailable rather than individually executed and rejected. A real precredential hook invocation and unit tests independently verify generic denial. Session-start evidence proves the immutable hook loaded with `grok-4.7-xhigh` and no credentials in its environment. The receiver rejects any tool event or unexpected event type instead of accepting a resulting plan.

## Data contract and observations

`src/pro_tour/grok.py` supplies bounded JSON prompts, a strict stream receiver, and plan/field validators. The plan has ordered `app_tour` and `feature_tour` goal arrays. Each goal contains an ID, a description, observable checks, and synthetic text literals. [The schema](../src/pro_tour/schemas/tour-plan.schema.json) bounds every collection and string and rejects extra fields. Duplicate IDs/JSON keys, blank/control-bearing text, invalid field values, malformed output, changed models, and failed boundary checks fail closed. Nothing here selects or executes a browser action.

The final planning fixture produced five app goals covering initial state, creation, editing, status change, and filtering, plus three focused goals demonstrating inclusion/exclusion for Todo, Doing, and Done. The separate field request returned a synthetic task title. These used descriptive fixture data; their UI outcomes have not been exercised against a task-board app.

Model evidence is the CLI's reported `Grok 4.7 256K Extra High` identity plus its session-start slug and the authenticated model listing. It is not an independent attestation of the provider's model weights. Saved evidence contains final documents, usage, timings, model/hook metadata, and zero-tool audit results; raw thought deltas, prompts, session identifiers, and stderr are discarded.

Cursor's [headless interface](https://cursor.com/docs/cli/headless), [permission rules](https://cursor.com/docs/cli/reference/permissions), [generic hooks](https://cursor.com/docs/hooks), and [proxy configuration](https://cursor.com/docs/cli/reference/configuration) informed this implementation. The account rejected the internal workspace-context-exclusion flag, so that flag is not used; physical isolation and empty local configuration provide the required absence of PR instructions/plugins/MCPs. See [visit 004 evidence](evidence/coding-004/README.md) for failures and the successful final gate. GitHub runner compatibility, PR lifecycle isolation, the uploader, production Jev text integration, and recording remain pending.
