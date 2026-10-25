#!/usr/bin/env python3
"""Opt-in real model/protocol check. Requires --fixture-root, never touches Resolve."""
import argparse
import os
from pathlib import Path
import select
import struct
import subprocess
import sys
import time

import cv2
import numpy as np

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fixture-root',required=True,type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
worker=root/'configs/davinci-resolve/native/worker.py'
p=subprocess.Popen([sys.executable,'-u',str(worker)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)

def exact(count):
    output=bytearray();deadline=time.monotonic()+180
    while len(output)<count:
        remaining=deadline-time.monotonic()
        if remaining<=0 or not select.select([p.stdout],[],[],remaining)[0]:raise TimeoutError('worker response timed out')
        chunk=os.read(p.stdout.fileno(),count-len(output))
        if not chunk:raise EOFError('worker exited mid-response')
        output.extend(chunk)
    return bytes(output)

def render(frame, mode=0, encoding=0, screen=0):
    p.stdin.write(struct.pack('<8sIIIIfI',b'CK2OFX01',1280,720,screen,mode,1.,encoding))
    p.stdin.write(frame.astype('<f4').tobytes());p.stdin.flush()
    status,count=struct.unpack('<II',exact(8))
    assert count<=1280*720*16
    output=exact(count)
    if status:raise ValueError(output.decode())
    assert count==1280*720*16
    return np.frombuffer(output,'<f4').reshape(720,1280,4).copy()

try:
    frames=[];results=[]
    for i in range(4):
        source=cv2.imread(str(args.fixture_root/'ck2-sequence'/f'{i:06d}.png'))
        assert source is not None and source.shape==(720,1280,3)
        rgba=np.concatenate([source[:,:,::-1].astype(np.float32)/255,np.ones((720,1280,1),np.float32)],axis=2)
        frames.append(rgba);result=render(rgba);results.append(result)
        batch=cv2.imread(str(args.fixture_root/'ck2-sequence-output/cutout'/f'{i:06d}.png'),cv2.IMREAD_UNCHANGED).astype(np.float32)/65535
        batch=batch[:,:,[2,1,0,3]];batch[:,:,:3]*=batch[:,:,3:4]
        error=float(abs(result-batch).mean());alpha_error=float(abs(result[:,:,3]-batch[:,:,3]).mean())
        assert error<.001 and alpha_error<.001, (i,error,alpha_error)
        assert np.isfinite(result).all() and result[:,:,3].min()<.1 and result[:,:,3].max()>.9
        print('FRAME',i,'RGBA_MAE',error,'ALPHA_MAE',alpha_error,flush=True)
    np.testing.assert_array_equal(render(frames[3]),results[3]) # cache hit
    np.testing.assert_array_equal(render(frames[0]),results[0]) # out-of-order cache miss
    matte=render(frames[0],mode=1)
    np.testing.assert_allclose(matte[:,:,:3],np.repeat(results[0][:,:,3:4],3,axis=2),atol=1/65535)
    np.testing.assert_array_equal(matte[:,:,3],1.)
    linear=frames[0].copy();rgb=linear[:,:,:3]
    linear[:,:,:3]=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    linear_result=render(linear,encoding=1)
    assert np.isfinite(linear_result).all()
    alpha=results[0][:,:,3:4]
    straight=np.divide(results[0][:,:,:3],alpha,out=np.zeros_like(results[0][:,:,:3]),where=alpha>0)
    expected_linear=np.where(straight<=.04045,straight/12.92,((straight+.055)/1.055)**2.4)*alpha
    np.testing.assert_allclose(linear_result[:,:,:3],expected_linear,atol=.0001)
    np.testing.assert_allclose(linear_result[:,:,3],results[0][:,:,3],atol=1/65535)
    np.testing.assert_allclose(render(linear,mode=1,encoding=1),matte,atol=1/65535)
    bad=frames[0].copy();bad[0,0,0]=float('nan')
    try:render(bad);raise AssertionError('non-finite input was accepted')
    except ValueError as error:assert 'non-finite' in str(error)
    p.wait(timeout=10)
    assert p.returncode==0
    print('PERSISTENT_MODEL_CACHE_OUT_OF_ORDER_MATTE_COLOUR_ERRORS=PASS')
finally:
    if p.poll() is None:p.kill()
    p.wait(timeout=10)
    p.stdin.close();p.stdout.close();p.stderr.close()
