"""User-owned settings and interactive onboarding; never read app configuration."""
import getpass
import json
import os
import re
import sys
import tempfile
import warnings
from pathlib import Path

from .common import TourError
from .repository import credential_file

DEFAULT_MODEL = 'gpt-6-luna'


def settings_path():
    return Path.home() / '.config/pro-tour/config.json'


def valid_model(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,99}', value):
        raise TourError('Enter a Codex model name, such as gpt-6-luna')
    return value


def configured_model():
    path = settings_path()
    if not path.exists():
        return DEFAULT_MODEL
    try:
        return valid_model(json.loads(path.read_text())['model'])
    except (OSError, ValueError, KeyError, TypeError, TourError) as exc:
        raise TourError('Cannot read Pro Tour settings; run pro-tour setup to configure them again') from exc


def private_write(path, text):
    path = Path(path)
    if path.is_symlink() or path.parent.is_symlink():
        raise TourError('Configuration paths must not be symlinks')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as file:
            file.write(text)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def ask_secret(name, existing):
    if os.environ.get(name):
        print(f'{name}: using the environment value; it will not be copied to disk.')
        return existing.get(name)
    suffix = ' (Enter to keep the existing key)' if existing.get(name) else ''
    while True:
        try:
            # getpass otherwise falls back to echoed input when terminal control fails.
            with warnings.catch_warnings():
                warnings.simplefilter('error', getpass.GetPassWarning)
                value = getpass.getpass(name + suffix + ': ').strip()
        except getpass.GetPassWarning as exc:
            raise TourError('Cannot hide credential input; run pro-tour setup in an interactive terminal') from exc
        if not value and existing.get(name):
            return existing[name]
        if value and not re.search(r'[\s\x00-\x1f\x7f\'\"]', value):
            return value
        print('Enter a nonempty key without whitespace or quotes. Input stays hidden.')


def ask_yes_no(prompt, default=False):
    while True:
        answer = input(prompt + (' [Y/n]: ' if default else ' [y/N]: ')).strip().lower()
        if not answer:
            return default
        if answer in {'y', 'yes', 'n', 'no'}:
            return answer in {'y', 'yes'}
        print('Please enter yes or no.')


def interactive_terminal():
    return sys.stdin.isatty() and sys.stdout.isatty()


def setup(args):
    if not interactive_terminal():
        raise TourError('Run pro-tour setup in an interactive terminal; credential input must stay hidden')
    credentials = args.secrets_file.expanduser().absolute()
    settings = settings_path()
    if credentials == settings:
        raise TourError('Credentials and settings must use separate files')
    for path in (credentials, settings):
        if path.is_symlink() or path.parent.is_symlink():
            raise TourError('Configuration paths must not be symlinks')
    existing = credential_file(credentials)
    original = credentials.read_text() if credentials.exists() else ''
    try:
        model = configured_model()
    except TourError:
        print('Existing model settings are invalid; this setup will replace them.')
        model = DEFAULT_MODEL
    print('Set up Pro Tour. Credential input is hidden; Enter keeps an existing key.')
    print('Codex uses your existing CLI login. TypeSafe powers browser actions.')
    try:
        while True:
            try:
                model = valid_model(input(f'Default Codex model [{model}]: ').strip() or model)
                break
            except TourError as exc:
                print(str(exc))
        keys = dict(existing)
        keys['TYPESAFE_API_KEY'] = ask_secret('TYPESAFE_API_KEY', existing)
        publishing = ask_yes_no('Set up optional GitHub PR publishing now?',
                                bool(existing.get('GH_MEDIA_TOKEN') or os.environ.get('GH_MEDIA_TOKEN')))
        if publishing:
            keys['GH_MEDIA_TOKEN'] = ask_secret('GH_MEDIA_TOKEN', existing)
    except EOFError as exc:
        raise TourError('Setup input ended; no configuration was changed') from exc
    # Collect all answers before writing. Preserve unrelated entries and comments.
    lines = [line for line in original.splitlines()
             if line.strip().removeprefix('export ').split('=', 1)[0].strip() not in keys]
    lines.extend(f'{name}={value}' for name, value in keys.items() if value)
    if lines or credentials.exists():
        private_write(credentials, '\n'.join(lines) + '\n')
        print(f'Credentials saved privately to {credentials}')
    private_write(settings, json.dumps({'model': model}, indent=2) + '\n')
    print(f'Model preference saved to {settings}')
    print('Publishing still requires an explicit --publish or pro-tour publish command.')
    from argparse import Namespace
    from .health import check_setup
    effective = {name: os.environ.get(name) or value for name, value in keys.items()}
    checks = check_setup(Namespace(url=None, base=None, cdp_url=None, publish=publishing, connect=False), effective)
    print('\nChecking prerequisites (no model calls or browser connection):')
    for check in checks['checks']:
        if check['check'] == 'repository' or (not publishing and check['check'] in {'github', 'media-token'}):
            continue
        print(f'  {check["status"]}: {check["check"]}')
        if check['status'] != 'ok':
            print('    ' + str(check['detail']))
            if check['check'] == 'codex-auth':
                print('    Run codex login, then pro-tour doctor.')
            elif check['check'] == 'github':
                print('    Install/update gh and run gh auth login, then pro-tour doctor --publish.')
    print('\nNext: enable remote debugging in Chrome, run pro-tour connect in another terminal,')
    print('then run pro-tour record --url <local-app-url> --goal "<feature to show>" from your app repository.')
    if checks['status'] == 'failure':
        print('Configuration saved. Resolve the failed checks above, then run pro-tour doctor.')
        return 1
    print('Setup complete. Keys will be validated by your first recording or publication.')
    return 0
