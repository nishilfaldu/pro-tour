"""Run real Linux container/browser probes with synthetic canaries only.

Build containers/isolation-probe, then pass its immutable local image ID.
This is an explicit integration gate; it does not authenticate to any provider.
"""

import argparse
import json
import time
from pathlib import Path

from pro_tour.evidence import timestamp, write_report
from pro_tour.sandbox import Docker, SandboxError, SandboxSession


def fixture(mode: str) -> list[str]:
    return ["python", "/opt/probe/fixture.py", mode]


def require(condition: bool, explanation: str) -> None:
    if not condition:
        raise SandboxError(explanation)


def check_report(role: str, report: dict) -> None:
    require(report["uid"] == 10000, "Fixture must run as an unprivileged user")
    require(int(report["cap_eff"], 16) == 0, "Fixture retained capabilities")
    require(report["no_new_privs"] == "1", "no-new-privileges is missing")
    # LinuxKit may create inactive tunnel devices in an otherwise empty netns.
    # Reject an enabled/addressed non-loopback device and any non-loopback route.
    require(
        all(
            item["ifname"] == "lo" or ("UP" not in item["flags"] and not item["addr_info"])
            for item in report["interfaces"]
        ),
        "Fixture has a configured non-loopback interface",
    )
    require(
        all(
            route.get("dev") == "lo" and not route.get("gateway")
            for routes in report["routes"].values()
            for route in routes
        ),
        "Fixture has a non-loopback route",
    )
    require(report["root_readonly"], "Fixture root filesystem is writable")
    require(report["root_escalation_denied"], "Fixture escalated to root")
    require(report["namespace_creation_denied"], "Fixture widened its network namespace")
    require(not report["credential_names_in_diagnostic_env"], "Diagnostic inherited credentials")
    require(not report["text_model_settings"], "Diagnostic inherited text-model configuration")
    expected_writers = {
        "app": {"app": True, "control": False},
        "browser": {"app": False, "control": True},
        "controller": {"app": False, "control": False},
    }
    require(
        report["writable_channels"] == expected_writers[role], "Socket channel ownership mismatch"
    )
    for destination, status in report["outbound"].items():
        expected = (
            "connected"
            if role == "controller" and destination == "controller-loopback"
            else "denied"
        )
        require(status == expected, "Unexpected network reachability")
    if role == "controller":
        require(
            len(report["credential_names_seen_in_proc"]) == 3, "Canary positive control is missing"
        )
        require(report["files"]["/tmp/controller-canary"] == "readable", "Canary file is absent")
    else:
        require(
            not report["credential_names_seen_in_proc"],
            "Untrusted namespace can see canary credentials",
        )
        require(
            set(report["files"].values()) == {"unreadable"},
            "Untrusted namespace can read a forbidden file",
        )


def failure_probes(docker: Docker, image_id: str) -> dict:
    results = {}
    for failure in ("command-timeout", "cancellation"):
        sandbox = SandboxSession(docker, image_id)
        try:
            with sandbox:
                sandbox.start("app", ["python", "-c", "import time; time.sleep(60)"])
                if failure == "cancellation":
                    raise KeyboardInterrupt
                sandbox.execute("app", ["python", "-c", "import time; time.sleep(60)"], timeout=0.1)
        except KeyboardInterrupt:
            require(failure == "cancellation", "Unexpected cancellation in failure probe")
        except SandboxError as error:
            require(
                failure == "command-timeout" and "deadline" in str(error),
                "Failure probe failed for an unexpected reason",
            )
        else:
            raise SandboxError("An expected lifecycle failure did not occur")
        require(not sandbox.containers and not sandbox.volumes, "Failure leaked sandbox resources")
        results[failure] = "expected-failure-and-cleanup-verified"
    return results


def check(image_id: str, output: Path, *, negative_control: bool = False) -> int:
    docker = Docker()
    sandbox = SandboxSession(docker, image_id)
    report = {
        "schema_version": 1,
        "kind": "linux-isolation-canary-probe",
        "started_at": timestamp(),
        "status": "failed",
        "image_id": image_id,
        "real_credentials_used": False,
        "roles": {},
        "full_pipeline_verified": False,
        "negative_control": negative_control,
    }
    try:
        with sandbox:
            info = json.loads(docker.run("info", "--format", "{{json .}}"))
            report["runner"] = {
                key: info[key]
                for key in (
                    "ServerVersion",
                    "KernelVersion",
                    "OperatingSystem",
                    "OSType",
                    "Architecture",
                )
            }
            for role in ("app", "browser", "controller"):
                sandbox.start(role, fixture(role))
            # The controller is a live listener with private files and process
            # credentials, not an absent destination that would trivially deny.
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                observed = json.loads(sandbox.execute("controller", fixture("boundary")))
                if (
                    len(observed["credential_names_seen_in_proc"]) == 3
                    and observed["outbound"]["controller-loopback"] == "connected"
                ):
                    break
                time.sleep(0.1)
            else:
                raise SandboxError("Controller canary service never became ready")
            for role in ("app", "browser", "controller"):
                observed = json.loads(sandbox.execute(role, fixture("boundary")))
                report["roles"][role] = observed
                check_report(role, observed)
                inspected = sandbox.inspect(role)
                host = inspected["HostConfig"]
                require(host["NetworkMode"] == "none", "Container network mode changed")
                require(
                    not host["Privileged"] and not host["PidMode"],
                    "Host/privileged namespace was enabled",
                )
                require(not host["PortBindings"], "Host port publication was enabled")
                require(
                    all(item["Type"] == "volume" for item in inspected["Mounts"]),
                    "Unexpected host bind mount",
                )
                report["roles"][role]["runtime_constraints"] = {
                    key: host[key]
                    for key in (
                        "NetworkMode",
                        "Privileged",
                        "PidMode",
                        "ReadonlyRootfs",
                        "CapDrop",
                        "SecurityOpt",
                        "Memory",
                        "MemorySwap",
                        "NanoCpus",
                        "PidsLimit",
                    )
                }
            for namespace in ("net", "pid", "mnt"):
                require(
                    len({role["namespaces"][namespace] for role in report["roles"].values()}) == 3,
                    "Execution roles share a namespace",
                )
            # Each lifecycle phase launches a fresh canary diagnostic process
            # in the same untrusted app boundary. Real PR lifecycle is pending.
            report["app_phase_probes"] = {}
            for phase in ("install", "build", "start"):
                observed = json.loads(sandbox.execute("app", fixture("boundary")))
                check_report("app", observed)
                report["app_phase_probes"][phase] = "passed"
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    browser = json.loads(
                        sandbox.execute("controller", fixture("browser-probe"), timeout=20)
                    )
                    break
                except SandboxError:
                    time.sleep(0.2)
            else:
                raise SandboxError("Browser-control/positive app probe did not succeed")
            report["browser"] = browser
            require(
                browser["requests"].get("app")
                == ("INTENTIONALLY_WRONG_MARKER" if negative_control else "APP_REACHABLE"),
                "Browser cannot reach the configured app",
            )
            require(
                {value for name, value in browser["requests"].items() if name != "app"}
                == {"denied"},
                "Browser reached a forbidden destination",
            )
        report["failure_probes"] = failure_probes(docker, image_id)
        report["status"] = "passed"
    except (SandboxError, ValueError, KeyError) as error:
        report["status"] = "failed"
        report["error"] = (
            str(error) if isinstance(error, SandboxError) else "Malformed fixture output"
        )
    finally:
        report["cleanup"] = (
            "verified" if not sandbox.containers and not sandbox.volumes else "incomplete"
        )
        if report["cleanup"] != "verified":
            report["status"] = "failed"
        report["finished_at"] = timestamp()
        write_report(output, report)
    return int(report["status"] != "passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="trusted sha256:<local-image-id>")
    parser.add_argument("--output", type=Path, required=True, help="new evidence file")
    parser.add_argument(
        "--negative-control",
        action="store_true",
        help="require an intentionally wrong app marker; must exit nonzero",
    )
    args = parser.parse_args()
    raise SystemExit(check(args.image, args.output, negative_control=args.negative_control))
