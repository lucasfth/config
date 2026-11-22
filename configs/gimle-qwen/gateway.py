"""Keep the public socket alive while replacing the supervised MLX worker."""
import hmac
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

import llama_swap as lx
import service

WORKER_PORT = 18790
MODELS = ('qwen3.5-9b-4bit', 'qwen3.5-9b-8bit')
WORKER_ERRORS = (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired, http.client.HTTPException)


class Worker:
    def __init__(self, root, key):
        self.root = root
        self.key = key
        self.process = None

    def start(self, model_id):
        if self.process is not None and self.process.poll() is None:
            raise RuntimeError('Previous supervisor is still running')
        self.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('supervise.py'))],
                                        env={**os.environ, 'GIMLE_QWEN_WORKER': '1',
                                             'GIMLE_QWEN_GATEWAY_PID': str(os.getpid()),
                                             'GIMLE_QWEN_ROOT': str(self.root)})
        try:
            deadline = time.monotonic() + lx.HEALTH_TIMEOUT_S
            while self.process.poll() is None and time.monotonic() < deadline:
                try:
                    with self.connection('GET', '/health', timeout=2) as response:
                        if response.status == 200 and response.getheader('X-Gimle-Model') == model_id:
                            return
                except (OSError, http.client.HTTPException):
                    pass
                time.sleep(0.5)
            raise RuntimeError('Guarded model worker did not become healthy')
        except BaseException:
            self.stop()
            raise

    def stop(self):
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            # Do not kill the supervisor: it owns cleanup of the MLX process group.
            self.process.wait(timeout=20)
        self.process = None

    def connection(self, method, path, body=None, timeout=1200):
        from contextlib import contextmanager

        @contextmanager
        def request():
            conn = http.client.HTTPConnection('127.0.0.1', WORKER_PORT, timeout=timeout)
            try:
                conn.request(method, path, body, {'Authorization': 'Bearer ' + self.key,
                                                  'Content-Type': 'application/json'})
                with conn.getresponse() as response:
                    yield response
            finally:
                conn.close()
        return request()


class Models:
    def __init__(self, root, worker):
        self.root = root
        self.worker = worker
        self.reg_path = root / 'swap-registry.json'
        self.slot = threading.Lock()
        self.active = json.loads(self.reg_path.read_text())['active']
        self.unavailable = None

    def entries(self, reg):
        entries = {}
        for name, raw in reg['models'].items():
            try:
                item = lx.validate_entry(name, raw)
            except ValueError:
                continue
            path = self.root / 'models' / name
            if item['model_id'] in MODELS and lx.complete(path) and lx.weights_ok(path, item):
                entries[item['model_id']] = (name, item)
        return entries

    def switch(self, reg, name, entry):
        if name == self.active:
            return
        old = self.active
        previous = lx.validate_entry(old, reg['models'][old])
        try:
            self.worker.stop()  # No overlapping MLX workers, even during rollback.
        except WORKER_ERRORS:
            self.active = None
            self.unavailable = 'Model worker did not stop; operator recovery required'
            lx.journal(self.root, {'event': 'swap-stop-failed', 'from': old, 'to': name})
            raise RuntimeError(self.unavailable) from None
        try:
            lx.point(self.root, name, entry)
            self.worker.start(entry['model_id'])
            # Health verifies the worker identity; smoke verifies generation before commit.
            smoke = json.dumps({'model': entry['model_id'], 'max_tokens': 8,
                                'messages': [{'role': 'user', 'content': 'Reply with one word: ready'}]})
            with self.worker.connection('POST', '/v1/chat/completions', smoke, lx.SMOKE_TIMEOUT_S) as res:
                if res.status != 200 or not json.load(res)['choices'][0]['message'].get('content'):
                    raise RuntimeError('Model smoke failed')
            lx.save_atomic(self.reg_path, {**reg, 'active': name, 'previous': old})
        except (*WORKER_ERRORS, KeyError, IndexError, TypeError):
            try:
                self.worker.stop()
                lx.point(self.root, old, previous)
                self.worker.start(previous['model_id'])
            except WORKER_ERRORS:
                self.active = None
                self.unavailable = 'Model rollback failed; operator recovery required'
                lx.journal(self.root, {'event': 'rollback-failed', 'from': old, 'to': name})
                raise RuntimeError(self.unavailable) from None
            lx.journal(self.root, {'event': 'swap-failed', 'from': old, 'to': name, 'rolled_back': old})
            raise RuntimeError('Requested model failed to load; previous model restored') from None
        self.active = name
        lx.journal(self.root, {'event': 'swap', 'from': old, 'to': name})


def handler_for(models, key):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def authorized(self):
            return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + key)

        def reply(self, status, data):
            payload = json.dumps(data).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Connection', 'close')
            self.close_connection = True
            self.end_headers()
            self.wfile.write(payload)
            self.wfile.flush()

        def forward(self, method, body=None):
            try:
                with models.worker.connection(method, self.path, body) as upstream:
                    self.send_response(upstream.status)
                    for name in ('Content-Type', 'Cache-Control', 'Content-Length'):
                        if value := upstream.getheader(name):
                            self.send_header(name, value)
                    self.end_headers()
                    while chunk := upstream.read1(65536):
                        self.wfile.write(chunk)
            except (OSError, http.client.HTTPException):
                # If streaming already began, close rather than append another HTTP response.
                if not getattr(self, '_forward_started', False):
                    self.reply(503, {'error': 'Model worker unavailable'})

        def end_headers(self):
            self._forward_started = True
            super().end_headers()

        def do_GET(self):
            if not self.authorized():
                return self.reply(401, {'error': 'Unauthorized'})
            if self.path == '/health':
                if models.unavailable:
                    return self.reply(503, {'error': models.unavailable})
                return self.forward('GET')
            if self.path != '/v1/models':
                return self.reply(404, {'error': 'Not found'})
            reg = json.loads(models.reg_path.read_text())
            return self.reply(200, {'object': 'list', 'data': [
                {'id': mid, 'object': 'model', 'owned_by': 'gimle', 'active': name == models.active}
                for mid, (name, _) in models.entries(reg).items()]})

        def do_POST(self):
            if not self.authorized():
                return self.reply(401, {'error': 'Unauthorized'})
            if self.path != '/v1/chat/completions':
                return self.reply(404, {'error': 'Not found'})
            # Consume a bounded body before returning busy/unavailable, so close
            # does not reset the connection with unread request bytes.
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= service.MAX_BODY or self.headers.get('Transfer-Encoding'):
                    raise ValueError('Invalid request size')
                self.connection.settimeout(10)
                body = json.loads(self.rfile.read(size))
            except (OSError, ValueError, TypeError):
                return self.reply(400, {'error': 'Invalid chat request or limit'})
            self.connection.settimeout(1200)
            if not models.slot.acquire(blocking=False):
                return self.reply(429, {'error': 'Single-user model is busy; retry after the active request'})
            try:
                if models.unavailable:
                    return self.reply(503, {'error': models.unavailable})
                try:
                    reg = json.loads(models.reg_path.read_text())
                    entries = models.entries(reg)
                    want = body.get('model') if isinstance(body, dict) else None
                    if want == 'default_model':
                        want = lx.validate_entry(models.active, reg['models'][models.active])['model_id']
                    name, entry = entries[want]
                    service.validate_request(body, model_id=want, max_output=entry['max_output'])
                except (ValueError, TypeError, KeyError):
                    return self.reply(400, {'error': 'Invalid chat request or limit'})
                try:
                    models.switch(reg, name, entry)
                except WORKER_ERRORS:
                    return self.reply(503, {'error': models.unavailable or 'Requested model unavailable; check the swap journal'})
                return self.forward('POST', json.dumps(body))
            finally:
                models.slot.release()

    return Handler


def main():
    os.umask(0o077)
    root = lx.root_of().resolve()
    if not root.is_relative_to(lx.VOLUME):
        raise RuntimeError('Expected encrypted Gimle runtime')
    key = service.read_key(root / 'api-key')
    worker = Worker(root, key)
    models = Models(root, worker)
    reg = json.loads(models.reg_path.read_text())
    model_id = lx.validate_entry(models.active, reg['models'][models.active])['model_id']
    server = ThreadingHTTPServer(('127.0.0.1', lx.PORT), handler_for(models, key))

    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        worker.start(model_id)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        worker.stop()


if __name__ == '__main__':
    main()
