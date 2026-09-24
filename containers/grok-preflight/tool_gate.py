"""Immutable, fail-closed Cursor hook. Never persist tool arguments or context."""

import json
import os
import re
import sys
from pathlib import Path


def decide(data: dict) -> tuple[dict, dict]:
    event = data.get("hook_event_name")
    name = data.get("tool_name", "unknown")
    name = (
        name
        if isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", name)
        else "unknown"
    )
    record = {
        "event": event
        if event in {"sessionStart", "preToolUse", "postToolUse", "postToolUseFailure"}
        else "unknown",
        "tool": name,
    }
    if event == "sessionStart":
        record.update({key: data.get(key) for key in ("model", "model_id", "model_params")})
        return {"continue": True}, record
    record["decision"] = "deny"
    return {"permission": "deny", "agent_message": "Pro Tour permits no agent tools."}, record


def main():
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError
        response, record = decide(data)
        record["credential_names"] = [
            key
            for key in ("CURSOR_API_KEY", "TYPESAFE_API_KEY", "GH_MEDIA_TOKEN")
            if key in os.environ
        ]
        with Path("/tmp/grok-hook-audit.jsonl").open("a") as stream:
            stream.write(json.dumps(record) + "\n")
        print(json.dumps(response))
        return 0
    except (OSError, ValueError, TypeError):
        print('{"permission":"deny","continue":false}')
        return 2  # Cursor's documented blocking exit status; failClosed is also set.


if __name__ == "__main__":
    raise SystemExit(main())
