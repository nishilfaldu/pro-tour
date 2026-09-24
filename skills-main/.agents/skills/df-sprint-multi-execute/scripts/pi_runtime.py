"""Build a private Pi configuration from LunaRoute's live model catalog."""
import json
import os
import re
import subprocess
from pathlib import Path
from urllib import request

BASE_URL = 'https://gw.lunaroute.com/v1'
MIN_PI = (0, 85, 1)


def require_pi():
    result = subprocess.run(['pi', '--version'], capture_output=True, text=True, timeout=15)
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', result.stdout.strip())
    if result.returncode or not match or tuple(map(int, match.groups())) < MIN_PI:
        raise ValueError('Pi >= 0.85.1 is required; install/update @earendil-works/pi-coding-agent')
    return result.stdout.strip()


def model_config(catalog, model):
    if not isinstance(catalog, dict) or not isinstance(catalog.get('data'), list):
        raise ValueError('Invalid LunaRoute model catalog')
    if any(not isinstance(entry, dict) for entry in catalog['data']):
        raise ValueError('Invalid LunaRoute model entry')
    matches = [entry for entry in catalog['data'] if entry.get('id') == model]
    if len(matches) != 1:
        raise ValueError('Requested LunaRoute model is missing or duplicated in the live catalog')
    entry = matches[0]
    capabilities = entry.get('capabilities', {})
    client_compat = entry.get('client_compat', {})
    if not isinstance(capabilities, dict) or not isinstance(client_compat, dict):
        raise ValueError('Invalid LunaRoute capability or compatibility metadata')
    meta = client_compat.get('pi') or entry.get('pi')
    if not isinstance(meta, dict) or not isinstance(meta.get('thinkingLevelMap'), dict):
        raise ValueError('LunaRoute model lacks required Pi compatibility metadata')
    compat = meta.get('compat') or {k: v for k, v in meta.items() if k != 'thinkingLevelMap'}
    if not isinstance(compat, dict):
        raise ValueError('Invalid LunaRoute Pi compatibility metadata')
    if model != 'deepseek-4.1-flash':
        raise ValueError('Pi is reserved for the DeepSeek lane')
    expected = 'deepseek_v41'
    if compat.get('thinkingFormat') != expected:
        raise ValueError('Unexpected LunaRoute thinking format; requalify the Pi transport')
    effort = meta['thinkingLevelMap'].get('high')
    if effort != 'high':
        raise ValueError('DeepSeek high reasoning mapping is unsupported; requalify catalog metadata')
    sizes = [entry.get('context_window'), entry.get('max_output_tokens')]
    if any(type(n) is not int or n <= 0 for n in sizes):
        raise ValueError('LunaRoute catalog is missing valid token limits')
    return {'id': model, 'name': model, 'reasoning': capabilities.get('reasoning') is True,
            'input': ['text', 'image'] if capabilities.get('vision') else ['text'],
            'contextWindow': sizes[0], 'maxTokens': sizes[1],
            'thinkingLevelMap': meta['thinkingLevelMap'], 'compat': compat}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def configure(agent_dir, model):
    key = os.environ.get('LUNAROUTE_API_KEY')
    if not key:
        raise ValueError('LUNAROUTE_API_KEY is required for the isolated Pi lane')
    req = request.Request(BASE_URL + '/models', headers={'Authorization': 'Bearer ' + key})
    try:
        with request.build_opener(NoRedirect).open(req, timeout=30) as response:
            catalog = json.load(response)
    except Exception:
        raise ValueError('Could not fetch LunaRoute model catalog; check connectivity and existing key') from None
    model_entry = model_config(catalog, model)
    config = {'providers': {'lunaroute': {'baseUrl': BASE_URL, 'api': 'openai-completions',
              'apiKey': '$LUNAROUTE_API_KEY', 'models': [model_entry]}}}
    root = Path(agent_dir)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    for name, data in [('models.json', config), ('settings.json', {'retry': {'enabled': False}})]:
        p = root / name
        p.write_text(json.dumps(data, indent=2) + '\n')
        p.chmod(0o600)
    return model_entry


def preflight_verified(log, model):
    tool_ok = final_ok = terminal = failed = False
    calls = {}
    for line in log.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        kind = event.get('type')
        if kind == 'tool_execution_start':
            calls[event.get('toolCallId')] = event.get('toolName') == 'bash' and event.get('args', {}).get('command') == 'printf LUNAROUTE_TOOL_OK'
        elif kind == 'tool_execution_end':
            result = event.get('result', {})
            output = ''.join(p.get('text', '') for p in result.get('content', []) if p.get('type') == 'text')
            tool_ok |= bool(calls.get(event.get('toolCallId')) and not event.get('isError') and output.strip() == 'LUNAROUTE_TOOL_OK')
            failed |= bool(event.get('isError'))
        elif kind == 'message_end':
            msg = event.get('message', {})
            if msg.get('role') == 'assistant':
                failed |= msg.get('stopReason') in ('error', 'aborted')
                answer = ''.join(p.get('text', '') for p in msg.get('content', []) if p.get('type') == 'text')
                final_ok = (msg.get('model') == model and msg.get('provider') == 'lunaroute'
                            and msg.get('stopReason') == 'stop' and answer.strip() == 'LUNAROUTE_PREFLIGHT_OK')
        elif kind == 'agent_settled':
            terminal = True
    return tool_ok and final_ok and terminal and not failed


def execution_verified(log, model):
    """Pi may exit zero on provider failure: require a settled, successful final message."""
    final_ok = settled = failed = False
    for line in log.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get('type') == 'message_end':
            msg = event.get('message', {})
            if msg.get('role') == 'assistant':
                failed |= msg.get('stopReason') in ('error', 'aborted')
                final_ok = (msg.get('stopReason') == 'stop' and msg.get('model') == model
                            and msg.get('provider') == 'lunaroute')
                settled = False
        elif event.get('type') == 'agent_settled':
            settled = True
    return final_ok and settled and not failed
