"""Trusted preflight support around an unmodified, separately acquired example."""

import ctypes
import errno
import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE = {
    "HOME": "/home/protour",
    "LANG": "C.UTF-8",
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "PYTHONDONTWRITEBYTECODE": "1",
}
HARNESS = {
    "BH_RUNTIME_DIR": "/run/pro-tour/control",
    "BH_TMP_DIR": "/tmp/harness",
    "BH_AGENT_WORKSPACE": "/workspace",
    "BU_CDP_URL": "http://127.0.0.1:9222",
    "BH_TAB_MARKER": "0",
}
SECRETS = ("TYPESAFE_API_KEY", "CURSOR_API_KEY", "GH_MEDIA_TOKEN")
TEXT = ("TEXT_MODEL", "TEXT_MODEL_BASE_URL", "TEXT_MODEL_API_KEY")
URL = "https://example.com/"
GOAL = "Click the Learn more link to open IANA's Example Domains page, then finish. Do not type."


def no_children():
    """Block fallback harness/browser spawning without changing upstream code.

    This stacks with Docker's default seccomp policy. The filter survives exec.
    Library/ABI names are resolved by libseccomp on the running architecture.
    """
    lib = ctypes.CDLL("libseccomp.so.2", use_errno=True)
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    context = lib.seccomp_init(0x7FFF0000)  # SCMP_ACT_ALLOW; Docker is still default-deny.
    if not context:
        raise RuntimeError("Cannot initialize process-spawn restriction")
    try:
        for name in (b"clone", b"clone3", b"fork", b"vfork"):
            syscall = lib.seccomp_syscall_resolve_name(name)
            if (
                syscall >= 0
                and lib.seccomp_rule_add(context, 0x00050000 | errno.EPERM, syscall, 0) != 0
            ):
                raise RuntimeError("Cannot deny process spawning")
        if lib.seccomp_load(context) != 0:
            raise RuntimeError("Cannot apply process-spawn restriction")
    finally:
        lib.seccomp_release(context)


def pristine():
    root = Path("/opt/upstream")
    expected = json.loads(Path("/opt/preflight/source.json").read_text())["files"]
    actual = {
        str(f.relative_to(root)): hashlib.sha256(f.read_bytes()).hexdigest()
        for f in sorted(root.rglob("*"))
        if f.is_file()
    }
    return actual == expected


def start_role(role):
    children = []

    def start(argv, env):
        children.append(
            subprocess.Popen(argv, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        )

    try:
        if role == "browser":
            start(
                [
                    "socat",
                    "TCP-LISTEN:8181,bind=127.0.0.1,reuseaddr,fork",
                    "UNIX-CONNECT:/run/pro-tour/public/proxy.sock",
                ],
                BASE,
            )
            start(
                [
                    "chromium",
                    "--headless=new",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-quic",
                    "--disable-background-networking",
                    "--disable-component-update",
                    "--remote-debugging-address=127.0.0.1",
                    "--remote-debugging-port=9222",
                    "--user-data-dir=/tmp/chromium",
                    "--proxy-server=http://127.0.0.1:8181",
                    "about:blank",
                ],
                BASE,
            )
            for _ in range(100):
                try:
                    with urllib.request.urlopen(
                        "http://127.0.0.1:9222/json/version", timeout=0.5
                    ) as response:
                        json.load(response)
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Browser startup failed")
            start(["python", "-m", "browser_harness.daemon"], BASE | HARNESS)
        else:
            start(
                [
                    "socat",
                    "TCP-LISTEN:8182,bind=127.0.0.1,reuseaddr,fork",
                    "UNIX-CONNECT:/run/pro-tour/provider/proxy.sock",
                ],
                BASE,
            )
            Path("/tmp/controller-canary").write_text("synthetic-canary-only")
            start(
                ["python", "-c", "import time; time.sleep(3600)"],
                BASE | {key: "synthetic-canary-only" for key in SECRETS},
            )
        while all(child.poll() is None for child in children):
            time.sleep(0.2)
        raise RuntimeError("Preflight service stopped")
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            child.wait(timeout=5)


def diagnostic():
    names = set()
    for path in Path("/proc").glob("[0-9]*/environ"):
        try:
            names.update(
                item.split(b"=", 1)[0].decode(errors="replace")
                for item in path.read_bytes().split(b"\0")
            )
        except OSError:
            pass
    direct = {}
    for host in ("1.1.1.1", "169.254.169.254", "172.17.0.1", "2606:4700:4700::1111"):
        try:
            with socket.create_connection((host, 443), timeout=0.2):
                direct[host] = "connected"
        except OSError:
            direct[host] = "denied"
    return {
        "uid": os.getuid(),
        "proc_secret_names": sorted(set(SECRETS) & names),
        "proc_text_settings": sorted(set(TEXT) & names),
        "controller_file_readable": Path("/tmp/controller-canary").exists(),
        "provider_socket_visible": Path("/run/pro-tour/provider/proxy.sock").exists(),
        "public_socket_visible": Path("/run/pro-tour/public/proxy.sock").exists(),
        "direct_outbound": direct,
        "namespaces": {
            name: os.readlink(f"/proc/self/ns/{name}") for name in ("net", "pid", "mnt")
        },
        "pristine": pristine(),
    }


def network_probe(role):
    import httpx

    port = 8181 if role == "browser" else 8182
    urls = {
        "fixture": URL,
        "typesafe": "https://api.typesafe.ai/",
        "github": "https://api.github.com/",
        "private": "https://127.0.0.1/",
        "metadata": "https://169.254.169.254/",
        "ipv6": "https://[::1]/",
        "helper": "https://api.deepseek.com/",
    }
    observed = {}
    with httpx.Client(proxy=f"http://127.0.0.1:{port}", trust_env=False, timeout=15) as client:
        for name, url in urls.items():
            try:
                response = client.get(url)
                observed[name] = response.status_code
            except httpx.ProxyError:
                observed[name] = "denied"
            except httpx.HTTPError:
                observed[name] = "connection-failed"
    return observed


def browser_probe():
    os.environ.update(HARNESS)
    no_children()
    from browser_harness.admin import ensure_daemon
    from browser_harness.helpers import cdp

    ensure_daemon()
    target = cdp("Target.createTarget", url="about:blank")["targetId"]
    session = cdp("Target.attachToTarget", targetId=target, flatten=True)["sessionId"]

    def call(method, **params):
        return cdp(method, session_id=session, **params)

    try:
        call("Page.navigate", url=URL)
        for _ in range(100):
            result = call(
                "Runtime.evaluate",
                expression="document.querySelector('h1')?.innerText",
                returnByValue=True,
            )["result"].get("value")
            if result == "Example Domain":
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("Public fixture did not load")
        expression = """(async () => {
          const result = {};
          for (const url of ['https://api.typesafe.ai/', 'https://api.github.com/',
                             'http://169.254.169.254/', 'http://[::1]:8182/']) {
            try { await fetch(url, {mode:'no-cors', signal:AbortSignal.timeout(3000)});
                  result[url] = 'reachable'; }
            catch { result[url] = 'denied'; }
          }
          return result;
        })()"""
        denied = call(
            "Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True
        )["result"]["value"]
        return {
            "heading": result,
            "browser_fetch": denied,
            "harness_prestarted": True,
            "spawn_restriction_active": True,
        }
    finally:
        cdp("Target.closeTarget", targetId=target)


def launch():
    if any(name in os.environ for name in (*SECRETS, *TEXT)) or not pristine():
        raise RuntimeError("Unsafe preflight environment or changed source")
    key = json.loads(sys.stdin.read(16384))["key"]
    if not isinstance(key, str) or not key or len(key) > 8192:
        raise RuntimeError("Invalid credential input")
    environment = (
        BASE
        | HARNESS
        | {
            "TYPESAFE_API_KEY": key,
            "TYPESAFE_MODEL": "jev-latest",
            "HTTPS_PROXY": "http://127.0.0.1:8182",
            "PYTHONPATH": "/opt/observer:/opt/upstream",
        }
    )
    for fd, name in ((1, "stdout"), (2, "stderr")):
        stream = os.open(f"/tmp/example.{name}", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.dup2(stream, fd)
        os.close(stream)
    no_children()
    status = Path("/proc/self/status").read_text()
    filters = int(re.search(r"^Seccomp_filters:\s+(\d+)$", status, re.MULTILINE)[1])
    metadata = {
        "credential_names": sorted(set(SECRETS) & environment.keys()),
        "helper_settings": sorted(set(TEXT) & environment.keys()),
        "seccomp_filters": filters,
    }
    Path("/tmp/launch-metadata.json").write_text(json.dumps(metadata))
    os.execve(
        "/usr/local/bin/python",
        ["python", "examples/run.py", "--url", URL, "--goal", GOAL],
        environment,
    )


def collect():
    trace = Path("/tmp/jev-trace.jsonl")
    error = Path("/tmp/example.stderr")
    raw = error.read_text() if error.exists() else ""
    # Upstream model errors are deliberately generic. Do not retain traceback
    # locals or arbitrary error text from any third-party library.
    allowed = re.findall(
        r"Model provider returned HTTP \d{3}; no action executed\.|"
        r"Model connection failed; no action executed\.|"
        r"TYPE_TEXT needs TEXT_MODEL_API_KEY[^\n]*",
        raw,
    )
    stdout = Path("/tmp/example.stdout")
    metadata = Path("/tmp/launch-metadata.json")
    lines = stdout.read_text().splitlines() if stdout.exists() else []
    return {
        "launch": json.loads(metadata.read_text()) if metadata.exists() else None,
        "trace": [json.loads(line) for line in trace.read_text().splitlines()]
        if trace.exists()
        else [],
        "pristine": pristine(),
        "stdout": [
            line
            for line in lines
            if re.fullmatch(
                r"\s*\d+ ms  \d+ actions  [a-z]+|https://(?:www\.)?iana.org/[^\s]*", line
            )
        ],
        "provider_errors": allowed,
        "stderr_present": bool(raw),
    }


def main():
    mode = sys.argv[1]
    if mode in ("browser", "controller"):
        start_role(mode)
    elif mode == "launch":
        launch()
    elif mode == "spawn-check":
        no_children()
        try:
            subprocess.run(["python", "-c", "pass"], check=True)
        except PermissionError:
            print(json.dumps({"spawn_denied": True}))
        else:
            raise RuntimeError("Process spawning was allowed")
    elif mode == "missing-harness-check":
        os.environ.update(HARNESS | {"BH_RUNTIME_DIR": "/tmp/missing-harness"})
        no_children()
        from browser_harness.admin import ensure_daemon

        try:
            ensure_daemon()
        except PermissionError:
            print(json.dumps({"restart_denied": True}))
        else:
            raise RuntimeError("Missing harness did not fail closed")
    else:
        result = (
            diagnostic()
            if mode == "diagnostic"
            else network_probe(sys.argv[2])
            if mode == "network"
            else browser_probe()
            if mode == "browser-check"
            else collect()
        )
        print(json.dumps(result))


if __name__ == "__main__":
    main()
