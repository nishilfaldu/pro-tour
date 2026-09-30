"""Benchmark-only CDP setup and full video playback, using the existing harness."""
import base64
import json
import sys
import time
from pathlib import Path
from browser_harness.helpers import cdp


def owned_tab():
    target = cdp('Target.createTarget', url='about:blank', background=True)['targetId']
    session = cdp('Target.attachToTarget', targetId=target, flatten=True)['sessionId']
    return target, session


def evaluate(session, expression):
    result = cdp('Runtime.evaluate', session_id=session, expression=expression, returnByValue=True)
    if result.get('exceptionDetails'):
        detail = result['exceptionDetails'].get('exception', {}).get('description', 'evaluation failed')
        raise RuntimeError('Benchmark browser evaluation: ' + detail.splitlines()[0][:200])
    return result.get('result', {}).get('value')


def setup(url):
    target, session = owned_tab()
    try:
        cdp('Page.navigate', session_id=session, url=url + '/setup')
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if evaluate(session, "document.readyState === 'complete' && document.body.innerText.includes('Synthetic demo session ready')"):
                return
            time.sleep(.1)
        raise RuntimeError('Benchmark session setup failed')
    finally: cdp('Target.closeTarget', targetId=target)


def play(url, output):
    target, session = owned_tab()
    try:
        cdp('Emulation.setDeviceMetricsOverride', session_id=session, width=1120, height=780, deviceScaleFactor=1, mobile=False)
        cdp('Page.navigate', session_id=session, url=url)
        cdp('Page.bringToFront', session_id=session)
        deadline = time.monotonic() + 300
        state = {}
        while time.monotonic() < deadline:
            state = evaluate(session, "(() => {const player=document.querySelector('video'); return player ? {ended:player.ended, time:player.currentTime, duration:Number.isFinite(player.duration)?player.duration:null, ready:player.readyState, error:player.error?.code??null} : null})()")
            if state is None:
                time.sleep(.1)
                continue
            if state['error']: raise RuntimeError('Benchmark video playback failed')
            if state['ended']:
                output.write_text(json.dumps(state, indent=2))
                screenshot = cdp('Page.captureScreenshot', session_id=session, format='jpeg', quality=85)['data']
                output.with_suffix('.jpg').write_bytes(base64.b64decode(screenshot))
                return
            time.sleep(.5)
        raise RuntimeError('Benchmark video playback timed out')
    finally: cdp('Target.closeTarget', targetId=target)


if __name__ == '__main__':
    if sys.argv[1] == 'setup': setup(sys.argv[2])
    elif sys.argv[1] == 'play':
        try: play(sys.argv[2], Path(sys.argv[3]))
        except Exception as exc:
            Path(sys.argv[3]).with_suffix('.error.json').write_text(json.dumps({'error': str(exc)[:300], 'type': type(exc).__name__}))
            sys.exit(1)
