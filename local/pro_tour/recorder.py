"""Credential-free, constant-rate tab-only MP4 capture via Browser Harness CDP."""
import base64
import select
import subprocess
import sys
import time

from .common import clean_env, stop


def record(session, output):
    from browser_harness.admin import require_existing_daemon
    from browser_harness.helpers import cdp
    require_existing_daemon()
    encoder = subprocess.Popen([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-f', 'image2pipe', '-framerate', '5',
        '-c:v', 'mjpeg', '-i', '-', '-an', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
    ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=clean_env())
    try:
        start, frames = time.monotonic(), 0
        while True:
            if select.select([sys.stdin], [], [], 0)[0]:
                break  # STOP or parent EOF; both finalize the file.
            frame = cdp('Page.captureScreenshot', session_id=session, format='jpeg', quality=85,
                        captureBeyondViewport=False)['data']
            encoder.stdin.write(base64.b64decode(frame))
            encoder.stdin.flush()
            frames += 1
            if frames == 1:
                print('READY', flush=True)
            # Preserve real elapsed time, duplicating a slow capture for missed frame slots.
            needed = int((time.monotonic() - start) * 5)
            while frames < needed:
                encoder.stdin.write(base64.b64decode(frame))
                encoder.stdin.flush()
                frames += 1
            time.sleep(max(0, start + frames / 5 - time.monotonic()))
        encoder.stdin.close()
        if encoder.wait(timeout=20) != 0 or not frames:
            raise RuntimeError('Encoder failed')
        print('DONE', flush=True)
    finally:
        stop(encoder)


if __name__ == '__main__':
    try:
        record(*sys.argv[1:])
    except BaseException:
        print('Recording failed', file=sys.stderr)
        sys.exit(1)
