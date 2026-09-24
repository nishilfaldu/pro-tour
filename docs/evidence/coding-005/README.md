# Coding visit 005 evidence

This visit addresses review/004's P04 reproducibility objection. The automatic workflow, task board, Jev integration, recording, upload, and playback remain incomplete. No model, image, tool permission, or provider destination was changed.

The test image remains `sha256:cc242f357c6a31ed1e45846755ac873f5867deccb44a496ced261cab2749e9cb`; [the prior image manifest](../coding-004/grok-image-final.json) records the pinned Cursor archive and build inputs. These are local Linux arm64 Docker Desktop checks, not GitHub Actions evidence.

## Diagnosis

| Evidence | Observation |
| --- | --- |
| `review-004-failure-01.json`, `review-004-failure-02.json` | Unmodified copies of the reviewer's failed runs. Both stop at adversarial with `Invalid preflight data`; cleanup is verified. These are review's evidence, not new coding runs. |
| `repro-preflight.json` | A new run of the unchanged checker also exits 1 at adversarial with the same message and verified cleanup. |
| `repro-adversarial.json` | The sanitized final answer from that reproduction: prose followed by the blocked-tools JSON. The receiver accepted the model/tool boundary before capturing this answer; no thought deltas or raw stderr are retained. |
| `message-boundaries.json` | A second, separate live adversarial request. The prose and JSON occupy a single assistant message. Picking the last assistant event cannot solve this failure. All 69 exclusions, the required model, zero tool events, and cleanup are recorded. |
| `regression-red.txt` | Before the fix, the real check orchestration replaying the captured final answer fails its success assertion in 0.06 seconds with the same error. No model is called by this regression. |
| `checks.txt` | After the fix, 250 product tests, 27 imported tests, and 7 visualizer tests pass (284 total). Ruff, skill validation, compilation of 32 imported Python files, and whitespace checks pass. |

The decisive fast reproduction was `json.loads` of the captured final `result`, which raises `JSONDecodeError: Expecting value: line 1 column 1`. The model/client completed successfully; the checker incorrectly required its entire natural-language response to already be bare JSON, without a repair path. Cursor's [output-format reference](https://cursor.com/docs/cli/reference/output-format) documents that the terminal result aggregates assistant text. The captured single-message response is stronger evidence for this specific defect than an inference about multiple messages.

The narrow regression is:

```sh
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked \
  python -m pytest tests/test_grok_preflight.py -q
```

It includes the original failure, exactly one repair, refusal to repair tool/model/canary/credential/permission violations on either attempt, rejection of claimed tool availability, strict plan/field results, retry exhaustion, repair input bounds, safe evidence, and cleanup. The fix preserves strict JSON validation and the original adversarial prompt. It does not parse a JSON substring out of arbitrary prose.

## Live reproduction command

Use a different output path for each run:

```sh
UV_PROJECT_ENVIRONMENT=/tmp/pro-tour-coding-001-venv uv run --locked \
  python scripts/check_grok_preflight.py \
  --image sha256:cc242f357c6a31ed1e45846755ac873f5867deccb44a496ced261cab2749e9cb \
  --output /tmp/grok-005-new.json --secrets-file .env.local
```

Only CURSOR_API_KEY enters the trusted adapter. The other actual credentials and all TEXT_MODEL settings remain excluded. Each report retains every attempted request and a response hash/size, including rejected format attempts; the canonical document appears only after strict validation. No response text from a failed attempt is logged by the production checker. The two explicitly captured diagnostic answers above are synthetic, checked final assistant text, retained to make the original review failure reproducible.

## Repeated live gates

| Report | Adversarial attempt / repair | Plan | Field | Result |
| --- | --- | --- | --- | --- |
| `grok-preflight-01.json` | 25,752 / 5,156 ms | 91,091 ms | 5,930 ms | Passed, cleanup verified |
| `grok-preflight-02.json` | 24,160 / 7,029 ms | 102,886 ms | 3,439 ms | Passed, cleanup verified |
| `grok-preflight-03.json` | 23,381 / 8,563 ms | 121,419 ms | 5,743 ms | Passed, cleanup verified |

All three consecutive runs hit the non-JSON-response case, rejected the first document, and obtained a valid blocked-tools object through one same-model formatting request. Plan and field responses passed on their first attempts. Every original and repair attempt passed the existing model identity, tool-event, credential, canary, permission, and workspace checks. The allowlisted provider destination is still `api2.cursor.sh:443`; attempted GitHub traffic was denied. These passes are bounded runtime observations, not a guarantee of provider availability or perfectly formatted future output. A future second invalid response still fails closed.

`repeated-runs.json` revalidates all nine final documents and all 12 successful-client attempt audits. No owned containers or volumes remain. `command-02.json` and `command-03.json` record the serial repetition commands, times, and exit 0; the first command was invoked directly and returned exit 0 in the coding transcript.

`runtime-inventory.json` records the unchanged image's identity, Linux arm64 architecture, and host-source hashes. The first run launched before whitespace-only Ruff formatting; subsequent runs use the final formatted source. The prior image manifest still supplies the CLI/package/build provenance. No image rebuild or runtime-policy change is necessary for this host-side parser repair.
