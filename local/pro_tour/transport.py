"""Scoped Browser Harness daemon with time for Chrome's per-connection approval."""
import asyncio
import os
import sys
from pathlib import Path
from browser_harness import daemon


def main():
    # Explicit, verified loopback transport keeps Harness away from other Chrome instances.
    # Its regular CDP client has a short handshake timeout; use the library's local
    # approval-aware client. Keep browser_kind=cdp so it never closes user inspect tabs.
    daemon.CDPClient = daemon._PatientCDPClient
    if daemon.already_running():
        return 1
    Path(daemon.LOG).write_text('')
    daemon._publish_own_pid()
    try:
        asyncio.run(daemon.main())
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception:
        daemon.log('fatal: Pro Tour browser transport failed')
        return 1
    finally:
        daemon.stop_remote()
        try: os.unlink(daemon.PID)
        except FileNotFoundError: pass


if __name__ == '__main__': sys.exit(main())
