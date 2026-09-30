"""Real, opt-in Codex/Jev/recording benchmark. No automatic PR trigger or browser launch."""
import sys
sys.dont_write_bytecode = True

import argparse
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path

from pro_tour.browser import connected_browser
from pro_tour.cli import DEFAULT_SECRETS, parser as cli_parser, record
from pro_tour.common import TourError, clean_env, run, stop, write_json
from pro_tour.repository import credential_file

ROOT = Path(__file__).resolve().parent
SEED_NAMES = {'Draft release notes', 'Review onboarding flow', 'Approve color palette'}


def oracle(kind, events):
    if any(e.get('kind') == 'fixture-error' for e in events): return False
    states = [e for e in events if e.get('kind') == 'render']
    if not states: return False
    final = states[-1]
    if kind == 'create_edit_filter':
        old = any(any(t['name'] == 'Prepare tour rehearsal' and t['status'] == 'todo' and t['details'] == 'Synthetic release checklist' for t in e['tasks']) for e in states)
        task = next((t for t in final['tasks'] if t['name'] == 'Prepare product tour'), {})
        return old and task.get('status') == 'done' and task.get('details') == 'Synthetic checklist reviewed' and final['filter'] == 'done' and set(final['visible']) == {'Prepare product tour', 'Approve color palette'}
    if kind == 'search_recovery':
        narrowed = any(e['search'] == 'onboarding' and e['visible'] == ['Review onboarding flow'] for e in states)
        empty = any(e['search'] == 'synthetic-no-match' and not e['visible'] for e in states)
        return narrowed and empty and final['search'] == '' and set(final['visible']) == SEED_NAMES
    if kind == 'cancel_edit':
        cancelled = any(e.get('kind') == 'cancel' and e.get('name') == 'Discarded synthetic draft' and e.get('details') == 'Discarded synthetic details' for e in events)
        original = next((t for t in final['tasks'] if t['name'] == 'Draft release notes'), {})
        return cancelled and set(final['visible']) == SEED_NAMES and any(e['filter'] == 'todo' and e['visible'] == ['Draft release notes'] for e in states) and all(t['name'] != 'Discarded synthetic draft' for e in states for t in e['tasks']) and original.get('details') == 'Summarize the latest changes for the team.'
    raise ValueError('Unknown benchmark oracle')


def call(url, method='GET'):
    request = urllib.request.Request(url, method=method)
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=5) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Keep artifacts in this new directory (default: temporary, removed after the run)')
    parser.add_argument('--keep-artifacts', action='store_true', help='Keep artifacts under .artifacts/benchmarks for debugging')
    parser.add_argument('--cdp-url')
    parser.add_argument('--model', default='gpt-6-luna')
    parser.add_argument('--cases', nargs='+')
    parser.add_argument('--secrets-file', type=Path, default=DEFAULT_SECRETS)
    args = parser.parse_args()
    os.umask(0o077)
    os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
    if args.output or args.keep_artifacts:
        output = (args.output or Path('.artifacts/benchmarks') / time.strftime('%Y%m%d-%H%M%S')).resolve()
        output.mkdir(parents=True, exist_ok=False)
        print('Keeping validation artifacts: ' + str(output), flush=True)
        return benchmark(args, output)
    with tempfile.TemporaryDirectory(prefix='pro-tour-benchmark-') as directory:
        return benchmark(args, Path(directory))


def benchmark(args, output):
    repo = output / 'app'
    repo.mkdir()
    run(['git', 'init', '-b', 'main', str(repo)])
    for name, value in [('user.name', 'Pro Tour Benchmark'), ('user.email', 'benchmark@example.test')]: run(['git', 'config', name, value], cwd=repo)
    (repo / 'README.md').write_text('Synthetic Fieldnotes baseline\n')
    run(['git', 'add', 'README.md'], cwd=repo)
    run(['git', 'commit', '-m', 'Benchmark baseline'], cwd=repo)
    run(['git', 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=repo)
    run(['git', 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], cwd=repo)
    run(['git', 'checkout', '-b', 'bench/fieldnotes'], cwd=repo)
    for name in ('index.html', 'app.js', 'style.css'): (repo / name).write_bytes((ROOT / 'fieldnotes' / name).read_bytes())
    run(['git', 'add', '.'], cwd=repo)
    run(['git', 'commit', '-m', 'Add synthetic forms, filters and delayed search'], cwd=repo)
    cases = json.loads((ROOT / 'cases.json').read_text())
    if args.cases: cases = [case for case in cases if case['id'] in args.cases]
    if not cases: raise TourError('No benchmark cases selected')
    secrets = credential_file(args.secrets_file)
    for name in ('TYPESAFE_API_KEY', 'GH_MEDIA_TOKEN'):
        if os.environ.get(name): secrets[name] = os.environ[name]
    results = []
    server = None
    identity = None
    original = Path.cwd()
    def run_cases(env, identity, url, app_tab, workspace):
        for case in cases:
            call(url + '/reset', 'POST')
            run([sys.executable, str(ROOT / 'browser_probe.py'), 'reset', url, str(app_tab)], env=env, timeout=20)
            selected = json.loads(app_tab.read_text())
            print('Benchmark case: ' + case['id'], flush=True)
            options = cli_parser().parse_args(['record', '--url', url, '--goal', case['goal'], '--model', args.model])
            before = set((repo / '.videos').glob('*.report.json'))
            os.chdir(repo)
            started = time.monotonic()
            try:
                with (output / (case['id'] + '.log')).open('w') as log, redirect_stdout(log):
                    code = record(options, secrets, browser_session=(env, identity))
            finally: os.chdir(original)
            reports = list(set((repo / '.videos').glob('*.report.json')) - before)
            if len(reports) != 1: raise TourError('Benchmark expected exactly one recording report')
            report = json.loads(reports[0].read_text())
            snapshot = workspace / 'snapshot.json'
            run([sys.executable, str(ROOT / 'browser_probe.py'), 'check', url, str(app_tab), str(snapshot)], env=env, timeout=10)
            state = json.loads(snapshot.read_text())
            tab_preserved = state['document_preserved'] and state['tabs_unchanged'] and report.get('tab', {}).get('id') == selected['id'] and report.get('tab', {}).get('window_id') == selected['window_id']
            events = call(url + '/events')['events']
            passed = oracle(case['oracle'], events)
            playback = reports[0].with_suffix('.playback.json')
            played = False
            if report['video_saved']:
                try:
                    run([sys.executable, str(ROOT / 'browser_probe.py'), 'play', url + '/player/' + Path(report['video']).name, str(playback)], env=env, timeout=310)
                    played = json.loads(playback.read_text()).get('ended') is True
                except TourError: pass
            trace = json.loads(Path(report['video']).with_suffix('.trace.json').read_text())
            result = {'case': case['id'], 'task_completed': passed, 'reported_status': report['status'],
                      'false_success': report['status'] == 'success' and not passed, 'video_played': played,
                      'elapsed_seconds': round(time.monotonic()-started, 3), 'exit_code': code,
                      'tab_preserved': tab_preserved, 'tab': state, 'video': report['video'], 'model': args.model, 'planner_usage': report.get('planner_usage'),
                      'decision_usage': [d.get('usage', {}) for d in trace.get('decisions', [])],
                      'cost_usd': None, 'cost_note': 'Provider billing totals are not exposed; usage is recorded without invented dollar costs.'}
            write_json(output / (case['id'] + '.events.json'), {'events': events})
            results.append(result)
            write_json(output / 'results.json', {'browser': identity, 'results': results})
            print(json.dumps({k: result[k] for k in ('case', 'task_completed', 'reported_status', 'false_success', 'video_played', 'tab_preserved')}), flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix='pro-tour-bench-') as directory:
            workspace = Path(directory)
            ready = workspace / 'server.json'
            server = subprocess.Popen([sys.executable, str(ROOT / 'fieldnotes/server.py'), '--ready', str(ready), '--videos', str(repo / '.videos')], env=clean_env(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if ready.exists(): break
                if server.poll() is not None: raise TourError('Benchmark fixture server failed')
                time.sleep(.05)
            url = json.loads(ready.read_text())['url']
            with connected_browser(workspace, args.cdp_url) as (env, identity):
                app_tab = workspace / 'app-tab.json'
                try:
                    run([sys.executable, str(ROOT / 'browser_probe.py'), 'prepare', url, str(app_tab)], env=env, timeout=20)
                    run_cases(env, identity, url, app_tab, workspace)
                finally:
                    run([sys.executable, str(ROOT / 'browser_probe.py'), 'cleanup', url, str(app_tab)], env=env, timeout=10)

    except BaseException as exc:
        write_json(output / 'results.json', {'status': 'failure', 'browser': identity,
            'error': str(exc) if isinstance(exc, TourError) else 'Benchmark interrupted or setup data unavailable', 'results': results})
        raise
    finally:
        os.chdir(original)
        if server: stop(server)
    summary = {'browser': identity, 'cases': len(results), 'task_completion_rate': sum(r['task_completed'] for r in results)/len(results),
               'false_success_count': sum(r['false_success'] for r in results),
               'video_playback_rate': sum(r['video_played'] for r in results)/len(results),
               'tabs_preserved': all(r['tab_preserved'] for r in results), 'versions_preserved': len({r['video'] for r in results}) == len(results), 'results': results}
    write_json(output / 'results.json', summary)
    print(json.dumps({k: v for k, v in summary.items() if k != 'results'}, indent=2))
    return 0 if all(r['task_completed'] and r['video_played'] and r['tab_preserved'] and not r['false_success'] for r in results) else 1


if __name__ == '__main__':
    try: sys.exit(main())
    except (TourError, KeyboardInterrupt) as exc:
        print(str(exc) or 'Benchmark interrupted; owned processes stopped', file=sys.stderr)
        sys.exit(1)
