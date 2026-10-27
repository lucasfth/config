#!/usr/bin/env python3
"""Exercise the real pipe reader when its real MLX worker is killed mid-frame."""
import os
from pathlib import Path
import signal
import struct
import subprocess
import sys
import time

worker=Path(__file__).resolve().parents[1]/'configs/davinci-resolve/native/worker.py'
process=subprocess.Popen([sys.executable,'-u',str(worker)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
try:
    header=struct.pack('<8sIIIIfIIffff',b'CK2OFX02',1280,720,0,0,1.,0,0,0.,1.,0.,0.)
    process.stdin.write(header+b'\0'*4096)
    process.stdin.flush()
    # Worker is waiting for the remaining fixed-size payload; kill only this child.
    time.sleep(.2)
    process.kill()
    process.wait(timeout=5)
    assert process.stdout.read(8)==b''
    try:
        process.stdin.write(b'\0'*65536)
        process.stdin.flush()
        raise AssertionError('Expected closed-pipe error')
    except BrokenPipeError:
        pass
    print('REAL_WORKER_MIDFRAME_EOF_AND_BROKEN_PIPE=PASS')
finally:
    if process.poll() is None:process.kill()
    process.wait(timeout=5)
