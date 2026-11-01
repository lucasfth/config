"""Explicit Gimle acceptance: real Hermes provider resolver/agent, inert tools only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import time

assert socket.gethostname() == 'gimle'
root = Path.home() / 'loki-data/gimle-qwen'
sandbox = root / 'acceptance-hermes'
sandbox.mkdir(mode=0o700, exist_ok=True)
facts = json.loads((Path.home() / '.hermes/installs/0cbb8880d4fa970c/facts.json').read_text())
site = next((Path(facts['packages']['venv']['environment']) / 'lib').glob('python*/site-packages'))
sys.path[:0] = [str(Path.home() / 'loki-data/live/hermes-source'), str(site)]
import yaml
live = yaml.safe_load((Path.home() / '.hermes/config.yaml').read_text())
entry = next(p for p in live['custom_providers'] if p['name'] == 'gimle-qwen')
assert entry['base_url'] == 'http://127.0.0.1:18789/v1'
assert live['model']['provider'] == 'mimer-qwen'
(sandbox / 'config.yaml').write_text(yaml.safe_dump({'model': {'provider': 'gimle-qwen', 'default': 'qwen3.5-9b-6bit', 'context_length': 139264}, 'custom_providers': [entry], 'compression': {'enabled': False}, 'memory': {'memory_enabled': False, 'user_profile_enabled': False}, 'checkpoints': {'enabled': False}}))
shutil.copyfile(Path.home() / '.hermes/SOUL.md', sandbox / 'SOUL.md')
os.environ['HERMES_HOME'] = str(sandbox)
os.environ['TERMINAL_CWD'] = str(sandbox)
import hermes_cli.env_loader as env_loader
env_loader.load_hermes_dotenv = lambda *a, **k: []

def audit(event, args):
    if event == 'socket.connect' and isinstance(args[1], tuple) and args[1][0] not in ('127.0.0.1', '::1', 'localhost'):
        raise PermissionError('Only loopback inference permitted')
sys.addaudithook(audit)
from hermes_cli.runtime_provider import resolve_runtime_provider
runtime = resolve_runtime_provider(requested='gimle-qwen', target_model='qwen3.5-9b-6bit')
assert runtime['base_url'] == entry['base_url'] and runtime['api_key'] == entry['api_key']
from agent.prompt_builder import load_soul_md
loaded = load_soul_md(home_override=sandbox)
assert 'Explicit requests for Danish output are allowed' in loaded
assert 'Request denied. This violates immutable integrity rules.' not in loaded
from tools.registry import registry
schema = {'name': 'gimle_receipt', 'description': 'Read synthetic receipt fixture. No side effects.', 'parameters': {'type': 'object', 'properties': {'id': {'type': 'string'}}, 'required': ['id'], 'additionalProperties': False}}
calls = []
def handler(args, **kw):
    calls.append(args)
    return json.dumps({'total': 'DKK 731.50', 'status': 'paid'})
registry.register(name='gimle_receipt', toolset='benchmark', schema=schema, handler=handler, check_fn=lambda: True)
import model_tools
model_tools.get_tool_definitions = lambda *a, **k: [{'type': 'function', 'function': schema}]
from run_agent import AIAgent
streamed = []
agent = AIAgent(provider=runtime['provider'], base_url=runtime['base_url'], api_key=runtime['api_key'], api_mode='chat_completions', model='qwen3.5-9b-6bit', enabled_toolsets=[], max_iterations=3, max_tokens=512, quiet_mode=True, skip_context_files=True, skip_memory=True, skip_background_review=True, load_soul_identity=True, cwd=str(sandbox), checkpoints_enabled=False, request_overrides={'temperature': 0}, stream_delta_callback=lambda *args, **kwargs: streamed.append(bool(args or kwargs)))
start = time.monotonic()
result = agent.run_conversation('Call gimle_receipt with id receipt-731, then report the total and payment status. Do not invent the result.')
final = result.get('final_response', '')
danish = agent.run_conversation('Svar på dansk med præcis denne tekst: Gimle virker. Ingen værktøjskald.')
danish_text = danish.get('final_response', '')
assert 'Gimle virker' in danish_text and 'Request denied' not in danish_text
receipt = {'pass': calls == [{'id': 'receipt-731'}] and '731.50' in final and 'paid' in final.lower(), 'tool_arguments': calls, 'final_response': final, 'danish_reply': danish_text, 'elapsed_seconds': time.monotonic() - start, 'api_calls': result.get('api_calls'), 'stream_callbacks': len(streamed), 'default_unchanged': True, 'fresh_soul_loader': True, 'soul_sha256': hashlib.sha256((sandbox / 'SOUL.md').read_bytes()).hexdigest(), 'scope': 'real Hermes agent/provider, fake tool, sandbox profile; no Telegram gateway roundtrip'}
(root / 'hermes-acceptance.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
if hasattr(agent, 'close'):
    agent.close()
assert receipt['pass']
