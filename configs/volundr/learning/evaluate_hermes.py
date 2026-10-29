#!/usr/bin/env python3
"""Approved tool-free native Hermes comparison, using isolated HERMES_HOME.

Invoke through the already managed native Python with -I. No package installation,
live config changes, model retries/fallback or publication. The skill is preloaded
in both variants; this does not evaluate autonomous discovery or the live gateway.
"""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
for name in ('source', 'live-home', 'suite', 'baseline', 'candidate', 'output'):
    parser.add_argument('--' + name, type=Path, required=True)
args = parser.parse_args()
# Managed bootstrap only activates its existing dependency closure.
sys.path.insert(0, str(args.source))
import hermes_bootstrap
import yaml
from dotenv import dotenv_values
config = yaml.safe_load((args.live_home / 'config.yaml').read_text())
model_config = config['model']
provider_id = model_config['provider']
provider_config = config['providers'][provider_id]
endpoint = provider_config['base_url'].rstrip('/')
model = model_config['default']
key_name = provider_config['api_key_env']
secrets = dotenv_values(args.live_home / '.env')
key = os.environ.get(key_name) or secrets.get(key_name)
if not key:
    raise ValueError('Configured provider credential unavailable')
# Do not copy live plugins, MCP, session state, memory or environment secrets.
scratch = Path(tempfile.mkdtemp(prefix='aar-hermes-eval-'))
os.environ['HERMES_HOME'] = str(scratch)
os.environ['HERMES_EVAL_MODE'] = '1'
os.environ['HERMES_TELEMETRY_ENABLED'] = 'false'
(scratch / 'config.yaml').write_text(yaml.safe_dump({'model': {'default': model,
    'provider': 'custom', 'context_length': model_config.get('context_length') or provider_config['context_length']}, 'memory': {'enabled': False},
    'plugins': {}, 'toolsets': [], 'compression': {'enabled': False}}))
# Load native engine only after profile isolation.
from run_agent import AIAgent
hash_bytes = lambda value: hashlib.sha256(value).hexdigest()
suite = json.loads(args.suite.read_text())
if len(suite['cases']) > 8 or suite['trials'] != 1:
    raise ValueError('At most 16 single-turn provider requests')
args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
if args.output.is_symlink() or args.output.stat().st_mode & 0o077:
    raise ValueError('Evaluation output directory must be private (0700)')

def private_artifact(name, content):
    path = args.output / name
    if path.is_symlink() or (path.exists() and (not path.is_file() or path.stat().st_nlink != 1)):
        raise ValueError('Unsafe existing evaluation artifact')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(content)

request_count = 0


class Gate(http.server.BaseHTTPRequestHandler):
    def log_message(self, *unused):
        pass

    def do_POST(self):
        global request_count
        if request_count > len(traces):
            # Native Hermes has outer retry loops beyond the SDK's retry setting.
            # Never forward a second attempt for the same case to the provider.
            self.send_error(400, 'Repeated case request blocked by evaluation gate')
            return
        request_count += 1
        if request_count > 16:
            self.send_error(400, 'Evaluation budget exhausted')
            return
        raw = self.rfile.read(int(self.headers['Content-Length']))
        payload = json.loads(raw)
        payload['max_tokens'] = 1200
        payload['max_completion_tokens'] = 1200
        headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key}
        target = endpoint + '/' + self.path.removeprefix('/v1/').lstrip('/')
        request = urllib.request.Request(target, json.dumps(payload).encode(), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                self.send_response(response.status)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.end_headers()
                # Preserve native streaming/SSE. Converting a streamed request into
                # JSON makes Hermes treat the result as an empty stream and retry.
                while chunk := response.read1(8192):
                    self.wfile.write(chunk)
                    self.wfile.flush()
                return
        except urllib.error.HTTPError as error:
            body, status = error.read(), error.code
        except Exception:
            body, status = b'{"error":{"message":"Evaluation transport failed"}}', 400
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Gate)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
traces = []
try:
    for variant in ('baseline', 'candidate'):
        skill = (args.baseline if variant == 'baseline' else args.candidate).read_text()
        for task in suite['cases']:
            agent = AIAgent(base_url=f'http://127.0.0.1:{server.server_port}/v1', api_key='fixture-gate',
                provider='custom', api_mode='chat_completions', model=model,
                enabled_toolsets=[], disabled_toolsets=[], max_iterations=1, max_tokens=1200,
                quiet_mode=True, save_trajectories=False, skip_context_files=True,
                load_soul_identity=False, skip_memory=True, skip_background_review=True,
                checkpoints_enabled=False, cwd=str(scratch), run_budget_seconds=140,
                reasoning_config={'enabled': True, 'effort': 'low'})
            try:
                agent._persist_disabled = True
                if agent.tools or agent.valid_tool_names:
                    raise ValueError('Native engine unexpectedly exposed tools')
                agent.client = agent.client.with_options(max_retries=0)
                started, before = time.monotonic(), request_count
                system = ('Preloaded procedure for this isolated evaluation (apply only if relevant):\n' + skill)
                contract = {key: suite.get('value_contract', {}).get(key, type(value).__name__)
                            for key, value in task['expected'].items()}
                result = agent.run_conversation(task['prompt'] + '\nReturn JSON only: {"claims":{...}}. '
                    'Required claim keys and value types: ' + json.dumps(contract) + '. '
                    'Fill values from the scenario; do not infer unstated success. No extra explanation.', system_message=system)
                if result.get('failed') or result.get('error') or result.get('completed') is False:
                    private_artifact('native-failure.json', json.dumps(result, indent=2, default=str))
                    raise ValueError('Native provider failed; stopping without retries or later cases')
                if request_count - before != 1:
                    raise ValueError('Expected exactly one provider request per case')
                text = result.get('final_response', '')
                if not text:
                    raise ValueError('Native engine returned no final answer')
                try:
                    clean = text.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()
                    claims = json.loads(clean).get('claims', {})
                except ValueError:
                    claims = {}
                artifact = f'loki-{variant}-{task["id"]}.json'
                content = json.dumps({'claims': claims, 'raw': text, 'result': result,
                    'preloaded_skill_sha256': hash_bytes(skill.encode()), 'active_tools': []}, indent=2, default=str) + '\n'
                private_artifact(artifact, content)
                usage = result.get('usage') or {}
                traces.append({'harness': 'loki', 'variant': variant, 'case': task['id'], 'trial': 1,
                    'model': model, 'provider': provider_id, 'harness_revision': hash_bytes((args.source/'run_agent.py').read_bytes()),
                    'skill_sha256': hash_bytes(skill.encode()), 'elapsed_seconds': time.monotonic()-started,
                    'input_tokens': usage.get('prompt_tokens', getattr(agent, 'session_prompt_tokens', 0)),
                    'output_tokens': usage.get('completion_tokens', getattr(agent, 'session_completion_tokens', 0)),
                    'artifact': artifact, 'artifact_sha256': hash_bytes(content.encode()), 'capture': 'native'})
                private_artifact('traces-loki.json', json.dumps(traces, indent=2)+'\n')
                print(json.dumps({'harness': 'loki', 'variant': variant, 'case': task['id'], 'requests': request_count}), flush=True)
            finally:
                agent.close()
finally:
    server.shutdown(); server.server_close()
    print(json.dumps({'totalRequests': request_count, 'scratchProfile': str(scratch),
        'preloadedSkillOnly': True, 'liveProfileModified': False}), flush=True)
