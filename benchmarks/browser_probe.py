"""Benchmark-only CDP setup and full video playback, using the existing harness."""
import base64
import json
import sys
import time
import uuid
from pathlib import Path
from browser_harness.helpers import cdp
from pro_tour.tabs import select_app_tab


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


def prepare(url, output, reset=False):
    previous = json.loads(output.read_text()) if reset else None
    tab = select_app_tab(url, previous['id'] if previous else None)
    if previous:
        tab['created'] = previous['created']
    output.write_text(json.dumps(tab))  # Track ownership before any later setup failure.
    session = cdp('Target.attachToTarget', targetId=tab['id'], flatten=True)['sessionId']
    try:
        if reset:
            cdp('Page.reload', session_id=session, ignoreCache=True)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if evaluate(session, "document.readyState === 'complete' && document.querySelectorAll('.task').length === 3"):
                tab['marker'] = str(uuid.uuid4())
                evaluate(session, 'window.proTourBenchmarkMarker = ' + json.dumps(tab['marker']))
                tab['targets'] = sorted(t['targetId'] for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'page')
                output.write_text(json.dumps(tab))
                return
            time.sleep(.1)
        raise RuntimeError('Benchmark app setup failed')
    finally: cdp('Target.detachFromTarget', sessionId=session)


def check(url, descriptor, output):
    expected = json.loads(descriptor.read_text())
    tab = select_app_tab(url, expected['id'], expected_window=expected['window_id'])
    session = cdp('Target.attachToTarget', targetId=tab['id'], flatten=True)['sessionId']
    try:
        marker = evaluate(session, 'window.proTourBenchmarkMarker')
        targets = sorted(t['targetId'] for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'page')
        output.write_text(json.dumps({**tab, 'document_preserved': marker == expected['marker'],
                                      'tabs_unchanged': targets == expected['targets']}))
    finally: cdp('Target.detachFromTarget', sessionId=session)


def cleanup(descriptor):
    if descriptor.exists():
        tab = json.loads(descriptor.read_text())
        if tab['created']:
            cdp('Target.closeTarget', targetId=tab['id'])


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
    if sys.argv[1] in {'prepare', 'reset'}: prepare(sys.argv[2], Path(sys.argv[3]), reset=sys.argv[1] == 'reset')
    elif sys.argv[1] == 'check': check(sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4]))
    elif sys.argv[1] == 'cleanup': cleanup(Path(sys.argv[3]))
    elif sys.argv[1] == 'play':
        try: play(sys.argv[2], Path(sys.argv[3]))
        except Exception as exc:
            Path(sys.argv[3]).with_suffix('.error.json').write_text(json.dumps({'error': str(exc)[:300], 'type': type(exc).__name__}))
            sys.exit(1)
