#!/usr/bin/env python3
"""Launch a fixed sprint lane with private receipts and no retries."""
import argparse
import datetime
import json
import os
import signal
from pathlib import Path
import subprocess
import tempfile
import uuid

import pi_runtime

PREFLIGHT_TIMEOUT = 120

MODELS = dict.fromkeys(('lunaroute', 'lunaroute-glm', 'glm', 'glm-5.3-vision'), 'glm-5.3-vision')
MODELS.update(dict.fromkeys(('lunaroute-deepseek', 'deepseek', 'deepseek-4.1-flash'), 'deepseek-4.1-flash'))
MODELS['astra'] = 'gpt-6-astra'
PREFLIGHT = ('Use the shell tool exactly once to run: printf LUNAROUTE_TOOL_OK. '
             'Do not inspect files or use other tools. Then reply exactly: LUNAROUTE_PREFLIGHT_OK')


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def verified_preflight(log):
    tool_ok = final_ok = False
    for line in log.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        item = event.get('item', {})
        if event.get('type') != 'item.completed':
            continue
        if item.get('type') == 'command_execution':
            tool_ok |= (item.get('exit_code') == 0 and item.get('status') == 'completed'
                        and item.get('aggregated_output', '').strip() == 'LUNAROUTE_TOOL_OK')
        if item.get('type') == 'agent_message':
            final_ok |= item.get('text', '').strip() == 'LUNAROUTE_PREFLIGHT_OK'
    return tool_ok and final_ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=MODELS)
    parser.add_argument('--project-dir', type=Path, required=True)
    parser.add_argument('--add-dir', type=Path, action='append', default=[])
    parser.add_argument('--runs-dir', type=Path, default=Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'lunaroute-runs')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--preflight', action='store_true')
    group.add_argument('--prompt-file', type=Path)
    args = parser.parse_args()
    project = args.project_dir.expanduser().resolve()
    if not project.is_dir():
        parser.error('--project-dir must be an existing directory')
    try:
        prompt = PREFLIGHT if args.preflight else args.prompt_file.read_text()
    except OSError as exc:
        parser.error(str(exc))
    if not prompt.strip():
        parser.error('prompt must not be empty')
    os.umask(0o077)
    root = args.runs_dir.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    run = root / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8])
    run.mkdir(mode=0o700)
    receipt = dict(requested_model=MODELS[args.mode], requested_provider='openai' if args.mode == 'astra' else 'lunaroute',
                   profile='lunaroute' if MODELS[args.mode] == 'glm-5.3-vision' else None, harness='pi' if MODELS[args.mode] == 'deepseek-4.1-flash' else 'codex', project=str(project), preflight=args.preflight, started_at=now())
    if args.preflight:
        receipt['preflight_verified'] = False
    receipt_path = run / 'receipt.json'
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    print('LunaRoute receipt: ' + str(receipt_path), flush=True)
    code = 1
    interrupted_signal = signal.SIGINT

    def interrupt(signum, frame):
        nonlocal interrupted_signal
        interrupted_signal = signum
        raise KeyboardInterrupt

    previous_term = signal.signal(signal.SIGTERM, interrupt)
    process_code = None
    try:
        with tempfile.TemporaryDirectory(prefix='lunaroute-preflight-') as scratch:
            child_env = os.environ.copy()
            if MODELS[args.mode] != 'deepseek-4.1-flash':
                provider_args = ['-c', 'model_provider="openai"'] if args.mode == 'astra' else ['--profile', 'lunaroute']
                command = ['codex', 'exec', *provider_args, '--model', MODELS[args.mode],
                           '--json', '--ephemeral', '--cd', scratch if args.preflight else str(project),
                           '--sandbox', 'read-only' if args.preflight else 'workspace-write']
                if args.preflight:
                    command += ['--skip-git-repo-check']
                else:
                    for directory in args.add_dir:
                        command += ['--add-dir', str(directory.expanduser().resolve())]
                command += ['-']
            else:
                if args.add_dir and not args.preflight:
                    raise ValueError('Pi does not enforce --add-dir sandbox grants; use isolated worktrees and explicit prompt boundaries')
                receipt['harness_version'] = pi_runtime.require_pi()
                agent_dir = Path(scratch) / 'pi-agent'
                entry = pi_runtime.configure(agent_dir, MODELS[args.mode])
                receipt['wire_api'] = 'openai-completions'
                receipt['catalog_thinking_format'] = entry['compat']['thinkingFormat']
                receipt['reasoning_effort'] = 'high'
                child_env.update(PI_CODING_AGENT_DIR=str(agent_dir), PI_TELEMETRY='0')
                command = ['pi', '--provider', 'lunaroute', '--model', MODELS[args.mode],
                           '--thinking', 'high', '--mode', 'json', '--print', '--no-session',
                           '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes',
                           '--no-approve', '--no-context-files', '--tools', 'bash' if args.preflight else 'read,bash,edit,write,grep,find,ls']
            with (run / 'stdout.log').open('w') as out, (run / 'stderr.log').open('w') as err:
                child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=out, stderr=err,
                                         text=True, env=child_env, cwd=scratch if args.preflight else project, start_new_session=True)
                try:
                    child.communicate(prompt, timeout=PREFLIGHT_TIMEOUT if args.preflight and MODELS[args.mode] == 'deepseek-4.1-flash' else None)
                    process_code = child.returncode
                    code = process_code if process_code >= 0 else 128 - process_code
                except (KeyboardInterrupt, subprocess.TimeoutExpired) as exc:
                    try:
                        os.killpg(child.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        pass
                    finally:
                        try:
                            os.killpg(child.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        child.wait()
                    process_code = child.returncode
                    code = 124 if isinstance(exc, subprocess.TimeoutExpired) else 128 + interrupted_signal
                    if code == 124:
                        receipt['timed_out'] = True
            if code == 0:
                # Fail closed even if event parsing raises after a successful process exit.
                code = 1
                try:
                    log = (run / 'stdout.log').read_text()
                    valid = True
                    if MODELS[args.mode] == 'deepseek-4.1-flash':
                        valid = pi_runtime.execution_verified(log, MODELS[args.mode])
                        receipt['execution_verified'] = valid
                    if args.preflight:
                        proof = (verified_preflight(log) if MODELS[args.mode] != 'deepseek-4.1-flash'
                                 else pi_runtime.preflight_verified(log, MODELS[args.mode]))
                        receipt['preflight_verified'] = valid and proof
                        valid = valid and proof
                    if valid:
                        code = 0
                except Exception as exc:
                    receipt['verification_error'] = type(exc).__name__
    except KeyboardInterrupt:
        code = 128 + interrupted_signal
        receipt['launch_error'] = 'Interrupted during setup'
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        receipt['launch_error'] = str(exc)
    finally:
        signal.signal(signal.SIGTERM, previous_term)
        receipt.update(process_exit_code=process_code, exit_code=code, finished_at=now())
        receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    print('LunaRoute exit code: ' + str(code), flush=True)
    return code


if __name__ == '__main__':
    raise SystemExit(main())
