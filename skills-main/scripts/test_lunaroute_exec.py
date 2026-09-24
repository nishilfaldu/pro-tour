"""Offline integration checks for LunaRoute routing and failure receipts."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LunaRouteExecTest(unittest.TestCase):
    def test_modes_receipts_and_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            project = base / 'project'
            project.mkdir()
            prompt = base / 'prompt.txt'
            prompt.write_text('Private sprint prompt with $shell and `literal` text')
            fake = base / 'codex'
            fake.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
Path(os.environ['CAPTURE']).write_text(json.dumps({'args':sys.argv[1:], 'prompt':sys.stdin.read(), 'cwd':os.getcwd()}))
if os.environ.get('FAIL'):
    print('synthetic provider failure', file=sys.stderr)
    sys.exit(7)
if not os.environ.get('NO_TOOL'):
    print(json.dumps({'type':'item.completed','item':{'type':'command_execution','status':'completed','exit_code':0,'aggregated_output':'LUNAROUTE_TOOL_OK'}}))
print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':'LUNAROUTE_PREFLIGHT_OK'}}))
''')
            fake.chmod(0o755)
            for mirror in ('.agents', '.claude'):
                helper = ROOT / mirror / 'skills/df-sprint-multi-execute/scripts/run_lane.py'
                for mode, model, preflight, failure in (
                    ('lunaroute', 'glm-5.3-vision', True, ''),
                    ('astra', 'gpt-6-astra', False, ''),
                    ('lunaroute-glm', 'glm-5.3-vision', False, ''),
                    ('glm', 'glm-5.3-vision', True, 'FAIL'),
                    ('glm', 'glm-5.3-vision', True, 'NO_TOOL'),
                ):
                    with self.subTest(mirror=mirror, mode=mode, failure=failure):
                        runs = base / ('runs-' + mirror + mode + failure)
                        capture = base / 'capture.json'
                        env = {**os.environ, 'PATH': str(base) + os.pathsep + os.environ['PATH'], 'CAPTURE':str(capture)}
                        if failure:
                            env[failure] = '1'
                        result = subprocess.run([sys.executable, str(helper), mode, '--project-dir', str(project),
                                                 '--runs-dir', str(runs), '--add-dir', str(base / 'extra'), *(['--preflight'] if preflight else ['--prompt-file', str(prompt)])],
                                                env=env, text=True, capture_output=True)
                        expected = 7 if failure == 'FAIL' else 1 if failure else 0
                        self.assertEqual(result.returncode, expected, result.stderr)
                        receipt_file, = runs.glob('*/receipt.json')
                        receipt = json.loads(receipt_file.read_text())
                        self.assertEqual(receipt['exit_code'], expected)
                        self.assertEqual(receipt['requested_model'], model)
                        call = json.loads(capture.read_text())
                        provider_args = ['-c', 'model_provider="openai"'] if mode == 'astra' else ['--profile', 'lunaroute']
                        self.assertEqual(call['args'][:6], ['exec',*provider_args,'--model',model,'--json'])
                        self.assertIn('--ephemeral', call['args'])
                        self.assertEqual('--add-dir' in call['args'], not preflight)
                        self.assertEqual(receipt['requested_provider'], 'openai' if mode == 'astra' else 'lunaroute')
                        self.assertEqual(call['args'][call['args'].index('--sandbox')+1], 'read-only' if preflight else 'workspace-write')
                        if not preflight:
                            self.assertEqual(call['prompt'], prompt.read_text())
                            self.assertEqual(Path(call['cwd']), project.resolve())
                            self.assertNotIn(prompt.read_text(), receipt_file.read_text())
                        else:
                            self.assertNotEqual(Path(call['cwd']), project.resolve())
                        self.assertEqual(receipt_file.stat().st_mode & 0o777, 0o600)
                        self.assertEqual(receipt_file.parent.stat().st_mode & 0o777, 0o700)
                        self.assertTrue((receipt_file.parent / 'stderr.log').exists())
                        if failure:
                            self.assertFalse(receipt['preflight_verified'])
                        if failure == 'NO_TOOL':
                            self.assertFalse(receipt['preflight_verified'])
                            self.assertEqual(receipt['process_exit_code'], 0)

    def test_cancellation_records_failure_and_stops_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            pid_file = base / 'pid'
            fake = base / 'codex'
            fake.write_text("#!/usr/bin/env python3\nimport os, time\nfrom pathlib import Path\nPath(os.environ['PID_FILE']).write_text(str(os.getpid()))\ntime.sleep(60)\n")
            fake.chmod(0o755)
            helper = ROOT / '.agents/skills/df-sprint-multi-execute/scripts/run_lane.py'
            env = {**os.environ, 'PATH':str(base) + os.pathsep + os.environ['PATH'], 'PID_FILE':str(pid_file)}
            proc = subprocess.Popen([sys.executable, str(helper), 'glm', '--project-dir', str(base),
                                     '--runs-dir', str(base / 'runs'), '--preflight'], env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                deadline = time.monotonic() + 10
                while not pid_file.exists() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(pid_file.exists())
                proc.terminate()
                proc.communicate(timeout=15)
                self.assertEqual(proc.returncode, 143)
                receipt, = (base / 'runs').glob('*/receipt.json')
                self.assertEqual(json.loads(receipt.read_text())['exit_code'], 143)
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(pid_file.read_text()), 0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.communicate()


if __name__ == '__main__':
    unittest.main()
