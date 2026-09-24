"""Pristine upstream example gate; no integration fork, PR source, or recorder."""

import json
import re
import time
from pathlib import Path

from pro_tour.evidence import timestamp, write_report
from pro_tour.sandbox import Docker, SandboxError, SandboxSession


class PristineSession(SandboxSession):
    """Fixed preflight-only topology, separate from the offline app boundary.

    The gateway has no secrets and listens only on two disjoint Unix sockets.
    Page/browser code can never mount or address the provider socket. Both
    browser and controller still have network=none and distinct namespaces.
    """

    CHANNELS = ("public", "provider", "control")
    MOUNTS = {
        "gateway": (("public", False), ("provider", False)),
        "browser": (("public", True), ("control", False)),
        "controller": (("provider", True), ("control", True)),
    }
    NETWORKS = {"gateway": "bridge"}


def command(*args: str) -> list[str]:
    return ["python", "/opt/preflight/runtime.py", *args]


def require(value, explanation):
    if not value:
        raise SandboxError(explanation)


def read_key(path: Path) -> str:
    """Read one literal assignment only, after the credential-free gates pass."""
    with path.open("rb") as stream:
        raw = stream.read(16385)
    require(len(raw) <= 16384, "Credential file exceeds the size bound")
    matches = re.findall(
        r"^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=(.*)$", raw.decode("utf-8"), re.MULTILINE
    )
    require(len(matches) == 1, "Expected one TypeSafe credential assignment")
    value = matches[0].strip()
    if value.startswith(("'", '"')):
        require(len(value) > 2 and value[-1] == value[0], "Malformed credential assignment")
        value = value[1:-1]
    require(
        value and len(value) <= 8192 and not any(c in value for c in "$`\r\n\0"),
        "Credential must be a nonempty literal",
    )
    return value


def run(
    image: str, output: Path, secrets_file: Path | None, *, negative_control: bool = False
) -> int:
    require(not output.exists(), "Use a new evidence output path")
    sandbox = PristineSession(Docker(), image)
    report = {
        "kind": "pristine-jev-example",
        "started_at": timestamp(),
        "status": "failed",
        "image_id": image,
        "real_credentials_used": False,
        "full_pipeline_verified": False,
        "negative_control": negative_control,
        "requested_model": "jev-latest",
        "phase": "startup",
    }
    try:
        with sandbox:
            sandbox.start("gateway", ["python", "/opt/preflight/egress_proxy.py"])
            sandbox.start("browser", command("browser"))
            sandbox.start("controller", command("controller"))

            def execute(role, *args, timeout=30):
                return json.loads(sandbox.execute(role, command(*args), timeout=timeout))

            report["runtime"] = {}
            for role in ("gateway", "browser", "controller"):
                inspected = sandbox.inspect(role)
                host = inspected["HostConfig"]
                require(
                    host["NetworkMode"] == PristineSession.NETWORKS.get(role, "none"),
                    "Wrong role network",
                )
                require(
                    not host["Privileged"]
                    and not host["PidMode"]
                    and not host["PortBindings"]
                    and host["ReadonlyRootfs"],
                    "Unsafe runtime configuration",
                )
                require(
                    all(mount["Type"] == "volume" for mount in inspected["Mounts"]),
                    "Unexpected host mount",
                )
                report["runtime"][role] = {
                    "constraints": {
                        key: host[key]
                        for key in (
                            "NetworkMode",
                            "CapDrop",
                            "SecurityOpt",
                            "Memory",
                            "PidsLimit",
                            "ReadonlyRootfs",
                        )
                    },
                    "mounts": [
                        {key: mount[key] for key in ("Destination", "RW")}
                        for mount in inspected["Mounts"]
                    ],
                }
            report["phase"] = "credential-free-boundary"
            # Wait only for the supported, prestarted harness; never let a
            # credentialed caller launch/restart it. Every probe forbids spawn.
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                try:
                    browser = execute("controller", "browser-check", timeout=20)
                    break
                except SandboxError:
                    time.sleep(0.2)
            else:
                raise SandboxError("Prestarted browser/harness did not pass the fixture probe")
            report["browser"] = browser
            require(
                browser["heading"] == ("wrong-marker" if negative_control else "Example Domain"),
                "Fixture marker mismatch",
            )
            require(
                set(browser["browser_fetch"].values()) == {"denied"},
                "Page reached a forbidden destination",
            )
            report["boundary"] = {}
            for role in ("browser", "controller"):
                observed = execute(role, "diagnostic")
                report["boundary"][role] = observed
                require(
                    observed["uid"] == 10000 and observed["pristine"],
                    "Non-pristine source or privileged process",
                )
                require(not observed["proc_text_settings"], "Unapproved helper configuration")
                require(
                    set(observed["direct_outbound"].values()) == {"denied"},
                    "Unapproved direct egress",
                )
                require(
                    observed["proc_secret_names"]
                    == (
                        ["CURSOR_API_KEY", "GH_MEDIA_TOKEN", "TYPESAFE_API_KEY"]
                        if role == "controller"
                        else []
                    ),
                    "Canary process isolation failed",
                )
                require(
                    observed["controller_file_readable"] == (role == "controller"),
                    "Canary file isolation failed",
                )
                require(
                    observed["provider_socket_visible"] == (role == "controller")
                    and observed["public_socket_visible"] == (role == "browser"),
                    "Socket role isolation failed",
                )
            for name in ("net", "pid", "mnt"):
                require(
                    len({r["namespaces"][name] for r in report["boundary"].values()}) == 2,
                    "Browser and controller share namespaces",
                )
            report["egress"] = {}
            for role in ("browser", "controller"):
                observed = execute(role, "network", role, timeout=45)
                report["egress"][role] = observed
                for destination, status in observed.items():
                    allowed = (role, destination) in (
                        ("browser", "fixture"),
                        ("controller", "typesafe"),
                    )
                    require(
                        type(status) is int if allowed else status == "denied",
                        "Allowlisted proxy egress did not match its policy",
                    )
            report["spawn_check"] = execute("controller", "spawn-check")
            report["missing_harness"] = execute("controller", "missing-harness-check")
            require(
                report["spawn_check"]["spawn_denied"]
                and report["missing_harness"]["restart_denied"],
                "Harness fallback is unsafe",
            )
            report["precredential_gate"] = "passed"
            if secrets_file is None:
                report["status"] = "boundary-only"
            else:
                report["phase"] = "unchanged-example"
                key = read_key(secrets_file)
                report["real_credentials_used"] = True
                report["command"] = [
                    "python",
                    "examples/run.py",
                    "--url",
                    "https://example.com/",
                    "--goal",
                    "Click the Learn more link to open IANA's Example Domains "
                    "page, then finish. Do not type.",
                ]
                try:
                    # Key only on private stdin into the trusted loader; never
                    # in Docker env/inspect, argv, app, browser, harness, gateway.
                    sandbox.docker.run(
                        "exec",
                        "-i",
                        sandbox.containers["controller"],
                        "/usr/bin/env",
                        "-i",
                        "HOME=/home/protour",
                        "PATH=/usr/local/bin:/usr/bin:/bin",
                        *command("launch"),
                        input_text=json.dumps({"key": key}),
                        timeout=180,
                    )
                    report["example_exit_code"] = 0
                except SandboxError:
                    report["example_exit_code"] = "failed-or-timed-out"
                finally:
                    del key
                    report["example"] = execute("controller", "collect")
                observed = report["example"]
                decisions = [x for x in observed["trace"] if x["event"] == "decision"]
                states = [x for x in observed["trace"] if x["event"] == "state"]
                require(report["example_exit_code"] == 0, "Unchanged upstream example failed")
                require(
                    observed["launch"]["credential_names"] == ["TYPESAFE_API_KEY"]
                    and not observed["launch"]["helper_settings"]
                    and observed["launch"]["seccomp_filters"] >= 2,
                    "Unsafe example process environment or missing spawn restriction",
                )
                require(observed["pristine"], "Baseline source changed during execution")
                require(
                    decisions and all(d["model"] for d in decisions), "No returned model identity"
                )
                require(states and states[-1]["status"] == "done", "Example did not finish")
                final = states[-1]
                require(
                    final["url"] == "https://www.iana.org/help/example-domains",
                    "Unexpected click destination",
                )
                require(
                    final["history"] and any(x["kind"] == "click" for x in final["history"]),
                    "No executed Jev click",
                )
                require(
                    not final["text_calls"]
                    and not any(d["operation"] == "TYPE_TEXT" for d in decisions),
                    "Typing is not permitted in this preflight",
                )
                report["status"] = "passed"
    except (SandboxError, OSError, ValueError, KeyError) as error:
        report["error"] = (
            str(error) if isinstance(error, SandboxError) else "Invalid preflight data"
        )
    finally:
        report["cleanup"] = (
            "verified" if not sandbox.containers and not sandbox.volumes else "failed"
        )
        if report["cleanup"] != "verified":
            report["status"] = "failed"
        report["finished_at"] = timestamp()
        write_report(output, report)
    return int(report["status"] not in ("passed", "boundary-only"))
