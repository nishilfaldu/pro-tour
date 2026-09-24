"""Regression tests for the DeepSeek Pi lane; no provider calls."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / '.agents/skills/df-sprint-multi-execute/scripts'
spec = importlib.util.spec_from_file_location('pi_runtime', HELPER / 'pi_runtime.py')
pi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pi)
MODEL = 'deepseek-4.1-flash'
CATALOG = {'data': [{'id': MODEL, 'context_window': 1048576, 'max_output_tokens': 262144,
                    'capabilities': {'reasoning': True, 'vision': True},
                    'client_compat': {'pi': {'thinkingFormat': 'deepseek_v41',
                        'maxTokensField': 'max_tokens', 'supportsReasoningEffort': True,
                        'thinkingLevelMap': {'high': 'high', 'medium': 'medium'}}}}]}


def events():
    return [
        {'type': 'tool_execution_start', 'toolCallId': 'a', 'toolName': 'bash',
         'args': {'command': 'printf LUNAROUTE_TOOL_OK'}},
        {'type': 'tool_execution_end', 'toolCallId': 'a', 'toolName': 'bash', 'isError': False,
         'result': {'content': [{'type': 'text', 'text': 'LUNAROUTE_TOOL_OK'}]}},
        {'type': 'message_end', 'message': {'role': 'assistant', 'model': MODEL,
         'provider': 'lunaroute', 'stopReason': 'stop',
         'content': [{'type': 'text', 'text': 'LUNAROUTE_PREFLIGHT_OK'}]}},
        {'type': 'agent_settled'}]


def log(entries):
    return '\n'.join(json.dumps(e) for e in entries)


class PiRuntimeTests(unittest.TestCase):
    def test_catalog_preserves_compat_and_rejects_drift(self):
        result = pi.model_config(CATALOG, MODEL)
        self.assertEqual(result['compat']['thinkingFormat'], 'deepseek_v41')
        self.assertEqual(result['thinkingLevelMap']['high'], 'high')
        self.assertEqual(result['input'], ['text', 'image'])
        for change in ('absent', 'duplicate', 'format', 'effort', 'limits'):
            data = copy.deepcopy(CATALOG)
            if change == 'absent': data['data'] = []
            elif change == 'duplicate': data['data'] *= 2
            elif change == 'format': data['data'][0]['client_compat']['pi']['thinkingFormat'] = 'zai'
            elif change == 'effort': data['data'][0]['client_compat']['pi']['thinkingLevelMap']['high'] = 'medium'
            else: data['data'][0]['context_window'] = 0
            with self.subTest(change=change), self.assertRaises(ValueError):
                pi.model_config(data, MODEL)

    def test_version_gate(self):
        for version, code, accepted in [('0.85.1', 0, True), ('0.86.0', 0, True),
                                        ('0.84.9', 0, False), ('v0.85.1', 0, False),
                                        ('0.85.1', 1, False)]:
            with self.subTest(version=version, code=code), patch.object(pi.subprocess, 'run', return_value=SimpleNamespace(stdout=version, returncode=code)):
                if accepted:
                    self.assertEqual(pi.require_pi(), version)
                else:
                    with self.assertRaises(ValueError): pi.require_pi()

    def test_malformed_catalog_is_actionable(self):
        for field in ['client_compat', 'capabilities']:
            data = copy.deepcopy(CATALOG)
            data['data'][0][field] = None
            with self.subTest(field=field), self.assertRaises(ValueError):
                pi.model_config(data, MODEL)

    def test_private_config_contains_only_env_reference(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, LUNAROUTE_API_KEY='test-secret'):
            with patch.object(pi.request, 'build_opener') as opener:
                opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps(CATALOG).encode()
                pi.configure(tmp, MODEL)
            content = (Path(tmp) / 'models.json').read_text()
            self.assertNotIn('test-secret', content)
            self.assertIn('$LUNAROUTE_API_KEY', content)
            self.assertEqual(json.loads(content)['providers']['lunaroute']['api'], 'openai-completions')
            self.assertEqual((Path(tmp) / 'models.json').stat().st_mode & 0o777, 0o600)

    def test_proof_requires_tool_identity_final_and_settlement(self):
        self.assertTrue(pi.preflight_verified(log(events()), MODEL))
        self.assertTrue(pi.execution_verified(log(events()), MODEL))
        for change in ('no_tool', 'bad_command', 'bad_id', 'tool_error', 'wrong_model', 'provider_error', 'unsettled'):
            e = events()
            if change == 'no_tool': e = e[2:]
            elif change == 'bad_command': e[0]['args']['command'] = 'echo fake'
            elif change == 'bad_id': e[1]['toolCallId'] = 'other'
            elif change == 'tool_error': e[1]['isError'] = True
            elif change == 'wrong_model': e[2]['message']['model'] = 'glm-5.3-vision'
            elif change == 'provider_error': e[2]['message']['stopReason'] = 'error'
            else: e.pop()
            with self.subTest(change=change):
                self.assertFalse(pi.preflight_verified(log(e), MODEL))
        e = events()
        e.insert(0, {'type': 'message_end', 'message': {'role': 'assistant', 'stopReason': 'error'}})
        self.assertFalse(pi.execution_verified(log(e), MODEL))

    def test_runner_routes_deepseek_to_pi_and_detects_zero_exit_error(self):
        for mirror in ('.agents', '.claude'):
            helper = ROOT / mirror / 'skills/df-sprint-multi-execute/scripts'
            for preflight, failure in [(True, False), (False, False), (True, True), (False, True), (True, 'malformed'), (True, 'timeout'), (False, 'add_dir')]:
                with self.subTest(mirror=mirror, preflight=preflight, failure=failure), tempfile.TemporaryDirectory() as tmp:
                    base = Path(tmp)
                    fake = base / 'pi'
                    proof = events()
                    if failure is True: proof[2]['message']['stopReason'] = 'error'
                    elif failure == 'malformed': proof = [None]
                    fake.write_text('#!' + sys.executable + '\nimport os,sys,json\nfrom pathlib import Path\n'
                                    "Path(os.environ['CAPTURE']).write_text(json.dumps({'args':sys.argv[1:],'prompt':sys.stdin.read(),'agent_dir':os.environ['PI_CODING_AGENT_DIR'],'pid':os.getpid()}))\n"
                                    + ('import time; time.sleep(60)\n' if failure == 'timeout' else 'print(' + repr(log(proof)) + ')\n'))
                    fake.chmod(0o755)
                    wrong_harness = base / 'codex'
                    wrong_harness.write_text('#!' + sys.executable + '\nraise SystemExit(99)\n')
                    wrong_harness.chmod(0o755)
                    prompt = base / 'prompt'
                    prompt.write_text('Complete the isolated implementation.')
                    # Only catalog/version preparation is mocked; execute the real runner,
                    # process lifecycle, CLI routing, environment, and event verification.
                    driver = ('import sys,runpy; from unittest.mock import patch; '
                              f'sys.path.insert(0,{str(helper)!r}); import pi_runtime; '
                              'a=patch.object(pi_runtime,"require_pi",return_value="0.85.1"); a.start(); '
                              'b=patch.object(pi_runtime,"configure",return_value={"compat":{"thinkingFormat":"deepseek_v41"}}); b.start(); '
                              f'import run_lane; run_lane.PREFLIGHT_TIMEOUT={1 if failure == "timeout" else 10}; sys.exit(run_lane.main())')
                    env = {**os.environ, 'PATH': str(base) + os.pathsep + os.environ['PATH'], 'CAPTURE': str(base / 'capture')}
                    result = subprocess.run([sys.executable, '-c', driver, 'lunaroute-deepseek', '--project-dir', str(base),
                                             '--runs-dir', str(base / 'runs'), *(['--preflight'] if preflight else ['--prompt-file', str(prompt)]),
                                             *(['--add-dir', str(base)] if failure == 'add_dir' else [])],
                                            env=env, capture_output=True, text=True, timeout=15)
                    self.assertEqual(result.returncode, 124 if failure == 'timeout' else 1 if failure else 0, result.stderr)
                    if failure == 'add_dir':
                        self.assertFalse((base / 'capture').exists())
                        continue
                    call = json.loads((base / 'capture').read_text())
                    self.assertEqual(call['args'][:4], ['--provider', 'lunaroute', '--model', MODEL])
                    self.assertEqual(call['args'][call['args'].index('--thinking') + 1], 'high')
                    self.assertIn('--no-session', call['args'])
                    self.assertIn('--no-extensions', call['args'])
                    self.assertNotIn('--api-key', call['args'])
                    self.assertFalse(Path(call['agent_dir']).parent.exists())
                    receipt, = (base / 'runs').glob('*/receipt.json')
                    data = json.loads(receipt.read_text())
                    self.assertEqual(data['harness'], 'pi')
                    if failure == 'timeout':
                        self.assertTrue(data['timed_out'])
                        self.assertNotEqual(data['process_exit_code'], 0)
                        with self.assertRaises(ProcessLookupError):
                            os.kill(call['pid'], 0)
                        continue
                    self.assertEqual(data['process_exit_code'], 0)
                    if failure == 'malformed':
                        self.assertEqual(data['exit_code'], 1)
                        self.assertIn('verification_error', data)
                        continue
                    self.assertEqual(data['execution_verified'], not failure)
                    if preflight: self.assertEqual(data['preflight_verified'], not failure)


if __name__ == '__main__':
    unittest.main()
