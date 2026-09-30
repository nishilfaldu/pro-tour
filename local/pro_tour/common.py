import json
import os
import signal
import subprocess
import tempfile
import time
import hashlib
from contextlib import contextmanager
from pathlib import Path


class TourError(RuntimeError):
    pass


@contextmanager
def tab_capture_lock(session):
    """Chrome screenshots temporarily change viewport scale; keep input out of that window."""
    import fcntl
    root = Path(os.environ['BH_TMP_DIR'])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = root / ('capture-' + hashlib.sha256(session.encode()).hexdigest() + '.lock')
    with path.open('a') as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(file, fcntl.LOCK_UN)


class CommandError(TourError):
    def __init__(self, command, *, exit_code=None, timed_out=False):
        self.exit_code = exit_code
        self.timed_out = timed_out
        super().__init__(f'{command} timed out' if timed_out else f'{command} failed (exit {exit_code})')


def retry_read(operation, *, attempts=3, retryable=None):
    """Only callers doing read-only/provider requests may use this helper."""
    for attempt in range(attempts):
        try:
            return operation()
        except TourError as exc:
            if attempt == attempts - 1 or (retryable and not retryable(exc)):
                raise
            time.sleep(.5 * 2**attempt)


def clean_env(**extra):
    # Never inherit credential variables, app hooks, PYTHONPATH, or proxy settings.
    env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "SYSTEMROOT") if k in os.environ}
    return {**env, **extra}


def run(args, *, cwd=None, env=None, timeout=30, input=None):
    child = None
    try:
        child = subprocess.Popen(args, cwd=cwd, env=env or clean_env(), stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
        stdout, _ = child.communicate(input=input, timeout=timeout)
        if child.returncode:
            raise CommandError(Path(args[0]).name, exit_code=child.returncode)
        return stdout.strip()
    except subprocess.TimeoutExpired as exc:
        raise CommandError(Path(args[0]).name, timed_out=True) from exc
    except OSError as exc:
        raise TourError(f"{Path(args[0]).name} could not start; check its installation and permissions") from exc
    finally:
        if child:
            stop(child, group=True)
            for stream in (child.stdin, child.stdout):
                if stream and not stream.closed:
                    stream.close()


def stop(child, *, group=False):
    def send(sig):
        try:
            if group:
                os.killpg(child.pid, sig)
            else:
                child.send_signal(sig)
        except ProcessLookupError:
            pass
    if child.poll() is None:
        send(signal.SIGINT)
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            send(signal.SIGTERM)
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                send(signal.SIGKILL)
                child.wait()
    if group:
        # Catch descendants even if their parent exited before its cleanup ran.
        send(signal.SIGTERM)


def write_json(path, data):
    path = Path(path)
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as file:
            file.write(json.dumps(data, indent=2) + "\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
