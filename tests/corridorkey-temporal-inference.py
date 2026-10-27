#!/usr/bin/env python3
"""Opt-in real v3 worker vs independently generated upstream one-window reference.

Uses scratch runtime/model root; never installs or opens Resolve. Requires the
external four-frame fixture and reference outputs from pipeline.run(window=4).
"""
import argparse,json,os,resource,struct,subprocess,sys,tempfile,time
from pathlib import Path
import cv2,numpy as np
p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--frames',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);a=p.parse_args()
ROOT=Path(__file__).resolve().parents[1];header=struct.Struct('<8sIIIIfIIffffI')
def exact(stream,n):
 b=bytearray()
 while len(b)<n:
  data=stream.read(n-len(b))
  if not data:raise EOFError('Worker exited before complete reply')
  b.extend(data)
 return bytes(b)
with tempfile.TemporaryDirectory(prefix='ck-temporal-test-') as tmp:
 home=Path(tmp);runtime=home/'Library/Application Support/CorridorKey-Resolve';runtime.mkdir(parents=True);(runtime/'ready.json').write_text('{}');(runtime/'models').symlink_to(a.models.resolve(),target_is_directory=True)
 with (home/'worker.log').open('w+') as log:
  proc=subprocess.Popen([sys.executable,'-u',str(ROOT/'configs/davinci-resolve/native/worker.py')],env={**os.environ,'HOME':str(home)},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log)
  try:
   previous=None;stats=[];start=time.monotonic()
   for target in [3,0,2,3]:
    proc.stdin.write(header.pack(b'CK2OFX03',1280,720,0,0,1.,0,0,0.,1.,0.,0.,target))
    for path in sorted(a.frames.glob('*.png')):
     b=cv2.imread(str(path),-1);assert b is not None and b.shape[:2]==(720,1280)
     rgba=np.ones((720,1280,4),dtype='<f4');rgba[:,:,:3]=b[:,:,:3][:,:,::-1]/(65535. if b.dtype==np.uint16 else 255.);proc.stdin.write(rgba.tobytes())
    proc.stdin.flush();status,size=struct.unpack('<II',exact(proc.stdout,8));body=exact(proc.stdout,size)
    assert status==0,body.decode(errors='replace');actual=np.frombuffer(body,dtype='<f4').reshape(720,1280,4)
    ref=cv2.imread(str(a.reference/f'{target:06d}.png'),-1)[:,:,[2,1,0,3]].astype(np.float32)/65535.;ref[:,:,:3]*=ref[:,:,3:4]
    error=np.abs(actual-ref);assert error.max()<=2/65535
    if target==3:
     if previous is not None:np.testing.assert_array_equal(actual,previous)
     previous=actual.copy()
    stats.append(dict(target=target,max=float(error.max()),mean=float(error.mean())))
   proc.stdin.close();assert proc.wait(timeout=15)==0
   report=dict(scope='one four-frame window, v3 real worker; not multi-window whole-clip equivalence or Resolve acceptance',checks=stats,seconds=time.monotonic()-start)
   print(json.dumps(report));print('REAL_V3_WORKER_SINGLE_WINDOW_REFERENCE_ORDER=PASS')
  except Exception:
   log.seek(0);print(log.read(),file=sys.stderr);raise
  finally:
   if proc.poll() is None:proc.kill();proc.wait(timeout=10)
   peak=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss;print('WORKER_PEAK_RSS_BYTES',peak);assert peak<4*1024**3
