"""Exercise the public HTTP contract without loading MLX."""
from contextlib import contextmanager
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

import gateway
import llama_swap as lx


class StubResponse:
    status = 200

    def __init__(self, model):
        self.payload = json.dumps({'model': model, 'choices': [{'message': {'content': 'ready'}}]}).encode()

    def getheader(self, name):
        return 'application/json' if name == 'Content-Type' else None

    def read(self):
        return self.payload

    def read1(self, _size):
        payload, self.payload = self.payload, b''
        return payload


class StubWorker:
    def __init__(self, model):
        self.active = model
        self.events = []
        self.fail = set()

    def stop(self):
        self.events.append(('stop', self.active))
        self.active = None

    def start(self, model):
        assert self.active is None, 'workers overlap'
        self.events.append(('start', model))
        if model in self.fail:
            raise RuntimeError('stub load failed')
        self.active = model

    @contextmanager
    def connection(self, method, path, body=None, timeout=None):
        assert method == 'POST' and path == '/v1/chat/completions'
        assert json.loads(body)['model'] == self.active
        yield StubResponse(self.active)


class GatewayTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.four, self.inkling = gateway.MODELS
        reg = {'active': self.four, 'models': {}}
        for name in (self.four, self.inkling, 'other-mlx'):
            entry = lx.INKLING if name == self.inkling else {k: v for k, v in lx.BUILTIN.items() if k != 'model_id'}
            reg['models'][name] = entry
            model = self.root / 'models' / name
            model.mkdir(parents=True)
            if name == self.inkling:
                with (model / lx.INKLING_FILE).open('wb') as file:
                    file.truncate(lx.INKLING['weights_bytes'])
                continue
            for filename in lx.CORE_FILES:
                (model / filename).write_text('{}')
            (model / 'weights.safetensors').write_bytes(b'x')
        lx.save_atomic(self.root / 'swap-registry.json', reg)
        lx.point(self.root, self.four, reg['models'][self.four])
        self.worker = StubWorker(self.four)
        self.models = gateway.Models(self.root, self.worker)
        self.server = gateway.ThreadingHTTPServer(('127.0.0.1', 0), gateway.handler_for(self.models, 'test-key'))
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, path, body=None):
        url = f'http://127.0.0.1:{self.server.server_port}{path}'
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                     headers={'Authorization': 'Bearer test-key'})
        try:
            response = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            return response.status, json.load(response)

    def chat(self, model, **extra):
        return self.request('/v1/chat/completions', {'model': model, 'max_tokens': 8,
                            'messages': [{'role': 'user', 'content': 'hi'}], **extra})

    def journal(self):
        return [json.loads(line) for line in (self.root / 'llama-swap.log').read_text().splitlines()]

    def test_one_request_each_way_and_only_two_advertised(self):
        for want in (self.inkling, self.four):
            status, data = self.chat(want)
            self.assertEqual(status, 200)
            self.assertEqual(data['model'], want)
            status, roster = self.request('/v1/models')
            self.assertEqual(status, 200)
            self.assertEqual({row['id'] for row in roster['data']}, {self.four, self.inkling})
            self.assertEqual([row['id'] for row in roster['data'] if row['active']], [want])
        self.assertEqual(self.worker.events, [('stop', self.four), ('start', self.inkling),
                                              ('stop', self.inkling), ('start', self.four)])
        self.assertEqual([(e['event'], e['from'], e['to']) for e in self.journal()],
                         [('swap', self.four, self.inkling), ('swap', self.inkling, self.four)])

    def test_failed_load_rolls_back_without_answering_wrong_model(self):
        self.worker.fail = {self.inkling}
        self.assertEqual(self.chat(self.inkling)[0], 503)
        self.assertEqual(self.worker.active, self.four)
        self.assertEqual(json.loads((self.root / 'swap-state.json').read_text())['model_id'], self.four)
        self.assertEqual(json.loads(self.models.reg_path.read_text())['active'], self.four)
        self.assertEqual(self.journal()[0]['rolled_back'], self.four)
        self.assertEqual(self.chat(self.four)[0], 200)

    def test_failed_rollback_leaves_gateway_unavailable_without_retrying(self):
        self.worker.fail = {self.four, self.inkling}
        status, data = self.chat(self.inkling)
        self.assertEqual(status, 503)
        self.assertIn('rollback failed', data['error'].lower())
        self.assertIsNone(self.worker.active)
        self.assertEqual([event['event'] for event in self.journal()], ['rollback-failed'])
        events = self.worker.events.copy()
        self.assertEqual(self.request('/health')[0], 503)
        self.assertEqual(self.chat(self.four)[0], 503)
        self.assertEqual(self.chat(self.inkling)[0], 503)
        self.assertEqual(self.worker.events, events)
        self.assertFalse(any(row['active'] for row in self.request('/v1/models')[1]['data']))

    def test_held_and_invalid_requests_do_not_replace_worker(self):
        self.assertEqual(self.chat(self.four)[0], 200)
        self.assertEqual(self.chat(self.inkling, max_tokens=5000)[0], 400)
        self.assertEqual(self.chat('other-mlx')[0], 400)
        self.assertEqual(self.worker.events, [])
        self.assertFalse((self.root / 'llama-swap.log').exists())

    def test_cli_switch_and_rollback_preserve_mlx_checkpoint_while_inkling_runs(self):
        from unittest.mock import patch

        state_path = self.root / 'swap-state.json'
        original = state_path.read_bytes(), (self.root / 'model').readlink()
        with (patch.object(lx, 'PORT', self.server.server_port),
              patch.object(lx, 'api_key_of', return_value='test-key')):
            self.assertEqual(lx.cmd_use(self.root, lx.private_json(self.models.reg_path), self.inkling, False), 0)
            self.assertEqual(lx.private_json(self.models.reg_path)['active'], self.inkling)
            self.assertEqual(self.worker.active, self.inkling)
            self.assertEqual([r['id'] for r in self.request('/v1/models')[1]['data'] if r['active']], [self.inkling])
            self.assertEqual((state_path.read_bytes(), (self.root / 'model').readlink()), original)
            self.assertEqual(lx.cmd_rollback(self.root, lx.private_json(self.models.reg_path), False), 0)
            self.assertEqual(lx.private_json(self.models.reg_path)['active'], self.four)
            self.assertEqual(self.worker.active, self.four)
            self.assertEqual([r['id'] for r in self.request('/v1/models')[1]['data'] if r['active']], [self.four])
            self.assertEqual((state_path.read_bytes(), (self.root / 'model').readlink()), original)
            self.worker.fail.add(self.inkling)
            registry = self.models.reg_path.read_bytes()
            with self.assertRaises(SystemExit) as failed:
                lx.cmd_use(self.root, lx.private_json(self.models.reg_path), self.inkling, False)
            self.assertEqual(failed.exception.code, 2)
            self.assertEqual(self.models.reg_path.read_bytes(), registry)
            self.assertEqual((state_path.read_bytes(), (self.root / 'model').readlink()), original)
            self.assertEqual(self.worker.active, self.four)

    def test_default_alias_restores_four_bit_after_selecting_heavy_model(self):
        self.assertEqual(self.chat(self.inkling)[0], 200)
        status, data = self.chat('default_model')
        self.assertEqual(status, 200)
        self.assertEqual(data['model'], self.four)

    def test_inkling_accepts_assistant_reasoning_in_tool_history(self):
        history = [{'role': 'user', 'content': 'Use test tool'},
                   {'role': 'assistant', 'content': None, 'reasoning_content': 'Synthetic prior reasoning',
                    'tool_calls': [{'id': 'call_1', 'type': 'function',
                                    'function': {'name': 'test_tool', 'arguments': '{}'}}]},
                   {'role': 'tool', 'tool_call_id': 'call_1', 'content': 'Ready'}]
        for field, value in [('reasoning_content', 7), ('reasoning_details', [])]:
            invalid = [history[0], {**history[1], field: value}, history[2]]
            self.assertEqual(self.chat(self.inkling, messages=invalid)[0], 400)
        self.assertEqual(self.worker.events, [])
        self.assertEqual(self.chat(self.inkling, messages=history)[0], 200)

    def test_heavy_model_rejects_native_output_override_before_switch(self):
        self.assertEqual(self.chat(self.inkling, n_predict=-1)[0], 400)
        self.assertEqual(self.worker.events, [])

    def test_stop_timeout_does_not_start_another_worker(self):
        from unittest.mock import patch
        with patch.object(self.worker, 'stop', side_effect=gateway.subprocess.TimeoutExpired('stop', 20)):
            status, data = self.chat(self.inkling)
            self.assertEqual(status, 503)
            self.assertIn('did not stop', data['error'])
            self.assertEqual(self.chat(self.inkling)[0], 503)
        self.assertEqual(self.worker.events, [])
        self.assertEqual(self.journal()[0]['event'], 'swap-stop-failed')


class WorkerTests(unittest.TestCase):
    def test_worker_launch_health_chat_and_stop(self):
        from unittest.mock import patch

        # The fixture receives the real Worker subprocess arguments and uses real HTTP.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake = root / 'supervise.py'
            fake.write_text('''
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, os, sys
from pathlib import Path
assert os.environ['GIMLE_QWEN_WORKER'] == '1'
assert int(os.environ['GIMLE_QWEN_GATEWAY_PID']) == os.getppid()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/v1/models':
            assert sys.argv[1:] == ['inkling-2-mini']
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"data":[{"id":"inkling-2-mini"}]}')
            return
        self.send_response(200 if self.path == '/health' else 404)
        self.send_header('X-Gimle-Model', 'qwen3.5-9b-4bit')
        self.end_headers()
    def do_POST(self):
        assert self.path == '/v1/chat/completions'
        assert self.headers['Authorization'] == 'Bearer fixture'
        self.rfile.read(int(self.headers['Content-Length']))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"fixture":true}')
    def log_message(self, *_): pass
server = HTTPServer(('127.0.0.1', 0), Handler)
Path(os.environ['GIMLE_QWEN_ROOT'], 'port').write_text(str(server.server_port))
server.serve_forever()
''')
            connect = gateway.http.client.HTTPConnection
            def connection(host, _port, **kwargs):
                port = root / 'port'
                if not port.exists():
                    raise ConnectionRefusedError
                return connect(host, int(port.read_text()), **kwargs)
            worker = gateway.Worker(root, 'fixture')
            with (patch.object(gateway, '__file__', str(root / 'gateway.py')),
                  patch.object(gateway.http.client, 'HTTPConnection', side_effect=connection),
                  patch.object(lx, 'HEALTH_TIMEOUT_S', 4)):
                try:
                    worker.start(gateway.MODELS[1])
                    process = worker.process
                    with worker.connection('POST', '/v1/chat/completions', '{}') as response:
                        self.assertEqual(json.load(response), {'fixture': True})
                finally:
                    worker.stop()
                self.assertIsNotNone(process.poll())
                (root / 'port').unlink()
                try:
                    with self.assertRaisesRegex(RuntimeError, 'did not become healthy'):
                        worker.start('wrong-model')
                    self.assertIsNone(worker.process)
                finally:
                    worker.stop()
