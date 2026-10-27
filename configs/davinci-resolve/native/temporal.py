"""Deterministic four-frame model context; reset RVM at each context boundary.

Not whole-clip recurrence or overlapping-window pipeline equivalence.
"""
from pathlib import Path
import math
import numpy as np
import torch
import torch.nn.functional as F
from corridorkey_mlx.mlx_backend import MLXModel
from corridorkey_mlx.pipeline import encode_frame,checkerboard

MAX_PIXELS=4096*2160

def frame_plan(time,first,last,lookahead):
    if not all(math.isfinite(v) for v in (time,first,last)) or first>last or not first<=time<=last:
        raise ValueError('Invalid frame range/time')
    if type(lookahead) is not int or not 0<=lookahead<=3:
        raise ValueError('Lookahead must be an integer 0..3')
    target=3-lookahead
    return [min(last,max(first,time+i-target)) for i in range(4)],target

def validate_size(width,height):
    if type(width) is not int or type(height) is not int or not 1<=width<=4096 or not 1<=height<=4096 or width>MAX_PIXELS//height:
        raise ValueError('Temporal context supports at most 4096 per side and 4096x2160 pixels; use independent mode for larger stills')

class Temporal:
    def __init__(self,worker,runtime):
        self.worker=worker
        self.model=MLXModel(runtime / 'models/fp16',768,1280,compile_graph=True)
        self.checker=checkerboard(720,1280)

    @torch.no_grad()
    def infer(self,frames,target,screen=0,output=0,despill=1.,encoding=0,black=0.,white=1.,grow=0.,softness=0.):
        if target not in range(4):raise ValueError('Invalid target index')
        records=[];state=None;shape=None;target_box=None
        for index,rgba in enumerate(frames):
            if index>=4:raise ValueError('Exactly four frames required')
            height,width=rgba.shape[:2];validate_size(width,height)
            if rgba.shape!=(height,width,4) or not np.isfinite(rgba).all() or not np.allclose(rgba[:,:,3],1,rtol=0,atol=1e-5):raise ValueError('Finite opaque RGBA required')
            if shape is not None and shape!=(height,width):raise ValueError('Context dimensions differ')
            shape=(height,width);canvas,box=self.worker.fit_frame(self.worker.to_display(rgba[:,:,:3],encoding))
            if index==target:target_box=box
            bgr=np.ascontiguousarray(np.rint(canvas[:,:,::-1]*65535).astype(np.uint16));encoded,display=encode_frame(bgr,(768,1280))
            small=F.interpolate(display[None],size=(192,320),mode='bilinear',align_corners=False)
            recurrent,state=self.model.foundations.rvm(small[None].clamp(0,1),state)
            mean=self.model.foundations.rvm_mean.reshape(1,1,-1,1,1);std=self.model.foundations.rvm_std.reshape(1,1,-1,1,1).clamp_min(1e-6)
            features=self.model.foundations(F.interpolate(display[None],size=(192,320),mode='area'),F.interpolate(display[None],size=(168,280),mode='area'))
            records.append((encoded,features['moge'][0],features['cradio'][0],((recurrent-mean)/std)[0,0].to(torch.float16).float()))
            # Generator can release the full-resolution frame before reading next.
            del rgba,canvas,bgr,display
        if len(records)!=4:raise ValueError('Exactly four frames required')
        rgb,moge,radio,rvm=[torch.stack([record[i] for record in records])[None] for i in range(4)]
        stage1=self.model.stage1(rgb,torch.zeros(1,4,1,768,1280),moge,radio,rvm,torch.full((1,4),-1.).bfloat16().float())
        baton=stage1['baton'][:,target:target+1].to(torch.float16).float()
        prediction=self.model.stage2(rgb[:,target:target+1],baton)
        meta=dict(model_native_hw=(720,1280),output_hw=(720,1280),pad=(0,0,24,0),despill_strength=despill,screen=('green','blue')[screen])
        rendered=self.model._render_predictions(meta,{'cutout','raw_fg'} if output==2 else {'cutout'},self.checker,prediction[0]);rgba=rendered['cutout'][0][:,:,[2,1,0,3]].astype(np.float32)/65535.
        foreground=rendered['raw_fg'][0][:,:,[2,1,0]].astype(np.float32)/65535. if output==2 else rgba[:,:,:3]
        foreground=self.worker.restore_frame(foreground,target_box,shape)
        alpha=self.worker.refine_alpha(self.worker.restore_frame(rgba[:,:,3],target_box,shape),black,white,grow,softness)
        return self.worker.compose(foreground,alpha,output,encoding)