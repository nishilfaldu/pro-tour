"""Trusted Jev adapter. No app imports, browser credentials, or model-authored code."""
import json
import os
import re
import select
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from .common import TourError, clean_env, stop, write_json, tab_capture_lock


def harness_env():
    names = ('BU_NAME', 'BH_RUNTIME_DIR', 'BH_CONFIG_DIR', 'BH_AGENT_WORKSPACE', 'BH_TMP_DIR', 'BH_TELEMETRY')
    return clean_env(**{k: os.environ[k] for k in names if k in os.environ},
                     PYTHONPATH=str(Path(__file__).resolve().parents[1]))


def page_evidence(page):
    return {k: page[k] for k in ('url', 'title', 'text', 'actions')}


def verify_checks(page, checks):
    results = []
    for check in checks:
        kind, expected = check['kind'], check['expected']
        if kind == 'text_present':
            passed = expected in page['text']
        elif kind == 'text_absent':
            passed = expected not in page['text']
        else:
            matches = [a for a in page['actions'] if a.get('label', '').split(' → ')[0] == check['label']]
            values = {str(a.get('current_value', a.get('value', ''))) for a in matches}
            passed = bool(matches) and values == {expected}
        results.append({**check, 'passed': passed})
    return results


def safe_text(values, fallback=None):
    remaining = {item['label'].casefold(): list(item['values']) for item in values}

    def provide(context):
        field = context['field']['label'].casefold()
        if re.search(r'password|credential|token|secret|api.?key|verification|one.time|authentication|credit.?card', field):
            raise TourError('Credential or sensitive text entry is unsupported')
        matches = [label for label, items in remaining.items() if label == field and items]
        if not matches and field not in remaining and fallback:
            return fallback(context)
        if len(matches) != 1:
            raise TourError('No unique plan-authored safe text value for observed field')
        return remaining[matches[0]].pop(0), {'model': 'codex-plan', 'latency_ms': 0, 'usage': {}}
    return provide


def initialize(tab=None, tab_id=None):
    import pro_tour._vendor.jev_ultrafast.browser as browser
    from browser_harness.admin import require_existing_daemon
    browser.ensure_daemon = require_existing_daemon
    original = browser.Browser

    class AppBrowser(original):
        attached = []

        def __init__(self, url):
            from .tabs import select_app_tab
            self.allowed_origin = urlsplit(url).netloc
            self.session = None
            self.target = None
            try:
                require_existing_daemon()
                self.tab = select_app_tab(url, tab['id'] if tab else tab_id,
                                          expected_window=tab['window_id'] if tab else None)
                self.target = self.tab['id']
                self.session = browser.cdp('Target.attachToTarget', targetId=self.target, flatten=True)['sessionId']
                self.attached.append(self)
                self.call('Page.bringToFront')
                deadline = time.monotonic() + 15
                while self.evaluate('document.readyState') != 'complete':
                    if time.monotonic() >= deadline:
                        raise TourError('App tab did not finish loading before recording')
                    time.sleep(.05)
            except BaseException:
                self.close()
                raise

        def close(self):
            # Both reused and newly opened app tabs remain available for the user.
            if self.session:
                session, self.session = self.session, None
                try:
                    browser.cdp('Target.detachFromTarget', sessionId=session)
                except RuntimeError:
                    pass  # Chrome also detaches when its user closes a tab.
            self.target = None
            if self in self.attached:
                self.attached.remove(self)

        @classmethod
        def detach_all(cls):
            # Agent construction can fail during its first observation, before the caller
            # receives the Agent. Keep that attachment reachable for final cleanup too.
            for instance in tuple(cls.attached):
                instance.close()

        def observe(self, screenshot=True):
            # Readiness only: keep the existing outcome assertions unchanged. Accessible apps
            # announce pending updates with aria-busy; don't decide from their intermediate DOM.
            deadline = time.monotonic() + 5
            while self.evaluate("Boolean(document.querySelector('[aria-busy=true]'))"):
                if time.monotonic() >= deadline:
                    raise TourError('App remained busy for 5 seconds; no action executed from its intermediate state')
                time.sleep(.1)
            with tab_capture_lock(self.session):
                return super().observe(screenshot=screenshot)

        def act(self, action, page, text=None):
            if urlsplit(page['url']).netloc != self.allowed_origin:
                raise TourError('Browser left the local app origin')
            if action['kind'] == 'fill':
                node = action['node']
                if self.evaluate(f"window.__jevFast?.nodes.get({node})?.type === 'password'"):
                    raise TourError('Password entry is unsupported')
            with tab_capture_lock(self.session):
                result = super().act(action, page, text=text)
            # Let the recording show each chosen interaction before the next decision.
            if action['kind'] != 'wait':
                time.sleep(.75)
            return result

    browser.Browser = AppBrowser
    import pro_tour._vendor.jev_ultrafast.agent as jev_agent
    jev_agent.Browser = AppBrowser
    return browser


def install_model_retries():
    """Retry only decision requests, before Jev executes an action."""
    import httpx
    import pro_tour._vendor.jev_ultrafast.model as model
    def request(url, key, body):
        for attempt in range(3):
            try:
                response = model.CLIENT.post(url, json=body, headers={'Authorization': f'Bearer {key}'})
            except httpx.HTTPError:
                if attempt < 2:
                    time.sleep(.5 * 2**attempt)
                    continue
                raise TourError('TypeSafe connection failed after 3 attempts; no action executed') from None
            if response.status_code in {429, 500, 502, 503, 504, 529} and attempt < 2:
                time.sleep(.5 * 2**attempt)
                continue
            if response.is_error:
                raise TourError(f'TypeSafe returned HTTP {response.status_code}; no action executed')
            try:
                return response.json()
            except ValueError:
                raise TourError('TypeSafe returned invalid JSON; no action executed') from None
    model.post_json = request


def inspect(url, output, tab_id=None):
    browser = initialize(tab_id=tab_id).Browser(url)
    try:
        write_json(output, {**page_evidence(browser.observe(screenshot=False)), 'tab': browser.tab})
    finally:
        browser.close()


def execute(url, plan, video):
    import pro_tour._vendor.jev_ultrafast.agent as jev_agent
    adapter = initialize(tab=plan['tab']).Browser
    install_model_retries()
    from pro_tour._vendor.jev_ultrafast import Agent
    def observed_text(context):
        from .providers import PROVIDERS
        config = plan.get('planner')
        if not config:
            raise TourError('No configured Codex text helper for this observed field')
        token = os.environ.get('TYPESAFE_API_KEY', '')
        if token and token in json.dumps(context):
            raise TourError('Credential detected in text context')
        value, metadata = PROVIDERS[config['provider']].text(model=config['model'], context=context)
        if token and token in value:
            raise TourError('Credential detected in generated text')
        return value, metadata

    jev_agent.field_text = safe_text(plan['text_values'], fallback=observed_text)
    partial = video.with_name(video.stem + '.partial.mp4')
    trace_path = video.with_suffix('.trace.json')
    trace = {'status': 'failure', 'steps': [], 'actions': [], 'decisions': [], 'error': None}
    recorder = None
    agent = None
    try:
        agent = Agent(url, plan['steps'][0]['goal'])
        trace['tab'] = agent.browser.tab
        # Reject unsupported credential fields before capturing any page pixels.
        if agent.browser.evaluate("Boolean(document.querySelector('input[type=password]'))"):
            raise TourError('Authenticate before recording; password forms are unsupported')
        recorder = subprocess.Popen([sys.executable, '-m', 'pro_tour.recorder', agent.browser.session, str(partial)],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    env=harness_env(), text=True)
        if not select.select([recorder.stdout], [], [], 20)[0] or recorder.stdout.readline().strip() != 'READY':
            raise TourError('Recorder failed to become ready')
        time.sleep(1)
        verified = True
        for step in plan['steps']:
            agent.state['goal'] = step['goal']
            agent.state['status'] = 'ready'
            entry = {'goal': step['goal'], 'before': page_evidence(agent.browser.observe(screenshot=False)),
                     'checks': [], 'jev_status': 'running'}
            trace['steps'].append(entry)
            last_action_count, stalled = len(agent.state['history']), 0
            for state in agent.run():
                # Stop a navigation away from the local app, rather than following its instructions.
                if urlsplit(state['page']['url']).netloc != urlsplit(url).netloc:
                    raise TourError('Jev left the local app origin')
                if recorder.poll() is not None:
                    raise TourError('Recorder stopped during the tour')
                count = len(agent.state['history'])
                stalled = stalled + 1 if count == last_action_count and state['status'] == 'ready' else 0
                last_action_count = count
                if stalled >= 5:
                    raise TourError('Browser target stayed stale or covered for 5 decisions; inspect the trace before retrying')
            entry['jev_status'] = agent.state['status']
            fresh = agent.browser.observe(screenshot=False)
            entry['after'] = page_evidence(fresh)
            entry['checks'] = verify_checks(fresh, step['checks'])
            if agent.state['status'] != 'done' or any(not c['passed'] for c in entry['checks']):
                raise TourError('Feature outcome was not demonstrated; inspect the action trace')
            verified = verified and bool(entry['checks'])
            time.sleep(1.5)
        trace['status'] = 'success' if verified and agent.state['history'] else 'unverified'
    except BaseException as exc:
        trace['error'] = str(exc) if isinstance(exc, TourError) else f'{type(exc).__name__}: tour execution failed'
    finally:
        if recorder:
            if recorder.poll() is None:
                try:
                    recorder.stdin.write('STOP\n')
                    recorder.stdin.flush()
                    recorder.stdin.close()
                    recorder.wait(timeout=25)
                except (BrokenPipeError, subprocess.TimeoutExpired):
                    stop(recorder)
            if recorder.returncode != 0:
                trace['status'], trace['error'] = 'failure', 'Recording process failed'
        if partial.exists():
            # Preserve a finalized failure video too; callers validate before publication.
            partial.chmod(0o600)
            os.replace(partial, video)
        if agent:
            trace['actions'] = agent.state['history']
            trace['decisions'] = [{k: d[k] for k in ('operation', 'target', 'confidence', 'model', 'latency_ms', 'usage')}
                                  for d in agent.state['decisions']]
            try:
                agent.close()
            except Exception:
                trace['status'], trace['error'] = 'failure', 'App tab detachment failed'
        try:
            adapter.detach_all()
        except Exception:
            trace['status'], trace['error'] = 'failure', 'App tab detachment failed'
        token = os.environ.get('TYPESAFE_API_KEY', '')
        if token and token in json.dumps(trace):
            trace = json.loads(json.dumps(trace).replace(token, '[REDACTED]'))
        write_json(trace_path, trace)
    return trace


if __name__ == '__main__':
    try:
        if sys.argv[1] == 'inspect':
            inspect(sys.argv[2], Path(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else None)
        else:
            result = execute(sys.argv[2], json.loads(Path(sys.argv[3]).read_text()), Path(sys.argv[4]))
            sys.exit(1 if result['status'] == 'failure' else 0)
    except BaseException as exc:
        if isinstance(exc, SystemExit):
            raise
        if sys.argv[1] == 'inspect' and isinstance(exc, TourError):
            write_json(Path(sys.argv[3]), {'error': str(exc)})
        print('Browser inspection or tour failed', file=sys.stderr)
        sys.exit(1)
