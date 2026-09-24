"""Passive profiler: observe pristine function returns; never patch/call Jev.

Only whitelisted decision/history fields go to a controller-private trace.
No frame locals, request headers, environments, or provider keys are serialized.
"""

import json
import sys


def observe(frame, event, result):
    if event != "return":
        return
    module = frame.f_globals.get("__name__")
    name = frame.f_code.co_name
    record = None
    if module == "jev_ultrafast.model" and name == "choose" and isinstance(result, dict):
        fields = (
            "model",
            "choice",
            "operation",
            "target",
            "confidence",
            "usage",
            "latency_ms",
            "raw_answers",
        )
        record = {"event": "decision", **{key: result[key] for key in fields}}
    if module == "jev_ultrafast.agent" and name == "snapshot" and isinstance(result, dict):
        record = {
            "event": "state",
            "status": result["status"],
            "url": result["page"]["url"],
            "title": result["page"]["title"],
            "history": result["history"],
            "text_calls": len(result["text_calls"]),
        }
    if record is not None:
        with open("/tmp/jev-trace.jsonl", "a", encoding="utf-8") as stream:
            stream.write(json.dumps(record) + "\n")


sys.setprofile(observe)
