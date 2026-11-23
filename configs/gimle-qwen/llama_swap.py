#!/usr/bin/env python3
"""llama-swap - model swapper for the private dk.gimle.qwen service.

Registry, state and weights live on the encrypted runtime volume under
GIMLE_QWEN_ROOT. Live switches go through the authenticated gateway, which
owns the single worker slot, readiness and rollback.

Commands:
  llama-swap init            one-time: registry around the existing 9B deploy
  llama-swap list            registered models
  llama-swap status          active model, link, configured budget, last worker exit
  llama-swap fetch <id>      download/check out weights only (service untouched)
  llama-swap add <id> <repo> <revision> <ctx> <mem-gb> <target-gb> <stop-gb> [weights-gb] [max-output]
                      register a model (validated; nothing is downloaded)
  llama-swap use <id>        swap the served model (auto rollback on failure)
  llama-swap rollback        swap back to the previous model
Global flag: --dry-run (print the plan, change nothing)
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SERVICE = 'dk.gimle.qwen'
UID = 501
VOLUME = '/Users/gimle/loki-data'
DEFAULT_ROOT = '/Users/gimle/loki-data/gimle-qwen'
PORT = 18789
GUARD_MAX = 37_000_000_000  # 2026-11-19: raised 33->37G measurement envelope (Lucas, option 1) - envelope for 131K peak measurement; the D guard value itself stays a registry file (<=37)
HEALTH_TIMEOUT_S = 300
SMOKE_TIMEOUT_S = 180

BUILTIN_ID = 'qwen3.5-9b-4bit'
BUILTIN = {
    'model_id': BUILTIN_ID,
    'repo': 'mlx-community/Qwen3.5-9B-4bit',
    'revision': '8b2b98c00a6b4d291155e4890773ca8f769aee53',
    'context': 139264,
    'max_output': 4096,
    'memory_limit': 14_000_000_000,
    'prompt_cache_bytes': 2_500_000_000,
    'guard_target': 14_000_000_000,
    'guard_stop': 16_000_000_000,
}
INKLING_ID = 'inkling-2-mini'
INKLING_FILE = 'Inkling-2-Mini-UD-Q4_K_M.gguf'
INKLING_SOURCE_FILE = 'Mainline_Support/' + INKLING_FILE + '_file'
INKLING_SHA256 = '78fcedcf93c5d1bfe83e225513b71392bb52259be0eaa5f8899c856a2e5834ae'
INKLING = {
    **BUILTIN,
    'model_id': INKLING_ID,
    'repo': 'unsloth/Inkling-2-Mini-GGUF',
    'revision': '45fd08764f2b0bf16b03a5483a80e5c7aaec8772',
    'weights_bytes': 16_610_544_608,
    'context': 32768,
    'memory_limit': 24_000_000_000,
    'guard_target': 24_000_000_000,
    'guard_stop': 26_000_000_000,
}
WORKER_PORT = 18790

INT_FIELDS = (('context', 4096, 139264),
              ('max_output', 1, 8192),
              ('memory_limit', 4_000_000_000, GUARD_MAX),
              ('prompt_cache_bytes', 100_000_000, 8_000_000_000),
              ('guard_target', 1_000_000_000, GUARD_MAX),
              ('guard_stop', 15_000_000_000, GUARD_MAX))

# config.json and tokenizer.json are the boot requirements; chat_template.jinja is
# optional (present in some mlx-community checkpoints, absent in others).
CORE_FILES = ('config.json', 'tokenizer.json')


def die(msg, code=1):
    print('llama-swap: ' + msg, file=sys.stderr)
    sys.exit(code)


def root_of():
    root = Path(os.environ.get('GIMLE_QWEN_ROOT', DEFAULT_ROOT))
    if os.getuid() != UID or not Path(VOLUME).is_mount() or not root.is_relative_to(VOLUME):
        die('must run as gimle on the encrypted runtime volume')
    return root


def private_json(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        die('%s must be an owned 0600 regular file' % path.name)
    try:
        return json.loads(path.read_text())
    except ValueError:
        die('%s is not valid JSON' % path.name)


def save_atomic(path, obj):
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(path.parent, 0o700)
    tmp = path.with_name('.%s.%d.tmp' % (path.name, os.getpid()))
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as fh:
            fh.write(json.dumps(obj, indent=1, sort_keys=True) + '\n')
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    os.chmod(path, 0o600)


def validate_entry(name, entry):
    """Raise ValueError on a malformed registry entry; pure, no I/O."""
    if not isinstance(entry, dict):
        raise ValueError('%s: entry must be an object' % name)
    entry = dict(entry)
    model_id = entry.get('model_id', name)
    if not isinstance(model_id, str) or not 3 <= len(model_id) <= 64 or model_id != model_id.lower():
        raise ValueError('%s: model_id must be lowercase, 3-64 chars' % name)
    entry['model_id'] = model_id
    repo = entry.get('repo')
    if not isinstance(repo, str) or len(repo) < 5 or '/' not in repo:
        raise ValueError('%s: repo must look like org/repo' % name)
    revision = entry.get('revision')
    if not isinstance(revision, str) or len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
        raise ValueError('%s: revision must be 40 lowercase hex chars' % name)
    for field, lo, hi in INT_FIELDS:
        value = entry.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or not lo <= value <= hi:
            raise ValueError('%s: %s must be an int in %d..%d' % (name, field, lo, hi))
    if entry['guard_target'] >= entry['guard_stop']:
        raise ValueError('%s: guard_target must be below guard_stop' % name)
    weights = entry.get('weights_bytes')
    if weights is not None and (not isinstance(weights, int) or isinstance(weights, bool) or weights < 1_000_000_000):
        raise ValueError('%s: weights_bytes must be an int >= 1000000000' % name)
    if INKLING_ID in (name, model_id) and (name != INKLING_ID or entry != INKLING):
        raise ValueError('Inkling requires the qualified artifact and serving profile')
    return entry


def state_for(entry):
    keys = ('model_id', 'revision', 'context', 'max_output',
            'memory_limit', 'prompt_cache_bytes', 'guard_stop', 'guard_target')
    return {k: entry[k] for k in keys}


def complete(weights_dir):
    if not weights_dir.is_dir():
        return False
    if not all((weights_dir / f).is_file() for f in CORE_FILES):
        return False
    tensors = list(weights_dir.glob('*.safetensors'))
    return bool(tensors) and all(t.stat().st_size > 0 for t in tensors)


def weights_ok(weights_dir, entry):
    expected = entry.get('weights_bytes')
    if expected is None:
        return True
    total = sum(t.stat().st_size for t in weights_dir.glob('*.safetensors'))
    return total >= expected


def model_ready(path, entry):
    if entry['model_id'] == INKLING_ID:
        file = path / INKLING_FILE
        return (not path.is_symlink() and not file.is_symlink() and file.is_file()
                and file.stat().st_size == entry['weights_bytes'])
    return complete(path) and weights_ok(path, entry)


def ensure_models_dir(root):
    models = root / 'models'
    models.mkdir(mode=0o700, exist_ok=True)
    os.chmod(models, 0o700)
    return models


def checkout(name, entry, root):
    models = ensure_models_dir(root)
    dest = models / name
    if model_ready(dest, entry):
        print('llama-swap: %s already checked out' % name)
        return
    if entry['model_id'] == INKLING_ID:
        die('Provision %s (sha256 %s) as %s before serving' % (INKLING_SOURCE_FILE, INKLING_SHA256, dest / INKLING_FILE))
    venv_python = root / 'venv' / 'bin' / 'python'
    if not venv_python.is_file():
        die('missing venv python: %s' % venv_python)
    leftover = sorted(models.glob('.partial-%s-*' % name))
    if leftover:
        tmp = leftover[-1]
        print('llama-swap: resuming prior partial models/%s' % tmp.name)
    else:
        tmp = models / ('.%s.%d' % (name, os.getpid()))
    code = ('from huggingface_hub import snapshot_download\n'
            'p = snapshot_download(repo_id=%r, revision=%r, local_dir=%r)\n'
            'print(p)\n' % (entry['repo'], entry['revision'], str(tmp)))
    env = dict(os.environ)
    env.pop('HF_HUB_OFFLINE', None)
    os.makedirs(tmp, mode=0o700)
    print('llama-swap: checking out %s@%s -> %s' % (entry['repo'], entry['revision'][:8], name))
    proc = subprocess.run([str(venv_python), '-c', code], env=env)
    if proc.returncode != 0 or not complete(tmp) or not weights_ok(tmp, entry):
        # Keep the partial and its location: never discard checkout evidence.
        missing = [f for f in CORE_FILES if not (tmp / f).is_file()]
        if not list(tmp.glob('*.safetensors')):
            missing.append('*.safetensors')
        partial = tmp
        try:
            partial = models / ('.partial-%s-%d' % (name, int(time.time())))
            os.replace(tmp, partial)
        except OSError:
            pass
        journal(root, {'event': 'checkout-failed', 'id': name, 'rc': proc.returncode,
                       'missing': missing or ['weights floor'], 'kept': partial.name})
        die('%s: HF checkout failed or incomplete (missing: %s); partial kept at models/%s'
            % (name, ', '.join(missing) or 'weights floor', partial.name))
    if dest.exists():
        stale = models / ('.stale-%d' % os.getpid())
        os.replace(dest, stale)
        shutil.rmtree(stale)
    os.replace(tmp, dest)
    print('llama-swap: weights ready under models/%s' % name)


def point(root, name, entry):
    if name is not None:
        entry = validate_entry(name, entry)
    models = ensure_models_dir(root)
    if entry['model_id'] == INKLING_ID:
        raise ValueError('Inkling cannot be linked as an MLX checkpoint')
    if not model_ready(models / name, entry):
        raise ValueError('%s: weights missing; run fetch first' % name)
    nxt = models / ('.link-%d' % os.getpid())
    if os.path.lexists(nxt):
        nxt.unlink()
    os.symlink(models / name, nxt)
    os.replace(nxt, root / 'model')
    save_atomic(root / 'swap-state.json', state_for(entry))


def wait_health(api_key, timeout=HEALTH_TIMEOUT_S):
    deadline = time.time() + timeout
    ok = 0
    while time.time() < deadline:
        try:
            req = urllib.request.Request('http://127.0.0.1:%d/health' % PORT,
                                         headers={'Authorization': 'Bearer ' + api_key})
            with urllib.request.urlopen(req, timeout=3) as r:
                ok = ok + 1 if r.status == 200 else 0
        except (urllib.error.URLError, OSError):
            ok = 0
        if ok >= 2:
            return True
        time.sleep(0.5)
    return False


def api_key_of(root):
    key = os.environ.get('GIMLE_QWEN_API_KEY', '').strip()
    if key:
        return key
    path = root / 'api-key'
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        die('no GIMLE_QWEN_API_KEY env and no proper api-key file')
    key = path.read_text().strip()
    if len(key) < 32:
        die('api-key too short')
    return key


def smoke(api_key, model_id, max_tokens=64):
    body = json.dumps({'model': model_id, 'max_tokens': max_tokens, 'temperature': 0,
                       'messages': [{'role': 'user',
                                     'content': 'What is the second prime number? Reply with only the digit.'}]}).encode()
    req = urllib.request.Request('http://127.0.0.1:%d/v1/chat/completions' % PORT, data=body,
                                 headers={'Authorization': 'Bearer ' + api_key,
                                          'Content-Type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=SMOKE_TIMEOUT_S) as r:
        data = json.load(r)
    elapsed = max(time.time() - t0, 0.001)
    choices = data.get('choices') or []
    content = (choices[0].get('message') or {}).get('content') if choices else ''
    served = data.get('model')
    if not content or (served != model_id and not (served == 'default_model' and model_id != INKLING_ID)):
        raise ValueError('missing completion or wrong serving model')
    tokens = (data.get('usage') or {}).get('completion_tokens') or 1
    return tokens / elapsed


def journal(root, event):
    path = root / 'llama-swap.log'
    is_new = not path.exists()
    with open(path, 'a') as fh:
        fh.write(json.dumps({'time': time.time(), **event}, sort_keys=True) + '\n')
    if is_new:
        os.chmod(path, 0o600)


def cmd_init(root, dry):
    reg = root / 'swap-registry.json'
    if reg.is_file():
        die('registry exists; use list/use/status')
    model = root / 'model'
    builtin_dir = root / 'models' / BUILTIN_ID
    if model.is_symlink():
        try:
            same = model.resolve() == builtin_dir.resolve()
        except OSError:
            same = False
        if not same or not complete(builtin_dir):
            die('model/ symlink is inconsistent; recover manually')
        if dry:
            print('llama-swap: model/ already links models/%s; would create registry' % BUILTIN_ID)
            return 0
    elif model.is_dir():
        if builtin_dir.exists():
            die('both model/ dir and models/%s exist; recover manually' % BUILTIN_ID)
        if dry:
            print('llama-swap: would move model/ to models/%s and recreate the link' % BUILTIN_ID)
            return 0
        ensure_models_dir(root)
        os.rename(model, builtin_dir)
        point(root, BUILTIN_ID, BUILTIN)
    else:
        die('model/ is missing; recover manually')
    save_atomic(reg, {'active': BUILTIN_ID, 'previous': None, 'models': {BUILTIN_ID: dict(BUILTIN)}})
    journal(root, {'event': 'init'})
    print('llama-swap: registry created around the existing %s deployment' % BUILTIN_ID)
    return 0


def cmd_list(reg):
    for name in sorted(reg.get('models', {})):
        e = reg['models'][name]
        mark = '*' if reg.get('active') == name else ' '
        print('%s %-28s %s@%s  ctx=%d  guard_stop=%.0fG'
              % (mark, name, e.get('repo', '?'), str(e.get('revision'))[:8],
                 e.get('context', 0), e.get('guard_stop', 0) / 1e9))
    return 0


def cmd_status(reg, root):
    active = reg.get('active')
    models = reg.get('models', {})
    entry = models.get(active, {})
    link = root / 'model'
    target = link.readlink() if link.is_symlink() else ('dir' if link.is_dir() else 'missing')
    print('active:   %s' % active)
    print('previous: %s' % reg.get('previous'))
    print('link:     %s' % target)
    if entry:
        print('budget:   memory_limit=%.0fG rev-target %.0fG stop %.0fG'
              % (entry.get('memory_limit', 0) / 1e9, entry.get('guard_target', 0) / 1e9,
                 entry.get('guard_stop', 0) / 1e9))
    last = root / 'last-exit.json'
    if last.is_file():
        try:
            data = json.loads(last.read_text())
            print('last-exit: reason=%s peak=%.2fG stop_threshold_bytes=%s'
                  % (data.get('reason'), data.get('sampled_peak_bytes', 0) / 1e9,
                     data.get('stop_threshold_bytes')))
        except ValueError:
            print('last-exit: unreadable')
    return 0




class SwapError(RuntimeError):
    """A switch failed; the service state may have been rolled back internally."""

def perform_switch(root, name, do_restart=True):
    """Switch the held model to `name` using validated registry state.

    Live callers delegate to the gateway; the standalone MLX in-process path
    below must relaunch its own worker and cannot select Inkling."""
    reg = private_json(root / 'swap-registry.json')
    models = reg.get('models', {})
    if name not in models:
        raise SwapError('unknown model %s; run llama-swap list' % name)
    entry = validate_entry(name, models[name])
    if do_restart:
        if not model_ready(root / 'models' / name, entry):
            raise SwapError('%s: weights are not provisioned; run fetch first' % name)
        # The gateway owns the worker slot and is the only writer of live swap state.
        try:
            return entry, smoke(api_key_of(root), entry['model_id'], max_tokens=256 if name == INKLING_ID else 64)
        except urllib.error.HTTPError as exc:
            exc.close()
            raise SwapError('gateway switch to %s failed: HTTP %d' % (name, exc.code)) from exc
        except (OSError, ValueError) as exc:
            raise SwapError('gateway switch to %s failed: %s' % (name, exc)) from exc
    if entry['model_id'] == INKLING_ID:
        raise SwapError('Inkling requires the gateway')
    cur = reg.get('active')
    if cur == name:
        return entry, None
    if cur not in models:
        raise SwapError('registry has no active model; run llama-swap init or fix the registry')
    prev_entry = validate_entry(cur, models[cur])
    def fail(msg):
        try:
            point(root, cur, prev_entry)
        except Exception:
            raise SwapError(msg + '; and rollback failed; manual recovery needed')
        journal(root, {'event': 'swap-failed', 'to': name, 'rolled_back': cur})
        raise SwapError(msg + '; rolled back to %s' % cur)
    try:
        checkout(name, entry, root)
        point(root, name, entry)
    except Exception as exc:
        fail('%s: switch interrupted' % name)
    reg['active'] = name
    reg['previous'] = cur
    save_atomic(root / 'swap-registry.json', reg)
    journal(root, {'event': 'swap', 'from': cur, 'to': name})
    return entry, None

def cmd_use(root, reg, name, dry):
    models = reg.get('models', {})
    if name not in models:
        die('unknown model %s; run llama-swap list' % name)
    entry = validate_entry(name, models[name])
    cur = reg.get('active')
    if dry:
        print('llama-swap: would swap %s -> %s (ctx=%d memory_limit=%.0fG guard_stop=%.0fG)'
              % (cur, name, entry['context'], entry['memory_limit'] / 1e9, entry['guard_stop'] / 1e9))
        return 0
    try:
        entry, tps = perform_switch(root, name, do_restart=True)
    except SwapError as exc:
        die(str(exc), 2)
    print('llama-swap: active=%s smoke=%.1f tok/s' % (name, tps))
    return 0
def cmd_rollback(root, reg, dry):
    cur = reg.get('active')
    prev = reg.get('previous')
    models = reg.get('models', {})
    if not prev or prev not in models:
        die('no previous model to roll back to')
    if prev == cur:
        print('llama-swap: already on the previous model')
        return 0
    if dry:
        print('llama-swap: would roll back %s -> %s' % (cur, prev))
        return 0
    return cmd_use(root, reg, prev, dry=False)


def cmd_add(root, reg, spec, rest, dry):
    parts = rest[:8]
    if len(parts) < 6:
        die('add needs: <repo> <revision> <context> <mem-gb> <target-gb> <stop-gb> [weights-gb] [max-output]')

    def i32(index, label):
        try:
            return int(parts[index])
        except ValueError:
            die('%s must be an integer' % label)

    def gb(index, label):
        raw = parts[index]
        try:
            value = float(raw)
        except ValueError:
            die('%s must be a number of GB' % label)
        if not value.is_integer() or value <= 0:
            die('%s must be a positive whole number of GB' % label)
        return int(value * 1_000_000_000)

    entry = {
        'model_id': spec,
        'repo': parts[0],
        'revision': parts[1],
        'context': i32(2, 'context'),
        'max_output': i32(7, 'max-output') if len(parts) > 7 else BUILTIN['max_output'],
        'memory_limit': gb(3, 'mem-gb'),
        'prompt_cache_bytes': BUILTIN['prompt_cache_bytes'],
        'guard_target': gb(4, 'target-gb'),
        'guard_stop': gb(5, 'stop-gb'),
    }
    if len(parts) > 6:
        entry['weights_bytes'] = gb(6, 'weights-gb')
    try:
        entry = validate_entry(spec, entry)
    except ValueError as exc:
        die(str(exc))
    models = reg.get('models', {})
    if spec in models:
        die('model %s already registered' % spec)
    if dry:
        print('llama-swap: would register %s (guard_stop=%d)' % (spec, entry['guard_stop']))
        return 0
    models[spec] = entry
    reg['models'] = models
    if not reg.get('active'):
        reg['active'] = spec
        reg['previous'] = None
    save_atomic(root / 'swap-registry.json', reg)
    journal(root, {'event': 'add', 'id': spec})
    print('llama-swap: registered %s' % spec)
    return 0


def main(argv):
    dry = '--dry-run' in argv
    argv = [a for a in argv if a != '--dry-run']
    if not argv or argv[0] in ('-h', '--help', 'help'):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if len(rest) > 9:
        die('usage: llama-swap [--dry-run] {init|list|status|fetch <id>|add <id> <repo> <rev> <ctx> <mem-gb> <target-gb> <stop-gb> [weights-gb] [max-output]|use <id>|rollback}')
    root = root_of()
    reg = None
    reg_path = root / 'swap-registry.json'
    if reg_path.is_file():
        reg = private_json(reg_path)
        if not isinstance(reg, dict):
            die('swap-registry.json must be an object')
    if cmd == 'init':
        return cmd_init(root, dry)
    if reg is None:
        die('no registry; run llama-swap init first')
    if cmd == 'list':
        return cmd_list(reg)
    if cmd == 'status':
        return cmd_status(reg, root)
    if cmd == 'add':
        if len(rest) < 1:
            die('add needs a model id')
        return cmd_add(root, reg, rest[0], rest[1:], dry)
    if cmd == 'fetch':
        if not rest:
            die('fetch needs a model id')
        if rest[0] not in reg.get('models', {}):
            die('unknown model %s; run llama-swap list' % rest[0])
        entry = validate_entry(rest[0], reg['models'][rest[0]])
        if dry:
            print('llama-swap: would check out %s@%s' % (entry['repo'], entry['revision'][:8]))
        else:
            checkout(rest[0], entry, root)
        return 0
    if cmd == 'use':
        if not rest:
            die('use needs a model id')
        return cmd_use(root, reg, rest[0], dry)
    if cmd == 'rollback':
        return cmd_rollback(root, reg, dry)
    die('unknown command %s' % cmd)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))