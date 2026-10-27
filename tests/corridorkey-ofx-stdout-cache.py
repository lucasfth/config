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
    def infer(self, rgba, screen, output, despill, encoding, policy, black, white, grow, softness):
        print('PYTHON_LOG_INFER')
        libc=ctypes.CDLL(None)
        libc.puts(b'C_STDIO_LOG_INFER');libc.fflush(None)
        values=(screen,output,despill,encoding,policy,black,white,grow,softness,float(rgba[0,0,0]))
        value=sum((index+1)*float(value) for index,value in enumerate(values))
        return np.full(rgba.shape,value,dtype='<f4')
w.Engine=Engine
w.serve(Path('/unused'))
'''.replace('WORKER', repr(str(worker)))
frame = bytes(1280 * 720 * 16)
def request(mode=0, **changes):
    values=dict(screen=0,output=mode,despill=1.,encoding=0,policy=0,black=0.,white=1.,grow=0.,softness=0.)
    values.update(changes)
    return struct.pack('<8sIIIIfIIffff',b'CK2OFX02',1280,720,*values.values())+frame
requests=[request(),request(),request(1),request(screen=1),request(despill=.5),request(encoding=2),
          request(policy=1),request(black=.1),request(white=.9),request(grow=1.),request(softness=1.),request(),request()]
changed_pixels=bytearray(request());struct.pack_into('<f',changed_pixels,52,.5);requests.append(bytes(changed_pixels))
misses=sum(index==0 or payload!=requests[index-1] for index,payload in enumerate(requests))
result = subprocess.run([sys.executable, '-u', '-c', program],
                        input=b''.join(requests), capture_output=True, timeout=30)
assert result.returncode == 0, result.stderr.decode(errors='replace')
assert result.stderr.count(b'PYTHON_LOG_INFER') == misses, result.stderr
assert result.stderr.count(b'C_STDIO_LOG_INFER') == misses, result.stderr
offset=0
for payload in requests:
    values=(*struct.unpack('<8sIIIIfIIffff',payload[:52])[3:],struct.unpack_from('<f',payload,52)[0])
    expected_value=sum((index+1)*float(value) for index,value in enumerate(values))
    expected=struct.pack('<II',0,len(frame))+struct.pack('<f',expected_value)*(1280*720*4)
    assert result.stdout[offset:offset+len(expected)]==expected,'Wrong cached pixels or stdout log corruption'
    offset+=len(expected)
assert len(result.stdout) == len(requests) * (8 + len(frame))
print('OBSERVED_PYTHON_INFER_LOGS', result.stderr.count(b'PYTHON_LOG_INFER'),
      'C_STDIO_INFER_LOGS', result.stderr.count(b'C_STDIO_LOG_INFER'),
      'REPLY_BYTES', len(result.stdout))
print('FD1_C_STDIO_PYTHON_LOGS_AND_PARAMETER_CACHE_COUNT=PASS')
