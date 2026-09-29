import json
import os
import signal
import subprocess
from pathlib import Path


class TourError(RuntimeError):
    pass


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
            raise TourError(f"{Path(args[0]).name} failed (exit {child.returncode})")
        return stdout.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise TourError(f"{Path(args[0]).name} unavailable or timed out") from exc
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
    path.write_text(json.dumps(data, indent=2) + "\n")
    path.chmod(0o600)
