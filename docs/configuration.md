# Repository configuration, version 1

The future trusted workflow will read `.pro-tour.json` from the authenticated base revision. The current `pro-tour validate-config <path>` command only checks file content; it does **not** authenticate its origin, start an app, connect to a URL, or establish a sandbox. Never treat a successful validation as permission to execute PR code on a credentialed runner.

The [example](../examples/task-board.pro-tour.json) covers the planned baseline's create/edit/status journeys. The sample app and its eventual feature PR are still pending. Its commands are illustrative and have not been run against sample source.

The packaged [Draft 2020-12 schema](../src/pro_tour/config.schema.json) is the structural source of truth. The Python parser adds cross-field checks and returns immutable data with a SHA-256 of the exact input bytes. Files are limited to 64 KiB. Duplicate JSON keys, non-finite numbers, unknown fields, and out-of-range values fail with exit 2. Diagnostics display only known field paths and code-owned explanations, keeping supplied values and unknown key names out of CI logs. Schema validation uses the pinned [jsonschema validator](https://python-jsonschema.readthedocs.io/en/stable/validate/).

| Field | Contract |
| --- | --- |
| `version` | Exactly `1`. |
| `app.root` | Repository-relative POSIX directory, or `.`. Reject absolute paths, dot segments, empty segments, `.git` components, backslashes, and leading dashes. Filesystem/symlink containment remains an extraction/runtime responsibility. |
| `app.install`, `app.start` | Nonempty argument arrays, e.g. `["npm", "ci"]`. `app.build` is optional. Arguments are literal; no implicit shell or variable interpolation. Explicit interpreter commands remain untrusted app execution. |
| `app.url`, `app.port` | Local HTTP URL on `localhost`, `127.0.0.1`, or `[::1]` with the same explicit port (1024–65535). An optional plain path is allowed. Credentials, query strings, fragments, percent encoding, and external origins are rejected. |
| `app.readiness_timeout_seconds` | Integer from 1 to 300. Future runtime must enforce it. |
| `app.public_env` | Up to 32 literal, public string values named `PUBLIC_*`, `VITE_*`, or `NEXT_PUBLIC_*`. No inherited variable lookup or dotenv reference. Each value is limited to 2048 characters and excludes controls. Public names are not a secret detector: never put private values here. |
| `app.allowed_origins` | Exactly the local app origin, without a trailing slash. This is a page-navigation restriction, never a controller/provider network allowlist. |
| `app_paths` | 1–100 repository-relative patterns, including relevant build/dependency files. Planned matching syntax: `*` and `?` within a segment; a whole `**` segment spans directories. Negation, braces, and character classes are rejected. Changed-file matching is not implemented yet. |
| `journeys` | 1–20 unique lowercase slug IDs, each with a descriptive goal and 1–20 checkpoints. Text is bounded and descriptive; it is not executable verifier code. |
| `reset` | `strategy: "fresh-browser"` and descriptive instructions. The initial sample contract resets local browser storage to synthetic seed state. No reset command executes in the controller. |
| `budgets` | Explicit bounded integers as below. These validate configuration; runtime enforcement remains to be implemented. |

| Budget | Range | Meaning |
| --- | --- | --- |
| `install_seconds` | 1–900 | Install/build deadline. |
| `run_seconds` | 30–3600 | Overall run deadline; must cover at least two tour durations. |
| `tour_seconds` | 10–600 | Maximum duration per tour attempt. |
| `actions_per_tour` | 1–100 | Maximum Jev-selected actions per attempt. |
| `provider_calls` | 4–500 | Overall provider request limit, including retries and text. |
| `provider_timeout_seconds` | 1–120 | Per-call deadline, at most `tour_seconds`. |
| `tour_attempts` | 1–3 | Maximum attempts for each of the two tours. |

The integration must load privileged policy from a trusted revision, acquire immutable PR source as data, and launch install/build/start only in the isolated app environment. Browser and app egress must remain separate from trusted Jev, Grok, and upload clients. A PR configuration edit cannot grant mounts, provider destinations, credentials, or controller commands; the schema deliberately exposes none of those settings. Loopback URL mapping between the future app/browser containers must preserve the configured origin without exposing a credential proxy.

No upstream Jev source has been acquired or adapted in this slice. The pristine example and its isolation proof must precede adaptation. `TYPESAFE_API_KEY` remains assigned to the trusted Jev client, `CURSOR_API_KEY` to the Grok 4.7 adapter, and `GH_MEDIA_TOKEN` to the uploader. Neither provider endpoints nor models are configurable in this file. The upstream `TEXT_MODEL*` helper settings and an additional typing model are not enabled.
