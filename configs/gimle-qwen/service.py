"""Private single-user MLX endpoint. Run only through the footprint supervisor."""
import hashlib
import hmac
import importlib.metadata
import io
import json
import os
from pathlib import Path
import stat
import sys
import time
import threading

import llama_swap as lx

MODEL_ID = 'qwen3.5-9b-6bit'
CONTEXT = 139264
MAX_OUTPUT = 4096
MAX_BODY = 8_000_000
MEMORY_LIMIT = 14_000_000_000
PROMPT_CACHE_BYTES = 2_500_000_000
REVISION = '76fe4065e622cf34990d3c13ef80ec8531c9a0f7'
def apply_swap_state(root):
    """Apply the llama-swap registry state; baked values are the fallback."""
    global MODEL_ID, CONTEXT, MAX_OUTPUT, MEMORY_LIMIT, PROMPT_CACHE_BYTES, REVISION
    path = Path(root) / 'swap-state.json'
    if not path.is_file():
        return
    state = json.loads(path.read_text())
    if not isinstance(state, dict):
        raise ValueError('swap-state.json must be an object')

    def value(name, default, kind, lo, hi):
        v = state.get(name, default)
        if not isinstance(v, kind) or isinstance(v, bool) or not lo <= v <= hi:
            raise ValueError(f'swap-state {name} out of range')
        state.pop(name, None)
        return v

    model_id = state.get('model_id', MODEL_ID)
    if not isinstance(model_id, str) or not 3 <= len(model_id) <= 64 or model_id != model_id.lower():
        raise ValueError('swap-state model_id invalid')
    state.pop('model_id', None)
    MODEL_ID = model_id
    CONTEXT = value('context', CONTEXT, int, 4096, 139264)
    MAX_OUTPUT = value('max_output', MAX_OUTPUT, int, 1, 8192)
    MEMORY_LIMIT = value('memory_limit', MEMORY_LIMIT, int, 4_000_000_000, 31_000_000_000)
    PROMPT_CACHE_BYTES = value('prompt_cache_bytes', PROMPT_CACHE_BYTES, int, 100_000_000, 8_000_000_000)
    if 'revision' in state:
        revision = state.pop('revision')
        if not isinstance(revision, str) or len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
            raise ValueError('swap-state revision invalid')
        REVISION = revision
    guard_stop = value('guard_stop', 17_000_000_000, int, 15_000_000_000, 37_000_000_000)
    guard_target = value('guard_target', 15_000_000_000, int, 1_000_000_000, 37_000_000_000)
    if guard_target >= guard_stop:
        raise ValueError('swap-state guard_target must be below guard_stop')
    if state:
        raise ValueError('swap-state has unknown fields')


def roster_entries(root):
    """Every registered model whose weights are complete on disk; the held one first, flagged."""
    try:
        reg = json.loads((root / 'swap-registry.json').read_text())
    except Exception:
        return [{'id': MODEL_ID, 'active': True}]
    seen = set()
    rows = []
    for name, entry in (reg.get('models') or {}).items():
        try:
            mid = entry.get('model_id', name)
        except AttributeError:
            continue
        if mx_complete(root / 'models' / name) and mid not in seen:
            seen.add(mid)
            rows.append({'id': mid, 'active': reg.get('active') == name})
    if MODEL_ID not in seen:
        rows.insert(0, {'id': MODEL_ID, 'active': True})
    return rows

def mx_complete(weights_dir):
    try:
        return lx.complete(weights_dir)
    except Exception:
        return False

def pending_switch(root, current_id, want_id, slot):
    """Handle a request for a registered model that is not the held one.
    Returns ('none', None), ('switched', entry), ('busy', None) or ('error', msg)."""
    try:
        reg = json.loads((root / 'swap-registry.json').read_text())
    except Exception:
        return ('none', None)
    name = None
    for cand, entry in (reg.get('models') or {}).items():
        try:
            if entry.get('model_id', cand) == want_id and mx_complete(root / 'models' / cand):
                name = cand
                break
        except AttributeError:
            continue
    if name is None or reg.get('active') == name:
        return ('none', None)
    if not slot.acquire(blocking=False):
        return ('busy', None)
    try:
        entry, _ = lx.perform_switch(root, name, do_restart=False)
    except Exception as exc:
        slot.release()
        return ('error', str(exc))
    slot.release()
    return ('switched', entry)

def read_key(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise PermissionError('API key must be an owned, private regular file')
    key = path.read_text().strip()
    if len(key) < 32:
        raise ValueError('API key too short')
    return key


def matches(metadata, identity, tokens):
    saved = metadata.get('tokens', [])
    return metadata.get('identity') == identity and bool(saved) and tokens[:len(saved)] == saved


def should_restore(metadata, identity, tokens, rest, has_cache):
    improvement = len(metadata.get('tokens', [])) - (len(tokens) - len(rest))
    return matches(metadata, identity, tokens) and improvement > (8192 if has_cache else 0)


def load_checkpoint(loader, path):
    try:
        return loader(str(path), return_metadata=True)
    except (OSError, ValueError, KeyError, IndexError, RuntimeError):
        print('gimle-qwen: discarded invalid checkpoint', file=sys.stderr, flush=True)
        return None


def validate_request(body):
    if not isinstance(body, dict) or body.get('model') not in (MODEL_ID, 'default_model'):
        raise ValueError('Unknown model')
    if any(field in body for field in ('adapters', 'draft_model', 'chat_template', 'chat_template_kwargs', 'max_completion_tokens')):
        raise ValueError('Model, draft and template overrides are disabled')
    limit = body.get('max_tokens', 1024)
    if type(limit) is not int or not 1 <= limit <= MAX_OUTPUT:
        raise ValueError(f'max_tokens must be 1..{MAX_OUTPUT}')
    if body.get('n', 1) != 1 or 'max_completion_tokens' in body:
        raise ValueError('Only one bounded completion is supported')
    messages = body.get('messages')
    if not isinstance(messages, list) or not messages or len(messages) > 2048:
        raise ValueError('Expected bounded chat messages')
    for message in messages:
        if not isinstance(message, dict) or message.get('role') not in ('system', 'user', 'assistant', 'tool'):
            raise ValueError('Invalid message')
        content = message.get('content')
        if content is not None and not isinstance(content, str):
            if not isinstance(content, list) or any(not isinstance(p, dict) or p.get('type') != 'text' or not isinstance(p.get('text'), str) for p in content):
                raise ValueError('Text-only endpoint')
    if not isinstance(body.get('tools', []), list) or len(body.get('tools', [])) > 256:
        raise ValueError('Too many tools')
    return {**body, 'model': 'default_model', 'max_tokens': limit}



# Boot contract file digests. chat_template.jinja is legitimately absent from
# some mlx-community checkpoints; config/tokenizer are always required at load.
def sha_file_or_none(path):
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    import mlx.core as mx
    from mlx_lm import server
    from mlx_lm.generate import generate_step
    from mlx_lm.models.cache import LRUPromptCache, load_prompt_cache, make_prompt_cache, save_prompt_cache

    os.umask(0o077)
    root = Path(os.environ['GIMLE_QWEN_ROOT']).resolve()
    volume = Path('/Users/gimle/loki-data')
    if not volume.is_mount() or not root.is_relative_to(volume) or os.getuid() != 501:
        raise RuntimeError('Expected encrypted Gimle runtime')
    key = read_key(root / 'api-key')
    model = root / 'model'
    apply_swap_state(root)
    mx.set_memory_limit(MEMORY_LIMIT)
    mx.set_cache_limit(256_000_000)
    os.environ['HF_HOME'] = str(root / 'hf-cache')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    checkpoint = root / 'checkpoint'
    checkpoint.mkdir(mode=0o700, exist_ok=True)
    contract = {'revision': REVISION, 'kv_bits': 8,
                'mlx': importlib.metadata.version('mlx'), 'mlx_lm': importlib.metadata.version('mlx-lm'),
                'config_sha': sha_file_or_none(model / 'config.json'),
                'tokenizer_sha': sha_file_or_none(model / 'tokenizer.json'),
                'template_sha': sha_file_or_none(model / 'chat_template.jinja')}
    identity = hashlib.sha256(json.dumps(contract, sort_keys=True).encode()).hexdigest()
    original_fetch = LRUPromptCache.fetch_nearest_cache
    original_tokenize = server.ResponseGenerator._tokenize
    active = {}

    def tokenize(generator, tokenizer, request, args):
        result = original_tokenize(generator, tokenizer, request, args)
        if len(result[0]) + args.max_tokens > CONTEXT:
            raise ValueError(f'Rendered input plus output exceeds {CONTEXT} tokens')
        active['generator'] = generator
        return result

    def fetch(cache_store, model_key, tokens):
        cache, rest = original_fetch(cache_store, model_key, tokens)
        # Cache already covers enough of the prefix: use the existing live continuation.
        if len(rest) <= 8192:
            return cache, rest
        metadata_path = checkpoint / 'current.json'
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text())
                if should_restore(metadata, identity, tokens, rest, cache is not None):
                    path = checkpoint / (metadata['generation'] + '.safetensors')
                    loaded = load_checkpoint(load_prompt_cache, path)
                    if loaded is not None:
                        restored, stored = loaded
                        digest = hashlib.sha256(json.dumps(metadata['tokens']).encode()).hexdigest()
                        if stored != {'identity': identity, 'token_hash': digest}:
                            raise ValueError('Checkpoint identity mismatch')
                        mx.eval([c.state for c in restored])
                        return restored, tokens[len(metadata['tokens']):]
            except (OSError, ValueError, KeyError):
                print('gimle-qwen: discarded invalid checkpoint', file=sys.stderr, flush=True)
        provider = active['generator'].model_provider
        prefix = tokens[:-64]
        if not prefix:
            return cache, rest
        # Single saved exact prefix; never trim hybrid recurrent state or rewrite history.
        if cache is None:
            cache = make_prompt_cache(provider.model)
            remaining = prefix
        else:
            remaining = tokens[len(tokens) - len(rest):-64]
        if remaining:
            for _ in generate_step(mx.array(remaining), provider.model, max_tokens=0,
                                   prompt_cache=cache, prefill_step_size=256, kv_bits=8,
                                   kv_group_size=64, quantized_kv_start=0):
                pass
        mx.eval([c.state for c in cache])
        generation = str(time.time_ns())
        digest = hashlib.sha256(json.dumps(prefix).encode()).hexdigest()
        temporary = checkpoint / (generation + '.tmp.safetensors')
        save_prompt_cache(str(temporary), cache, {'identity': identity, 'token_hash': digest})
        os.replace(temporary, checkpoint / (generation + '.safetensors'))
        metadata = {'identity': identity, 'generation': generation, 'tokens': prefix}
        tempmeta = checkpoint / 'current.tmp'
        tempmeta.write_text(json.dumps(metadata) + '\n')
        os.replace(tempmeta, metadata_path)
        for old in checkpoint.glob('*.safetensors'):
            if old.name != generation + '.safetensors':
                old.unlink()
        return cache, tokens[len(prefix):]

    server.ResponseGenerator._tokenize = tokenize
    LRUPromptCache.fetch_nearest_cache = fetch
    handler = server.APIHandler
    post = handler.do_POST
    get = handler.do_GET
    request_slot = threading.Lock()

    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + key)

    def do_get(self):
        if not authorized(self):
            return reply(self, 401, {'error': 'Unauthorized'})
        if self.path == '/v1/models':
            return reply(self, 200, {'object': 'list',
                          'data': [{'id': r['id'], 'object': 'model', 'owned_by': 'gimle', 'active': r['active']}
                                   for r in roster_entries(root)]})
        if self.path != '/health':
            return reply(self, 404, {'error': 'Not found'})
        return get(self)

    def do_post(self):
        if not authorized(self):
            return reply(self, 401, {'error': 'Unauthorized'})
        if self.path != '/v1/chat/completions':
            return reply(self, 404, {'error': 'Not found'})
        raw = None
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY or self.headers.get('Transfer-Encoding'):
                raise ValueError('Invalid request size')
            raw = json.loads(self.rfile.read(length))
        except (ValueError, TypeError):
            return reply(self, 400, {'error': 'Invalid chat request or limit'})
        want = raw.get('model') if isinstance(raw, dict) else None
        if isinstance(want, str) and want not in (MODEL_ID, 'default_model'):
            action, detail = pending_switch(root, MODEL_ID, want, request_slot)
            if action == 'switched':
                reply(self, 429, {'error': 'switching to %s; retry the same request' % want})
                os.execv(sys.executable, [sys.executable] + sys.argv)
                return
            if action == 'busy':
                return reply(self, 429, {'error': 'model switch is in flight; retry after the active request'})
            if action == 'error':
                return reply(self, 503, {'error': 'model switch to %s failed: %s' % (want, detail)})
        try:
            body = validate_request(raw)
        except (ValueError, TypeError):
            return reply(self, 400, {'error': 'Invalid chat request or limit'})
        if not request_slot.acquire(blocking=False):
            return reply(self, 429, {'error': 'Single-user model is busy; retry after the active request'})
        encoded = json.dumps(body).encode()
        previous = self.rfile
        self.rfile = io.BytesIO(encoded)
        self.headers.replace_header('Content-Length', str(len(encoded)))
        try:
            return post(self)
        finally:
            self.rfile = previous
            request_slot.release()

    handler.do_GET = do_get
    handler.do_POST = do_post
    handler.do_OPTIONS = lambda self: reply(self, 405, {'error': 'Not allowed'})
    handler.log_message = lambda *args: None
    sys.argv = [sys.argv[0], '--model', str(model), '--host', '127.0.0.1', '--port', '18789',
                '--kv-bits', '8', '--quantized-kv-start', '0', '--prefill-step-size', '256',
                '--prompt-cache-size', '1', '--prompt-cache-bytes', str(PROMPT_CACHE_BYTES),
                '--decode-concurrency', '1', '--prompt-concurrency', '1', '--max-tokens', '1024',
                '--chat-template-args', '{"enable_thinking":false}', '--log-level', 'ERROR']
    server.main()


if __name__ == '__main__':
    main()
