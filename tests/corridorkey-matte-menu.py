#!/usr/bin/env python3
"""Approved setup-menu contract; mocks do not establish interactive UI acceptance."""
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'configs/davinci-resolve/native/matte_menu.py'
s=importlib.util.spec_from_file_location('menu',PATH)
m=importlib.util.module_from_spec(s)

class Tool:
 def GetInputList(self):
  class I:
   def __init__(self,k,values):self.k,self.values=k,values
   def GetAttrs(self):return {'INPS_ID':self.k,'INPIDT_ComboControl_ID':dict(enumerate(self.values,1))}
  return {1:I('InputColorSpace',['REC709_COLORSPACE','REC2020_COLORSPACE','CANONLOG2_COLORSPACE']),
          2:I('InputGamma',['TWOPOINTFOUR_GAMMA','SRGB_GAMMA','LINEAR_GAMMA','APPLE_LOG_GAMMA','CANONLOG3_GAMMA','FLOG_OETF_GAMMA'])}
 def Delete(self):self.deleted=True;self.comp.ActiveTool=None
class Comp:
 def __init__(self):self.ActiveTool=object()
 def AddTool(self,*a):
  self.probe=Tool();self.probe.comp=self;self.ActiveTool=self.probe;return self.probe
 def SetActiveTool(self,tool):self.ActiveTool=tool
 def AskUser(self,title,fields):self.fields=fields;return self.answer
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):s.loader.exec_module(m)
 def test_cancel_does_not_build(self):
  c=Comp();c.answer=None
  self.assertIsNone(m.run(c,lambda *a:self.fail('built on cancel')));self.assertTrue(c.probe.deleted)
 def test_default_requires_explicit_selection(self):
  c=Comp();c.answer={'Space':0,'Gamma':0}
  with self.assertRaisesRegex(ValueError,'choose'):m.run(c,lambda *a:self.fail('built without selection'))
 def test_explicit_options_only_and_selected_mapping(self):
  c=Comp();c.answer={'Space':1,'Gamma':1};seen=[]
  m.run(c,lambda *args:seen.append(args))
  self.assertEqual(seen[0][2:],('REC709_COLORSPACE','TWOPOINTFOUR_GAMMA'))
  self.assertTrue(c.probe.deleted)
  offered=c.fields[1]['Options'].values()
  self.assertNotIn('DaVinci Wide Gamut',offered)
 def test_cancel_preserves_source_selection(self):
  c=Comp();source=c.ActiveTool;c.answer=None
  m.run(c,lambda *a:self.fail('built on cancel'))
  self.assertIs(c.ActiveTool,source)
 def test_invalid_selection_preserves_source_for_retry(self):
  c=Comp();source=c.ActiveTool;c.answer={'Space':0,'Gamma':0}
  with self.assertRaises(ValueError):m.run(c,lambda *a:self.fail('built with invalid selection'))
  self.assertIs(c.ActiveTool,source)
 def test_visible_error_explains_next_action(self):
  c=Comp();c.answer=None
  m.show_error(c,ValueError('Open Fusion and select the source node first'))
  self.assertIn('source node',c.fields[1]['Default'])
  self.assertTrue(c.fields[1]['ReadOnly'])
 def test_module_is_managed_without_reviving_batch_menu(self):
  nix=(ROOT/'nix/darwin/davinci-resolve.nix').read_text()
  self.assertIn('CorridorKey Original-colour matte.py',nix)
  self.assertIn('native/setup_single.py',nix)
  self.assertIn('native/comp_text.py',nix)
  self.assertNotIn('bake_button',nix)
  self.assertIn('removeCorridorBatchMenu',nix)
 def test_single_node_builder_accepts_menu_contract(self):
  import sys
  from unittest.mock import Mock,patch
  sys.path.insert(0,str(PATH.parent));import setup_single
  c=Comp();c.answer={'Space':1,'Gamma':1};resolve=Mock();resolve.GetProjectManager.return_value.GetCurrentProject.return_value.GetCurrentTimeline.return_value=None
  with patch.dict(sys.modules,{'DaVinciResolveScript':Mock(scriptapp=Mock(return_value=resolve))}):
   with self.assertRaisesRegex(ValueError,'timeline'):m.run(c,setup_single.build)
if __name__=='__main__':unittest.main()
