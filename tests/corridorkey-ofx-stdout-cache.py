#!/usr/bin/env python3
"""Protocol-only subprocess test: native/Python logging and cache invocation count.

Uses a fake engine, not model inference or Resolve. Full production frame sizes.
"""
from pathlib import Path
import struct
import subprocess
import sys

worker = Path(__file__).resolve().parents[1] / 'configs/davinci-resolve/native/worker.py'
program = '''
import ctypes, importlib.util, numpy as np
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker', WORKER)
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class Engine:
    def __init__(self, runtime): pass
    def infer(self, rgba, screen, output, despill, encoding):
        print('PYTHON_LOG_INFER')
        libc=ctypes.CDLL(None)
        libc.puts(b'C_STDIO_LOG_INFER');libc.fflush(None)
        return np.ones((720,1280,4),dtype='<f4')
w.Engine=Engine
w.serve(Path('/unused'))
'''.replace('WORKER', repr(str(worker)))
frame = bytes(1280 * 720 * 16)
def request(mode):
    return struct.pack('<8sIIIIfI', b'CK2OFX01', 1280,720,0,mode,1.,0) + frame
result = subprocess.run([sys.executable, '-u', '-c', program],
                        input=request(0)+request(0)+request(1), capture_output=True, timeout=30)
assert result.returncode == 0, result.stderr.decode(errors='replace')
assert result.stderr.count(b'PYTHON_LOG_INFER') == 2, result.stderr
assert result.stderr.count(b'C_STDIO_LOG_INFER') == 2, result.stderr
expected = struct.pack('<II', 0, len(frame)) + struct.pack('<f', 1.) * (1280*720*4)
assert result.stdout == expected * 3, 'stdout protocol corrupted by logs'
assert len(result.stdout) == 3 * (8 + len(frame))
print('OBSERVED_PYTHON_INFER_LOGS', result.stderr.count(b'PYTHON_LOG_INFER'),
      'C_STDIO_INFER_LOGS', result.stderr.count(b'C_STDIO_LOG_INFER'),
      'REPLY_BYTES', len(result.stdout))
print('FD1_C_STDIO_PYTHON_LOGS_AND_PARAMETER_CACHE_COUNT=PASS')
