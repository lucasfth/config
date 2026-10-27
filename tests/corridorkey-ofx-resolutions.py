#!/usr/bin/env python3
"""Generate independent direct-worker fixtures for the dynamically loaded OFX host.

Run with runtime venv, --host compiled tests/corridorkey-ofx-host.cpp and --binary
built OFX binary. Includes physically reduced 960x540 frame buffers, not merely
scale metadata on a full-sized image. Never starts or modifies Resolve.
"""
import argparse
import importlib.util
from pathlib import Path
import subprocess
import tempfile

import cv2
import numpy as np

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--fixture',type=Path,required=True)
p.add_argument('--host',type=Path,required=True)
p.add_argument('--binary',type=Path,required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worker',root/'configs/davinci-resolve/native/worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
engine=w.Engine(Path.home()/'Library/Application Support/CorridorKey-Resolve')
bgr=cv2.imread(str(a.fixture));assert bgr is not None
with tempfile.TemporaryDirectory(prefix='ck2-host-resolutions-') as temporary:
    temporary=Path(temporary)
    for width,height in [(960,540),(1280,720),(1920,1080),(3840,2160),(1080,1920)]:
        rgba=np.empty((height,width,4),dtype='<f4')
        rgba[...,:3]=cv2.resize(bgr,(width,height))[...,::-1].astype(np.float32)/255
        rgba[...,3]=1
        reference=engine.infer(rgba,0,0,1.,0)
        rgba.tofile(temporary/'input.f32');reference.tofile(temporary/'reference.f32')
        for stride in ('positive','negative'):
            subprocess.run([str(a.host),str(temporary/'input.f32'),str(temporary/'reference.f32'),stride,str(a.binary),str(width),str(height)],check=True,timeout=180)
        print('HOST_GEOMETRY_PASS',width,height,flush=True)
