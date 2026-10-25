#!/usr/bin/env python3
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
loader=importlib.machinery.SourceFileLoader('installer',str(ROOT/'scripts/install-corridorkey-ofx'))
spec=importlib.util.spec_from_loader(loader.name,loader)
m=importlib.util.module_from_spec(spec);loader.exec_module(m)

class Install(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=Path(self.tmp.name);self.source=self.root/'source.bundle';self.source.mkdir();(self.source/'payload').write_text('v1')
  self.plugins=self.root/'plugins'
  self.verify=patch.object(m,'verify').start();self.addCleanup(patch.stopall)
 def install(self, running=False, fail_marker=False):
  real_replace=os.replace
  def replace(a,b):
   if fail_marker and Path(a).name=='marker' and '.corridorkey2-stage.' in str(a):raise OSError('marker failure')
   return real_replace(a,b)
  def command(args, **kwargs):
   if args[0]=='/usr/bin/pgrep':return type('Result',(),{'returncode':0 if running else 1})()
   if args[0]=='/usr/bin/ditto':
    import shutil
    shutil.copytree(args[1],args[2]);return type('Result',(),{'returncode':0})()
   raise AssertionError(args)
  with patch.object(m.subprocess,'run',side_effect=command),patch.object(m.os,'replace',side_effect=replace):m.install(self.source,self.plugins)
 def test_first_repeat_upgrade_and_backup(self):
  self.install();self.install()
  target=self.plugins/m.BUNDLE
  target.chmod(0o555)
  (self.source/'payload').write_text('v2');self.install()
  self.assertEqual((target/'payload').read_text(),'v2')
  self.assertTrue(any((p/m.BUNDLE/'payload').exists() for p in self.plugins.glob('.corridorkey2-backup.*')))
 def test_readonly_source_installs(self):
  (self.source/'Contents').mkdir()
  (self.source/'Contents/file').write_text('nested')
  for item in [self.source,*self.source.rglob('*')]:item.chmod(0o555 if item.is_dir() else 0o444)
  self.addCleanup(lambda: [item.chmod(0o755) for item in [self.source,*self.source.rglob('*')] if item.is_dir()])
  self.install();self.install()
  self.assertEqual((self.plugins/m.BUNDLE/'Contents/file').read_text(),'nested')

 def test_resolve_open_refusal(self):
  with self.assertRaises(RuntimeError):self.install(running=True)
  self.assertFalse(self.plugins.exists())
 def test_unmanaged_refusal(self):
  target=self.plugins/m.BUNDLE;target.mkdir(parents=True);(target/'payload').write_text('other')
  with self.assertRaises(ValueError):self.install()
 def test_failed_marker_rolls_back(self):
  self.install();before=(self.plugins/m.MARKER).read_text();(self.source/'payload').write_text('v2')
  with self.assertRaises(OSError):self.install(fail_marker=True)
  self.assertEqual((self.plugins/m.BUNDLE/'payload').read_text(),'v1')
  self.assertEqual((self.plugins/m.MARKER).read_text(),before)
 def test_signature_failure_does_not_modify(self):
  self.verify.side_effect=ValueError('invalid signature')
  with self.assertRaises(ValueError):self.install()
  self.assertFalse(self.plugins.exists())

if __name__=='__main__':unittest.main()
