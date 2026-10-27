#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import struct
import unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('worker',ROOT/'configs/davinci-resolve/native/worker.py');w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
class ResizeControls(unittest.TestCase):
 def header(self,**changes):
  v=dict(width=1920,height=1080,screen=0,output=0,despill=1.,encoding=2,policy=0,black=0.,white=1.,grow=0.,softness=0.);v.update(changes)
  return struct.pack('<8sIIIIfIIffff',b'CK2OFX02',*v.values())
 def test_header_1080p_and_controls(self):
  self.assertEqual(w.HEADER.size,52)
  self.assertEqual(w.parse_header(self.header())[:2],(1920,1080))
  for mode in range(5):w.parse_header(self.header(output=mode))
 def test_4k_and_full_size_still_headers(self):
  for width,height in [(3840,2160),(4096,2160),(2160,4096),(6240,4160),(4160,6240),(8192,1)]:
   self.assertEqual(w.parse_header(self.header(width=width,height=height))[:2],(width,height))
 def test_invalid(self):
  for changes in [dict(width=0),dict(width=8193),dict(width=8192,height=8192),dict(policy=1),dict(white=0.),dict(black=1.),dict(grow=21.),dict(softness=-1.),dict(encoding=3),dict(output=5)]:
   with self.subTest(changes=changes),self.assertRaises(ValueError):w.parse_header(self.header(**changes))
 def test_fit_geometry(self):
  for height,width in [(1080,1920),(1920,1080),(400,2000),(720,1280)]:
   source=np.ones((height,width,3),np.float32)*.4
   canvas,box=w.fit_frame(source)
   self.assertEqual(canvas.shape,(720,1280,3));x,y,nw,nh=box
   self.assertLess(abs(nw/nh-width/height),.01)
   restored=w.restore_frame(canvas,box,(height,width));self.assertEqual(restored.shape,source.shape)
   np.testing.assert_allclose(restored,source,atol=1e-6)
 def test_matte_refinement(self):
  a=np.zeros((32,32),np.float32);a[12:20,12:20]=1
  np.testing.assert_array_equal(w.refine_alpha(a,0,1,0,0),a)
  self.assertGreater(w.refine_alpha(a,0,1,2,0).sum(),a.sum())
  self.assertLess(w.refine_alpha(a,0,1,-2,0).sum(),a.sum())
  soft=w.refine_alpha(a,0,1,0,1);self.assertTrue(((soft>0)&(soft<1)).any())
  np.testing.assert_allclose(w.refine_alpha(np.array([[.2,.5,.8]],np.float32),.2,.8,0,0),[[0,.5,1]],atol=1e-6)
 def test_colour_roundtrip(self):
  rgb=np.linspace(0,1,30,dtype=np.float32).reshape(2,5,3)
  for encoding in range(3):np.testing.assert_allclose(w.from_display(w.to_display(rgb,encoding),encoding),rgb,atol=1e-6)
 def test_compose_modes_and_refined_alpha(self):
  fg=np.ones((32,32,3),np.float32)*.8;a=np.ones((32,32),np.float32)*.25
  cut=w.compose(fg,a,0,0);np.testing.assert_allclose(cut[:,:,:3],.2)
  matte=w.compose(fg,a,1,2);np.testing.assert_allclose(matte[:,:,:3],.25);np.testing.assert_allclose(matte[:,:,3],1)
  for mode in (2,3,4):self.assertTrue(np.isfinite(w.compose(fg,a,mode,1)).all())
 def test_checker_composites_in_linear_light(self):
  fg=np.ones((2,2,3),np.float32)*.8;a=np.ones((2,2),np.float32)*.25
  linear=w.from_display(fg,1)*.25+w.from_display(np.full_like(fg,.35),1)*.75
  expected=w.to_display(linear,1)
  np.testing.assert_allclose(w.compose(fg,a,4,0)[...,:3],expected,atol=1e-6)
if __name__=='__main__':unittest.main()
