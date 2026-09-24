"""Run upstream Jev with plan-authored text and a separate recorder process."""
import argparse
import json
import os
import select
import subprocess
import time
from pathlib import Path

import jev_ultrafast.agent as jev_agent
import jev_ultrafast.browser as jev_browser
from browser_harness.admin import require_existing_daemon
from jev_ultrafast import Agent


def planned_text(values):
    remaining = {label.casefold(): list(items) for label, items in values.items()}

    def provide(context):
        field = str(context["field"]["label"]).casefold()
        matches = [label for label in remaining if label in field and remaining[label]]
        if len(matches) != 1:
            raise ValueError(f"No unique plan-authored value for field {context['field']['label']!r}")
        value = remaining[matches[0]].pop(0)
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Invalid plan-authored field value")
        return value, {"model": "configured-tour-profile", "latency_ms": 0, "usage": {}}

    return provide


def run_tour(url, goals, values, output, cdp_url):
    if not isinstance(goals, list) or not goals or not all(isinstance(goal, str) and goal.strip() for goal in goals):
        raise ValueError("Expected a nonempty list of tour goals")
    jev_agent.field_text = planned_text(values)
    # Never let a credentialed Jev process spawn a browser daemon or Chrome.
    jev_browser.ensure_daemon = require_existing_daemon
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with Agent(url, goals[0]) as agent:
        # Repeatable-state setup is Jev-selected and completes before recording.
        for state in agent.run():
            pass
        if agent.state["status"] != "done":
            raise RuntimeError("Jev could not reset the demo state")
        recorder = subprocess.Popen(
            ["node", str(Path(__file__).with_name("record-cdp.js")), cdp_url, url, str(output)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            env={"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "")},
        )
        try:
            if not select.select([recorder.stdout], [], [], 20)[0]:
                raise RuntimeError("Recorder readiness timed out")
            if recorder.stdout.readline().strip() != "READY":
                raise RuntimeError("Recorder did not become ready")
            time.sleep(1)
            for goal in goals[1:]:
                before = len(agent.state["history"])
                agent.state["goal"] = goal
                agent.state["status"] = "ready"
                for state in agent.run():
                    pass
                if agent.state["status"] != "done":
                    raise RuntimeError(f"Jev tour stopped with {agent.state['status']} at goal {goal!r}")
                if len(agent.state["history"]) == before:
                    raise RuntimeError(f"Jev selected no action for goal {goal!r}")
                time.sleep(1)
            if not agent.state["history"]:
                raise RuntimeError("Jev selected no browser actions")
            time.sleep(2)
            output.with_suffix(".trace.json").write_text(json.dumps(agent.state["history"], indent=2))
            return [{"kind": step["kind"], "action": step["action"], "operation": step["operation"], "text_source": step["text_helper"]} for step in agent.state["history"]]
        except Exception:
            output.with_suffix(".trace.json").write_text(json.dumps(agent.state["history"], indent=2))
            raise
        finally:
            if recorder.poll() is None:
                try:
                    recorder.stdin.write("STOP\n")
                    recorder.stdin.flush()
                except BrokenPipeError:
                    pass
            recorder.stdin.close()
            code = recorder.wait(timeout=30)
            if code != 0:
                raise RuntimeError(f"Recorder failed: {recorder.stderr.read()[:1000]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--goals", required=True)
    parser.add_argument("--values", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cdp-url", default="http://127.0.0.1:9223")
    args = parser.parse_args()
    history = run_tour(args.url, json.loads(Path(args.goals).read_text()), json.loads(Path(args.values).read_text()), args.output, args.cdp_url)
    print(json.dumps(history))
