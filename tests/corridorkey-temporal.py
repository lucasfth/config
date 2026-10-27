#!/usr/bin/env python3
"""Scheduling and memory-contract tests; real-model/host checks are separate."""
import importlib.util
from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]/'configs/davinci-resolve/native/temporal.py'
class Temporal(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  spec=importlib.util.spec_from_file_location('temporal',P);cls.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.m)
 def test_lookahead_uses_real_future_and_past_frames(self):
  for ahead in range(4):
   times,target=self.m.frame_plan(10,0,20,ahead)
   self.assertEqual(times,list(range(7+ahead,11+ahead)));self.assertEqual(target,3-ahead);self.assertEqual(times[target],10)
 def test_boundaries_hold_first_last_and_single_frame(self):
  self.assertEqual(self.m.frame_plan(0,0,20,1),([0,0,0,1],2))
  self.assertEqual(self.m.frame_plan(20,0,20,2),([19,20,20,20],1))
  self.assertEqual(self.m.frame_plan(5,5,5,3),([5,5,5,5],0))
 def test_invalid_range_and_lookahead(self):
  for args in [(0,0,1,4),(0,0,1,-1),(0,0,1,1.5),(0,1,2,0),(float('nan'),0,1,0),(0,1,0,0)]:
   with self.subTest(args=args),self.assertRaises(ValueError):self.m.frame_plan(*args)
 def test_4k_accepted_large_still_rejected_before_allocation(self):
  for size in [(3840,2160),(2160,3840),(4096,2160)]:self.m.validate_size(*size)
  for size in [(6240,4160),(4096,4096),(8192,1),(0,720)]:
   with self.subTest(size=size),self.assertRaisesRegex(ValueError,'Temporal'):self.m.validate_size(*size)
 def test_v3_header_bounds_and_target(self):
  import struct
  spec=importlib.util.spec_from_file_location('worker',P.with_name('worker.py'));worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
  def header(width=1920,height=1080,target=2):return struct.pack('<8sIIIIfIIffffI',b'CK2OFX03',width,height,0,0,1.,0,0,0.,1.,0.,0.,target)
  self.assertEqual(worker.parse_temporal_header(header()),(1920,1080,0,0,1.,0,0,0.,1.,0.,0.,2))
  for h in [header(target=4),header(6240,4160),header()[:-1]]:
   with self.assertRaises(ValueError):worker.parse_temporal_header(h)
 def test_temporal_module_is_bundled(self):
  nix=(P.parents[3]/'nix/darwin/corridorkey-ofx-package.nix').read_text()
  self.assertIn('cp worker.py temporal.py',nix)
if __name__=='__main__':unittest.main()
