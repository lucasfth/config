#!/usr/bin/env python3
"""Opt-in one-frame real worker memory benchmark; no Resolve or live bundle writes.

macOS ru_maxrss is bytes. Measures worker peak RSS including model and copies,
not total system/GPU memory or Resolve's separate source/destination buffers.
"""
import argparse
import json
import os
from pathlib import Path
import resource
import struct
import subprocess
import sys
import tempfile
import time

import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--width', type=int, default=6240)
parser.add_argument('--height', type=int, default=4160)
parser.add_argument('--encoding', type=int, choices=(0,1,2), default=0)
parser.add_argument('--softness', type=float, default=0.)
args = parser.parse_args()
assert 0 < args.width <= 8192 and 0 < args.height <= 8192 and args.width <= 40_000_000 // args.height
worker = Path(__file__).resolve().parents[1] / 'configs/davinci-resolve/native/worker.py'
source = cv2.imread(str(args.fixture))
assert source is not None
source = cv2.resize(source, (args.width, args.height)).astype(np.float32) / 255
rgba = np.empty((args.height,args.width,4), dtype='<f4')
rgba[...,:3] = source[...,::-1]
if args.encoding:
    rgb=rgba[...,:3]
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    rgba[...,:3]=linear if args.encoding==1 else linear**(1/2.4)
rgba[...,3] = 1
del source
with tempfile.TemporaryDirectory(prefix='ck2-memory-') as temp:
    temp=Path(temp)
    with (temp/'request').open('wb') as request:
        request.write(struct.pack('<8sIIIIfIIffff',b'CK2OFX02',args.width,args.height,0,1,1.,args.encoding,0,0.,1.,0.,args.softness))
        rgba.tofile(request)
    del rgba
    start=time.monotonic()
    with (temp/'request').open('rb') as request, (temp/'response').open('wb') as response:
        p=subprocess.run([sys.executable,'-u',str(worker)],stdin=request,stdout=response,stderr=subprocess.PIPE,timeout=180)
    assert p.returncode==0,p.stderr.decode(errors='replace')
    with (temp/'response').open('rb') as response:
        status,count=struct.unpack('<II',response.read(8))
        assert status==0,response.read(4096).decode(errors='replace')
        assert count==args.width*args.height*16
        assert os.fstat(response.fileno()).st_size==count+8
        result=np.memmap(response,dtype='<f4',mode='r',offset=8,shape=(args.height,args.width,4))
        assert np.isfinite(result).all()
        assert result[...,0].min()<.1 and result[...,0].max()>.9
        assert np.all(result[...,3]==1)
        del result
    peak=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    print(json.dumps(dict(width=args.width,height=args.height,encoding=args.encoding,softness=args.softness,
        wall_seconds=time.monotonic()-start,worker_peak_rss_bytes=peak if sys.platform=='darwin' else peak*1024,
        response_bytes=count,scope='one real worker plus model; excludes Resolve and separate GPU accounting')))
