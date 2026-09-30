"""Read-only setup checks; no dependency installs, app startup, or model charges."""
import json
import os
import platform
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path
from importlib.metadata import PackageNotFoundError, version

from .browser import connected_browser, existing_connection, select_connection
from .common import TourError, clean_env, run
from .publishing import github_cli, require_media_support
from .repository import derive_base, local_url, repository


def installed_dependencies():
    try:
        return {name: version(name) for name in ('jev-ultrafast', 'browser-harness')}
    except PackageNotFoundError as exc:
        raise TourError('Install Pro Tour Python dependencies before recording; run pro-tour doctor for setup instructions') from exc


def app_ready(url):
    try:
        # No inherited proxy credentials, redirects to remote services, or app startup.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                raise TourError('App redirects during its readiness check; supply its local entry URL after login')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(local_url(url), timeout=5) as response:
            if response.status >= 400:
                raise TourError('App returned an error')
    except Exception as exc:
        raise TourError('App is not reachable at its local entry URL; start/login to it yourself before recording') from exc


def record_dependencies(secrets):
    installed_dependencies()
    for command in ('ffmpeg', 'ffprobe', 'codex'):
        if not shutil.which(command):
            raise TourError(f'{command} must already be installed; run pro-tour doctor for setup instructions')
    if not secrets.get('TYPESAFE_API_KEY'):
        raise TourError('TYPESAFE_API_KEY is required; set it in the trusted credentials file or environment')
    env = clean_env(**({'CODEX_HOME': os.environ['CODEX_HOME']} if os.environ.get('CODEX_HOME') else {}))
    run(['codex', 'login', 'status'], env=env, timeout=10)


def doctor(args, secrets):
    checks = []
    def check(name, operation, *, required=True):
        try:
            detail = operation()
            checks.append({'check': name, 'status': 'ok', 'detail': detail})
        except (TourError, OSError) as exc:
            checks.append({'check': name, 'status': 'failure' if required else 'warning', 'detail': str(exc)})
    check('platform', lambda: platform.system() + (' (validated release target)' if platform.system() == 'Darwin' else ' (experimental; macOS is the release target)'))
    check('python', lambda: sys.version.split()[0])
    check('python-dependencies', installed_dependencies)
    for name in ('ffmpeg', 'ffprobe', 'codex'):
        def tool(name=name):
            path = shutil.which(name)
            if not path: raise TourError(f'Install {name} and put it on PATH')
            return path
        check(name, tool)
    env = clean_env(**({'CODEX_HOME': os.environ['CODEX_HOME']} if os.environ.get('CODEX_HOME') else {}))
    check('codex-auth', lambda: (run(['codex', 'login', 'status'], env=env, timeout=10), 'Existing Codex authentication available')[1])
    def key(name):
        if not secrets.get(name): raise TourError(f'Set {name} in the trusted credentials file or environment; no value was printed')
        return 'set (provider validity will be checked by the real request)'
    check('typesafe-key', lambda: key('TYPESAFE_API_KEY'))
    def github():
        gh = github_cli()
        run([gh, 'auth', 'status'], timeout=10)
        if args.publish: require_media_support(gh)
        return 'GitHub authentication available'
    check('github', github, required=args.publish)
    check('media-token', lambda: key('GH_MEDIA_TOKEN'), required=args.publish)
    if args.url: check('app', lambda: (app_ready(args.url), 'Local app reachable')[1])
    def base():
        repo = repository(Path.cwd())
        if args.base: return derive_base(repo, args.base)[0]
        return 'Use the PR base at recording time, or local origin/HEAD; --base overrides either'
    check('repository', base, required=bool(args.url))
    def browser():
        existing = existing_connection(args.cdp_url)
        if existing: return {**existing[1], 'health': 'approved shared connection healthy'}
        if args.connect:
            with tempfile.TemporaryDirectory(prefix='pro-tour-doctor-') as directory:
                with connected_browser(Path(directory), args.cdp_url) as (_, metadata):
                    return metadata
        _, metadata = select_connection(args.cdp_url)
        return {**metadata, 'health': 'discovered only; use --connect for a real handshake (Chrome may prompt)'}
    check('chrome', browser)
    result = {'status': 'failure' if any(c['status'] == 'failure' for c in checks) else 'ready', 'checks': checks}
    print(json.dumps(result, indent=2))
    return 1 if result['status'] == 'failure' else 0
