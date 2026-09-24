"""Read-only local inventory, explicitly separate from integration verification.

These probes run installed, trusted version commands, never PR code. An empty
environment/home is useful hygiene for them; it is NOT the P06 sandbox.
"""

import os
import platform
import re
import shutil
import signal
import subprocess
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from pro_tour.evidence import sha256_file, timestamp

SECRET_NAMES = ("TYPESAFE_API_KEY", "CURSOR_API_KEY", "GH_MEDIA_TOKEN")
TEXT_MODEL_NAMES = ("TEXT_MODEL", "TEXT_MODEL_BASE_URL", "TEXT_MODEL_API_KEY")


@dataclass(frozen=True)
class Probe:
    name: str
    argv: tuple[str, ...]
    version_pattern: str


PROBES = (
    Probe("python", ("python3", "--version"), r"Python (\d+\.\d+\.\d+)"),
    Probe("uv", ("uv", "--version"), r"uv (\d+\.\d+\.\d+)"),
    Probe("node", ("node", "--version"), r"v(\d+\.\d+\.\d+)"),
    Probe("npm", ("npm", "--version"), r"^(\d+\.\d+\.\d+)$"),
    Probe("cursor", ("agent", "--version"), r"^(\d{4}\.\d{2}\.\d{2}-[a-f0-9]+)$"),
    Probe("github", ("gh", "--version"), r"gh version (\d+\.\d+\.\d+)"),
    Probe("ffmpeg", ("ffmpeg", "-version"), r"ffmpeg version (\d+\.\d+(?:\.\d+)?)"),
    Probe("ffprobe", ("ffprobe", "-version"), r"ffprobe version (\d+\.\d+(?:\.\d+)?)"),
    Probe("docker", ("docker", "--version"), r"Docker version (\d+\.\d+\.\d+)"),
)


def probe_environment(search_path: str, home: Path) -> dict[str, str]:
    """An explicit environment for noncredentialed trusted version probes only."""
    return {
        "PATH": search_path,
        "HOME": str(home),
        "TMPDIR": str(home),
        "XDG_CONFIG_HOME": str(home / "config"),
        "XDG_CACHE_HOME": str(home / "cache"),
        "LANG": "C",
        "LC_ALL": "C",
    }


def secret_presence(environment: Mapping[str, str], path: Path | None = None) -> dict:
    """Inspect only availability. Do not source dotenv or validate credentials.

    File values stay local to this function and are never passed to a child.
    Malformed/duplicate assignments fail the presence check for that name.
    """
    states = {name: "missing" for name in SECRET_NAMES}
    file_status = "not-requested"
    if path is not None:
        try:
            with path.open("rb") as stream:
                raw = stream.read(16 * 1024 + 1)
            if len(raw) > 16 * 1024:
                raise ValueError
            content = raw.decode("utf-8")
            seen = set()
            for line in content.splitlines():
                match = re.fullmatch(r"\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=(.*)", line)
                if not match or match[1] not in states:
                    continue
                name, value = match[1], match[2].strip()
                if name in seen:
                    states[name] = "invalid"
                    continue
                seen.add(name)
                if value.startswith(("'", '"')):
                    if len(value) < 2 or value[-1] != value[0]:
                        states[name] = "invalid"
                        continue
                    value = value[1:-1]
                if any(char in value for char in ("$", "`")):
                    states[name] = "unevaluated"
                else:
                    states[name] = "present" if value else "empty"
            file_status = "read"
        except (OSError, ValueError, UnicodeError):
            file_status = "unreadable-or-invalid"
    for name in states:
        if name in environment:
            states[name] = "present" if environment[name] else "empty"
    return {
        "file_status": file_status,
        "names": states,
        "operational_validity": "not-tested",
        "inherited_text_model_settings": {
            name: "present" if name in environment else "absent" for name in TEXT_MODEL_NAMES
        },
    }


def _execute(
    argv: list[str], environment: dict[str, str], timeout: float
) -> tuple[str, int | None, str]:
    # Spool output rather than accumulate an unbounded tool response in memory.
    # Read only a small prefix for version parsing and discard all raw output.
    with tempfile.TemporaryFile() as output:
        try:
            with subprocess.Popen(
                argv,
                cwd=environment["HOME"],
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            ) as process:
                status = "observed"
                try:
                    exit_code = process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    status, exit_code = "timeout", None
                finally:
                    # Also remove children left behind by a failed version probe.
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait()
                output.seek(0)
                return status, exit_code, output.read(16 * 1024).decode("utf-8", errors="replace")
        except OSError:
            return "unavailable", None, ""


def run_probe(probe: Probe, search_path: str, *, timeout: float = 10) -> dict:
    record = {"name": probe.name, "argv": list(probe.argv), "started_at": timestamp()}
    executable = shutil.which(probe.argv[0], path=search_path)
    if executable is None:
        return {**record, "status": "missing", "exit_code": None, "finished_at": timestamp()}
    try:
        digest = sha256_file(Path(executable))
    except OSError:
        return {**record, "status": "unreadable", "exit_code": None, "finished_at": timestamp()}
    with tempfile.TemporaryDirectory(prefix="pro-tour-probe-") as temporary:
        status, code, output = _execute(
            [executable, *probe.argv[1:]],
            probe_environment(search_path, Path(temporary)),
            timeout,
        )
    match = re.search(probe.version_pattern, output, re.MULTILINE)
    if status == "observed" and (code != 0 or match is None):
        status = "unavailable" if code != 0 else "unrecognized-version"
    return {
        **record,
        "finished_at": timestamp(),
        "status": status,
        "exit_code": code,
        "version": match[1] if match and status == "observed" else None,
        "executable_sha256": digest,
    }


def _docker_daemon(search_path: str) -> dict:
    executable = shutil.which("docker", path=search_path)
    if executable is None:
        return {"status": "missing-client", "exit_code": None}
    # Ignore DOCKER_HOST/CONTEXT and credential-bearing remote daemon settings.
    sockets = [Path("/var/run/docker.sock"), Path.home() / ".docker/run/docker.sock"]
    socket = next((item for item in sockets if item.is_socket()), None)
    if socket is None:
        return {"status": "no-local-socket", "exit_code": None}
    argv = [executable, "--host", f"unix://{socket}", "info", "--format", "{{.OSType}}"]
    with tempfile.TemporaryDirectory(prefix="pro-tour-docker-probe-") as temporary:
        status, code, output = _execute(argv, probe_environment(search_path, Path(temporary)), 10)
    return {
        "status": "linux-daemon-observed"
        if status == "observed" and code == 0 and output.strip() == "linux"
        else "unavailable-or-not-linux",
        "exit_code": code,
    }


def inventory(environment: Mapping[str, str], secrets_file: Path | None = None) -> dict:
    search_path = environment.get("PATH", os.defpath)
    started = timestamp()
    tools = [run_probe(probe, search_path) for probe in PROBES]
    browser_candidates = ("chromium", "chromium-browser", "google-chrome")
    browser_present = any(shutil.which(name, path=search_path) for name in browser_candidates)
    browser_present |= Path(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    ).is_file()
    report = {
        "schema_version": 1,
        "kind": "local-prerequisite-inventory",
        "started_at": started,
        "platform": {"system": platform.system(), "machine": platform.machine()},
        "credentials": secret_presence(environment, secrets_file),
        "tools": tools,
        "docker_daemon": _docker_daemon(search_path),
        "chromium": {"binary_present": browser_present, "launch": "not-attempted"},
        "linux_utilities": {
            name: bool(shutil.which(name, path=search_path))
            for name in ("Xvfb", "unshare", "nft", "iptables")
        },
        "integration_checks": {
            name: "not-tested"
            for name in (
                "linux_isolation",
                "pristine_jev_example",
                "typesafe_authentication",
                "grok_planning",
                "grok_tool_denial",
                "github_inline_upload",
                "pr_playback",
            )
        },
        "integration_ready": False,
    }
    report["finished_at"] = timestamp()
    return report
