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
DEFAULT_LIMIT = 17_000_000_000


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
            if isinstance(guard, int) and not isinstance(guard, bool) and 15_000_000_000 <= guard <= 33_000_000_000:
                limit = guard
        except (OSError, ValueError):
            pass
    return limit


def main():
    import psutil
    root = Path(os.environ['GIMLE_QWEN_ROOT'])
    limit = guard_limit(root)
    child = subprocess.Popen([sys.executable, str(Path(__file__).with_name('service.py'))], start_new_session=True)
    peak = 0
    reason = None
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while child.poll() is None:
            if stopping:
                reason = 'service_stop'
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
    raise SystemExit(main())
