# Coding visit 004 evidence

P04 is proposed complete. The full automatic PR-to-videos product remains incomplete.

| Artifact | Observation |
| --- | --- |
| `grok-image-final.json` | Final image `sha256:cc242f357c6a31ed1e45846755ac873f5867deccb44a496ced261cab2749e9cb`, pinned official Cursor archive, all 69 excluded protocol tool types, and image support-file hashes. |
| `model-availability.json` | Real Cursor authentication and availability of exactly `grok-4.7-xhigh`; only the Cursor credential was passed. Model listing did not invoke the other listed models. |
| `grok-preflight.json` | Full real gate passes: adversarial blocked response, validated two-tour plan, validated text value, exact requested model/CLI identity, zero tool events, immutable-hook audit, unchanged permissions, empty workspace, intact canaries, only `api2.cursor.sh` allowed, cleanup verified. |
| `runtime-inventory.json` | Final image's runtime versions, local Linux runner identity, current support-source hashes, and revalidated final plan/field documents. |
| `checks.txt` | 221 product tests plus 27 imported tests and 7 visualizer tests: 255 pass. Ruff, skill validation, 32 imported Python compilation checks, and whitespace checks pass. No model is invoked by the standard set. |

Failures remain evidence, not acceptance:

- Python urllib's initial archive download received HTTP 403; downloading the same official URL with curl succeeded. The pinned SHA-256 is `38d1482c945172926e780206fce8cc51c67dd4f96162bcec680903aa70d80417`.
- `field-attempt-01.json`: Cursor needed to save preferences and failed on the read-only configuration directory. Runtime now gets a fresh private configuration copy; the mandatory hook and its source remain read-only, and permissions are verified unchanged.
- `field-attempt-02.json`: the account rejected the internal workspace-context-exclusion flag. It was removed; the isolated empty workspace/home and lack of PR files/plugins/MCPs remain in force. No model substitution occurred.
- `grok-preflight-attempt-01.json`: the adversarial request passed, but planning timed out at 180 seconds. A diagnostic observed one reconnect during planning while the proxy still had a 90-second connection lifetime. The final Grok-only timeout policy aligns a 360-second process deadline with a 420-second tunnel limit. The successful final plan took 94,760 ms, exceeding the old tunnel limit.

Earlier image manifests are retained as `grok-image-attempt-01.json`, `grok-image-attempt-02.json`, `grok-image-attempt-03.json`, and `grok-image.json` (the first image with all 69 exclusions, before timeout alignment). Use **grok-image-final.json** for validation.

The final model calls took 21,222 ms (adversarial), 94,760 ms (planning), and 6,330 ms (field). The plan contains five app goals and three feature goals with visible positive/negative filter checks. No browser actions or recordings were performed by these requests. The existing TypeSafe credential and GitHub media credential were not used in this visit.

The [reproduction guide](../../grok-planning.md) explains the internal CLI flags, immutable hook, data contract, and limits. This proof is on Linux arm64 in Docker Desktop, not GitHub Actions. P05 and the remaining automatic workflow, task board, action loop, recorder, uploader, real PR, and playback work remain open.
