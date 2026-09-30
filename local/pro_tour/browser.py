"""Attach to an identifiable existing Chrome; never start a browser or copy cookies."""
import json
import os
import platform
import shlex
import subprocess
import sys
import time
import tempfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from .common import TourError, clean_env, run, stop, write_json
from .repository import local_url

SETUP = 'Open chrome://inspect/#remote-debugging in your logged-in Chrome, enable remote debugging, and approve its connection prompt. No new browser was started.'


def connection_path():
    return Path(os.environ.get('PRO_TOUR_CONNECTION_FILE', Path.home() / '.config/pro-tour/connection.json'))


def existing_connection(endpoint=None):
    path = connection_path()
    if not path.exists(): return None
    if path.is_symlink() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise TourError('Pro Tour connection metadata must be owned by you with private permissions (0600)')
    try:
        state = json.loads(path.read_text())
        os.kill(state['owner_pid'], 0)
        if endpoint and state['browser']['endpoint'] != local_url(endpoint).rstrip('/'):
            return None
        allowed = {'BU_NAME', 'BH_RUNTIME_DIR', 'BH_CONFIG_DIR', 'BH_TMP_DIR', 'BH_AGENT_WORKSPACE', 'BH_TELEMETRY'}
        env = clean_env(**{k: v for k, v in state['env'].items() if k in allowed},
                        PYTHONPATH=str(Path(__file__).resolve().parents[1]))
        run([sys.executable, '-c', 'from browser_harness.admin import require_existing_daemon; require_existing_daemon()'], env=env, timeout=5)
        return env, state['browser']
    except (OSError, ValueError, KeyError, TypeError, TourError) as exc:
        raise TourError('Saved Pro Tour connection is unavailable. Stop its connect command and run pro-tour connect again; no replacement browser was started.') from exc


def running_chromes():
    if platform.system() not in {'Darwin', 'Linux'}:
        raise TourError('Automatic Chrome discovery currently supports macOS and Linux; supply --cdp-url')
    # Process arguments are parsed privately and never included in reports/logs.
    result = subprocess.run(['ps', '-axo', 'pid=,command='], capture_output=True, text=True, env=clean_env())
    if result.returncode:
        raise TourError('Cannot identify running Chrome; supply --cdp-url')
    instances = []
    for line in result.stdout.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2:
            continue
        pid, command = parts
        if '--type=' in command or not any(token in command for token in
                ('Google Chrome.app/Contents/MacOS/Google Chrome', '/google-chrome', '/chrome ', '/chromium ')):
            continue
        try:
            args = shlex.split(command)
        except ValueError:
            continue
        root = None
        profile = None
        port = None
        for index, arg in enumerate(args):
            for flag, name in [('--user-data-dir', 'root'), ('--profile-directory', 'profile'), ('--remote-debugging-port', 'port')]:
                value = arg.split('=', 1)[1] if arg.startswith(flag + '=') else (
                    args[index+1] if arg == flag and index+1 < len(args) else None)
                if value is not None:
                    if name == 'root': root = Path(value).expanduser()
                    elif name == 'profile': profile = value
                    else: port = value
        if root is None:
            root = Path.home() / ('Library/Application Support/Google/Chrome' if platform.system() == 'Darwin' else '.config/google-chrome')
        instances.append({'pid': int(pid), 'user_data_dir': str(root), 'profile_directory': profile,
                          'port': port, 'headless': any(arg.startswith('--headless') for arg in args)})
    return instances


def select_connection(endpoint=None):
    instances = running_chromes()
    if endpoint:
        endpoint = local_url(endpoint).rstrip('/')
        port = urlsplit(endpoint).port or (443 if endpoint.startswith('https:') else 80)
        matches = []
        for item in instances:
            try:
                active = Path(item['user_data_dir'], 'DevToolsActivePort').read_text().splitlines()
                discovered_port = int(active[0])
            except (OSError, ValueError, IndexError):
                discovered_port = None
            if str(port) == item['port'] or port == discovered_port:
                matches.append(item)
        metadata = {'connection': 'explicit', 'endpoint': endpoint, 'identity': 'unverified'}
        if len(matches) == 1:
            metadata.update({k: v for k, v in matches[0].items() if k != 'port'})
            metadata['identity'] = 'process-matched'
        return {'BU_CDP_URL': endpoint}, metadata
    candidates = []
    for item in instances:
        if item['headless']:
            continue  # A previously started automation browser is never the default.
        try:
            active = Path(item['user_data_dir'], 'DevToolsActivePort').read_text().splitlines()
            port = int(active[0])
            path = active[1]
            if not 1 <= port <= 65535 or not path.startswith('/devtools/browser/') or any(c.isspace() for c in path):
                continue
        except (OSError, ValueError, IndexError):
            continue
        candidates.append((item, port, path))
    if not candidates:
        raise TourError('No debugging connection found for a running visible Chrome. ' + SETUP)
    if len(candidates) != 1:
        raise TourError('Multiple running Chrome instances support debugging. Select one with --cdp-url; no browser was started.')
    item, port, path = candidates[0]
    metadata = {k: v for k, v in item.items() if k != 'port'}
    metadata.update(connection='discovered', endpoint=f'http://127.0.0.1:{port}', identity='process-matched')
    # Chrome's profile-written WebSocket works even when its HTTP discovery endpoint is disabled.
    return {'BU_CDP_WS': f'ws://127.0.0.1:{port}{path}'}, metadata


def browser_label(metadata):
    root = metadata.get('user_data_dir')
    profile = metadata.get('profile_directory')
    return (f"Chrome PID {metadata.get('pid', 'unknown')}; user-data directory {root or 'unknown'}; "
            f"profile {profile or 'not exposed by Chrome'}; {metadata['connection']} connection")


@contextmanager
def connected_browser(workspace, endpoint=None, *, reuse=True):
    existing = existing_connection(endpoint) if reuse else None
    if existing:
        print('Using approved Pro Tour connection: ' + browser_label(existing[1]), flush=True)
        yield existing
        return
    transport, metadata = select_connection(endpoint)
    env = clean_env(BU_NAME='pro-tour', BH_RUNTIME_DIR=str(workspace / 'runtime'),
                    BH_CONFIG_DIR=str(workspace / 'config'), BH_TMP_DIR=str(workspace / 'tmp'),
                    BH_AGENT_WORKSPACE=str(workspace / 'helpers'), BH_TELEMETRY='false',
                    PYTHONPATH=str(Path(__file__).resolve().parents[1]), **transport)
    print(browser_label(metadata), flush=True)
    daemon = subprocess.Popen([sys.executable, '-m', 'pro_tour.transport'], env=env,
                              cwd=workspace, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if daemon.poll() is not None:
                raise TourError('Browser Harness could not connect. ' + SETUP)
            try:
                run([sys.executable, '-c', 'from browser_harness.admin import require_existing_daemon; require_existing_daemon()'],
                    env=env, cwd=workspace, timeout=3)
                break
            except TourError:
                time.sleep(.5)
        else:
            raise TourError('Chrome connection timed out. ' + SETUP)
        identity_path = workspace / 'browser.json'
        run([sys.executable, '-m', 'pro_tour.browser', str(identity_path)], env=env, cwd=workspace, timeout=10)
        metadata.update(json.loads(identity_path.read_text()))
        yield env, metadata
    finally:
        stop(daemon)


def hold_connection(endpoint=None):
    path = connection_path()
    if path.exists():
        # Never overwrite a live connector. A stale file is removed explicitly by its user.
        raise TourError('Connection metadata already exists. Stop the existing connect command, or remove its stale metadata after confirming it is stopped: ' + str(path))
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='pro-tour-approved-') as directory:
        with connected_browser(Path(directory), endpoint, reuse=False) as (env, metadata):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(descriptor, 'w') as file:
                    json.dump({'owner_pid': os.getpid(), 'env': {k: v for k, v in env.items() if k.startswith('BH_') or k == 'BU_NAME'}, 'browser': metadata}, file)
                print('Chrome connected. Leave this command running; tours can now reuse the approved session. Ctrl-C disconnects.', flush=True)
                while True:
                    time.sleep(2)
                    # A dead Chrome/Harness must not silently reconnect to another instance.
                    run([sys.executable, '-c', 'from browser_harness.admin import require_existing_daemon; require_existing_daemon()'], env=env, timeout=5)
            finally:
                path.unlink(missing_ok=True)


def inspect_identity(output):
    from browser_harness.helpers import cdp
    info = cdp('Browser.getVersion')
    metadata = {'product': info['product'], 'protocol_version': info['protocolVersion']}
    try:
        args = cdp('Browser.getBrowserCommandLine')['arguments']
        metadata['headless'] = any(arg.startswith('--headless') for arg in args)
        for arg in args:
            if arg.startswith('--profile-directory='):
                metadata['profile_directory'] = arg.split('=', 1)[1]
    except Exception:
        pass  # Normal Chrome does not expose its command line unless automation is enabled.
    write_json(output, metadata)


if __name__ == '__main__':
    inspect_identity(sys.argv[1])
