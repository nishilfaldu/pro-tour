"""Synthetic fixture only: never read or accept the user's credentials."""

import ctypes
import http.client
import json
import os
import secrets
import socket
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

KEYS = ("TYPESAFE_API_KEY", "CURSOR_API_KEY", "GH_MEDIA_TOKEN")
PREFIX = "SYNTHETIC_PRO_TOUR_"
APP_SOCKET = "/run/pro-tour/app/http.sock"
CONTROL_SOCKET = "/run/pro-tour/control/cdp.sock"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:7777/canary")
            self.end_headers()
            return
        if self.server.server_port == 7777:
            content = Path("/tmp/controller-canary").read_bytes()
        elif self.path == "/ping":
            content = b"APP_REACHABLE"
        else:
            content = b"<html><title>Isolation fixture</title><h1>Isolated app is ready</h1></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, *_):
        pass


def supervise(commands):
    processes = []
    try:
        for command in commands:
            processes.append(subprocess.Popen(command, stdout=subprocess.DEVNULL))
        while all(process.poll() is None for process in processes):
            time.sleep(0.1)
        raise RuntimeError("A fixture child stopped unexpectedly")
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def app():
    with subprocess.Popen(
        ["socat", f"UNIX-LISTEN:{APP_SOCKET},fork,mode=0600", "TCP:127.0.0.1:4173"]
    ) as bridge:
        try:
            ThreadingHTTPServer(("127.0.0.1", 4173), Handler).serve_forever()
        finally:
            bridge.terminate()


def browser():
    supervise(
        [
            [
                "socat",
                "TCP4-LISTEN:4173,bind=127.0.0.1,fork,reuseaddr",
                f"UNIX-CONNECT:{APP_SOCKET}",
            ],
            ["socat", f"UNIX-LISTEN:{CONTROL_SOCKET},fork,mode=0600", "TCP:127.0.0.1:9222"],
            [
                "chromium",
                "--headless=new",
                "--no-sandbox",
                "--disable-background-networking",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-component-update",
                "--disable-sync",
                "--disable-breakpad",
                "--user-data-dir=/tmp/chromium-profile",
                "--remote-debugging-port=9222",
                "--remote-debugging-address=127.0.0.1",
                "about:blank",
            ],
        ]
    )


def controller():
    # Fresh unpredictable canaries live ONLY in this namespace. execve ensures
    # /proc/<pid>/environ contains them, giving the leak test a positive control.
    environment = dict(os.environ)
    environment.update({name: PREFIX + secrets.token_hex(16) for name in KEYS})
    Path("/tmp/controller-canary").write_text(environment[KEYS[0]])
    Path("/home/protour/private-canary").write_text(environment[KEYS[1]])
    os.execve(sys.executable, [sys.executable, __file__, "controller-server"], environment)


def boundary():
    seen = set()
    for path in Path("/proc").glob("[0-9]*/environ"):
        try:
            content = path.read_bytes()
        except OSError:
            continue
        for key in KEYS:
            if (key + "=" + PREFIX).encode() in content:
                seen.add(key)
    status = dict(
        line.split(":", 1)
        for line in Path("/proc/self/status").read_text().splitlines()
        if ":" in line
    )
    outbound = {}
    for name, host, port in (
        ("controller-loopback", "127.0.0.1", 7777),
        ("metadata", "169.254.169.254", 80),
        ("docker-gateway", "172.17.0.1", 2375),
        ("desktop-gateway", "192.168.65.1", 443),
        ("external-ipv4", "1.1.1.1", 443),
        ("external-ipv6", "2606:4700:4700::1111", 443),
        ("private-ipv6", "fd00::1", 443),
    ):
        try:
            with socket.create_connection((host, port), timeout=0.5):
                outbound[name] = "connected"
        except OSError:
            outbound[name] = "denied"
    files = {}
    for path in (
        "/tmp/controller-canary",
        "/home/protour/private-canary",
        "/proc/1/root/tmp/controller-canary",
        "/var/run/docker.sock",
        "/Users/happyhome/Desktop/pro-tour/.env.local",
        "/workspace/.env.local",
        "/host/.env.local",
        "/root/.docker/config.json",
    ):
        try:
            with open(path, "rb") as stream:
                stream.read(256)
            files[path] = "readable"
        except OSError:
            files[path] = "unreadable"
    writable_channels = {}
    for channel in ("app", "control"):
        path = Path(f"/run/pro-tour/{channel}/probe-write")
        try:
            path.write_text("synthetic probe")
            path.unlink()
            writable_channels[channel] = True
        except OSError:
            writable_channels[channel] = False
    try:
        Path("/root-write-probe").write_text("synthetic probe")
        root_readonly = False
    except OSError:
        root_readonly = True
    try:
        os.setuid(0)
        root_escalation_denied = False
    except PermissionError:
        root_escalation_denied = True
    # The fixture itself cannot create a network namespace to widen its policy.
    libc = ctypes.CDLL(None, use_errno=True)
    namespace_creation_denied = libc.unshare(0x40000000) == -1
    return {
        "uid": os.getuid(),
        "cap_eff": status["CapEff"].strip(),
        "no_new_privs": status["NoNewPrivs"].strip(),
        "namespaces": {
            kind: os.readlink(f"/proc/self/ns/{kind}") for kind in ("net", "pid", "mnt")
        },
        "interfaces": json.loads(subprocess.check_output(["ip", "-j", "address"], text=True)),
        "routes": {
            family: json.loads(
                subprocess.check_output(
                    ["ip", f"-{family}", "-j", "route", "show", "table", "all"], text=True
                )
            )
            for family in ("4", "6")
        },
        "credential_names_seen_in_proc": sorted(seen),
        "credential_names_in_diagnostic_env": [name for name in KEYS if name in os.environ],
        "text_model_settings": [name for name in os.environ if name.startswith("TEXT_MODEL")],
        "outbound": outbound,
        "files": files,
        "writable_channels": writable_channels,
        "root_readonly": root_readonly,
        "root_escalation_denied": root_escalation_denied,
        "namespace_creation_denied": namespace_creation_denied,
    }


def browser_probe():
    from websockets.sync.client import unix_connect

    connection = http.client.HTTPConnection("localhost", 9222, timeout=3)
    connection.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.sock.settimeout(3)
    connection.sock.connect(CONTROL_SOCKET)
    connection.request("GET", "/json/version")
    metadata = json.loads(connection.getresponse().read())
    connection.close()
    with unix_connect(
        CONTROL_SOCKET,
        uri=metadata["webSocketDebuggerUrl"],
        proxy=None,
        open_timeout=3,
        close_timeout=1,
    ) as websocket:
        sequence = 0

        def call(method, params=None, session=None):
            nonlocal sequence
            sequence += 1
            payload = {"id": sequence, "method": method, "params": params or {}}
            if session:
                payload["sessionId"] = session
            websocket.send(json.dumps(payload))
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                response = json.loads(
                    websocket.recv(timeout=max(0.01, deadline - time.monotonic()))
                )
                if response.get("id") == sequence:
                    if "error" in response:
                        raise RuntimeError("CDP probe failed")
                    return response["result"]
            raise TimeoutError("CDP probe deadline exceeded")

        target = call("Target.createTarget", {"url": "http://localhost:4173/"})["targetId"]
        session = call("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        try:
            for _ in range(40):
                result = call(
                    "Runtime.evaluate",
                    {
                        "expression": "document.querySelector('h1')?.textContent",
                        "returnByValue": True,
                    },
                    session,
                )
                if result["result"].get("value") == "Isolated app is ready":
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError("Browser never reached the positive-control app")
            expression = """(async () => {
              const endpoints = {
                app: '/ping', redirect: '/redirect',
                controller: 'http://127.0.0.1:7777/canary',
                metadata: 'http://169.254.169.254/',
                typesafe: 'https://api.typesafe.ai/v1/systemone',
                github: 'https://api.github.com/',
                githubMedia: 'https://github.com/user-attachments/',
                cursor: 'https://api2.cursor.sh/',
                ipv4: 'http://1.1.1.1/', ipv6: 'http://[2606:4700:4700::1111]/'
              };
              const requests = Object.entries(endpoints).map(async ([key, url]) => {
                try {
                  const response = await fetch(url, {
                    mode: 'no-cors', signal: AbortSignal.timeout(1500)
                  });
                  return [key, key === 'app' ? (await response.text()) : 'connected'];
                } catch (e) { return [key, 'denied']; }
              });
              return Object.fromEntries(await Promise.all(requests));
            })()"""
            result = call(
                "Runtime.evaluate",
                {"expression": expression, "returnByValue": True, "awaitPromise": True},
                session,
            )
            if "exceptionDetails" in result:
                raise RuntimeError("Browser-side boundary probe failed")
            return {
                "browser_version": metadata["Browser"],
                "page_title": "Isolation fixture",
                "requests": result["result"]["value"],
            }
        finally:
            call("Target.closeTarget", {"targetId": target})


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "app":
        app()
    elif mode == "browser":
        browser()
    elif mode == "controller":
        controller()
    elif mode == "controller-server":
        ThreadingHTTPServer(("127.0.0.1", 7777), Handler).serve_forever()
    elif mode == "boundary":
        print(json.dumps(boundary()))
    elif mode == "browser-probe":
        print(json.dumps(browser_probe()))
