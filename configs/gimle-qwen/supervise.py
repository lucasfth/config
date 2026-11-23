"""Sample physical footprint at 50ms; this is NOT a hard memory ceiling."""
import ctypes
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import sys
import time

lib = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
lib.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
lib.proc_pid_rusage.restype = ctypes.c_int
import llama_swap as lx

DEFAULT_LIMIT = lx.BUILTIN['guard_stop']


def footprint(pid):
    data = ctypes.create_string_buffer(1024)
    if lib.proc_pid_rusage(pid, 2, data):
        raise ProcessLookupError(pid)
    return struct.unpack_from('Q', data, 72)[0]


def guard_limit(root):
    """Per-model supervisor stop from swap-state; falls back to the baked limit."""
    limit = DEFAULT_LIMIT
    state_path = root / 'swap-state.json'
    if state_path.is_file():
        try:
            data = json.loads(state_path.read_text())
            guard = data.get('guard_stop') if isinstance(data, dict) else None
            if isinstance(guard, int) and not isinstance(guard, bool) and 15_000_000_000 <= guard <= 37_000_000_000:
                limit = guard
        except (OSError, ValueError):
            pass
    return limit


def worker_command(root, model_id):
    if model_id is None:
        return [sys.executable, str(Path(__file__).with_name('service.py'))]
    if model_id != lx.INKLING_ID or os.environ.get('GIMLE_QWEN_WORKER') != '1':
        raise ValueError('Unsupported supervised worker')
    from service import read_key

    key = root / 'api-key'
    read_key(key)  # Refuse weak, non-owned or non-private key files before spawning.
    model = root / 'models' / model_id
    if not lx.model_ready(model, lx.INKLING):
        raise ValueError('Missing pinned Inkling weights')
    server = root / 'runtime' / 'llama-server-690b87d'
    return [str(server), '--model', str(model / lx.INKLING_FILE), '--alias', model_id,
            '--host', '127.0.0.1', '--port', str(lx.WORKER_PORT), '--api-key-file', str(key),
            '--ctx-size', str(lx.INKLING['context']), '--n-predict', str(lx.INKLING['max_output']),
            '--parallel', '1', '--gpu-layers', 'all', '--no-context-shift', '--cache-ram', '0',
            '--jinja', '--reasoning-effort', 'low', '--no-ui', '--no-slots', '--verbosity', '3']


def main(model_id=None):
    import psutil
    root = Path(os.environ['GIMLE_QWEN_ROOT'])
    limit = lx.INKLING['guard_stop'] if model_id == lx.INKLING_ID else guard_limit(root)
    gateway = os.environ.get('GIMLE_QWEN_GATEWAY_PID')
    if gateway is not None and os.getppid() != int(gateway):
        return 1
    peak = 0
    reason = None
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    command = worker_command(root, model_id)
    # Prevent LLAMA_ARG_* from silently overriding the qualified worker profile.
    env = {k: v for k, v in os.environ.items() if not k.startswith('LLAMA_ARG_')} if model_id else None
    child = subprocess.Popen(command, start_new_session=True, env=env)
    try:
        while child.poll() is None:
            if stopping:
                reason = 'service_stop'
                break
            if gateway is not None and os.getppid() != int(gateway):
                reason = 'gateway_exit'
                break
            try:
                parent = psutil.Process(child.pid)
                total = footprint(os.getpid())
                for member in [parent, *parent.children(recursive=True)]:
                    try:
                        total += footprint(member.pid)
                    except ProcessLookupError:
                        if member.is_running() and member.status() != psutil.STATUS_ZOMBIE:
                            raise
                peak = max(peak, total)
                # service.py can exec in place after atomically changing swap-state.
                if model_id is None:
                    limit = guard_limit(root)
                if total >= limit:
                    reason = 'footprint_limit'
                    break
            except (ProcessLookupError, psutil.NoSuchProcess, psutil.AccessDenied):
                if child.poll() is None:
                    reason = 'measurement_failure'
                break
            time.sleep(0.05)
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM if stopping else signal.SIGKILL)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
        child.wait()
        (root / 'last-exit.json').write_text(json.dumps({'exit_code': child.returncode,
            'reason': reason, 'sampled_peak_bytes': peak, 'stop_threshold_bytes': limit,
            'hard_cap': False, 'time': time.time()}) + '\n')
    return 0 if stopping else 1


if __name__ == '__main__':
    raise SystemExit(main(*sys.argv[1:]))
