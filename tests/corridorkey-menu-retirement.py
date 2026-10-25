#!/usr/bin/env python3
"""Evaluate only the managed menu migration; use isolated HOME paths."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
class MenuRetirement(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.script=subprocess.check_output(['nix','eval','--raw','.#darwinConfigurations.lucas-macbook-pro.config.home-manager.users.lucasfreytorreshanson.home.activation.removeCorridorBatchMenu.data'],cwd=ROOT,text=True)
 def test_store_links_only_and_dry_run(self):
  for kind in ('direct','home-manager','custom','file','dry-run'):
   with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temporary:
    home=Path(temporary);menu=home/'Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/CorridorKey 2.0.py';menu.parent.mkdir(parents=True)
    if kind=='file':menu.write_text('user-owned')
    else:
     target={'direct':'/nix/store/test-CorridorKey-2.0.py','home-manager':'/nix/store/test-home-manager-files/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/CorridorKey 2.0.py','dry-run':'/nix/store/test-CorridorKey-2.0.py'}.get(kind,'/tmp/user-script.py')
     menu.symlink_to(target)
    result=subprocess.run(['/bin/sh','-eu','-c',self.script],env=dict(os.environ,HOME=str(home),DRY_RUN_CMD='echo' if kind=='dry-run' else ''),capture_output=True,text=True)
    self.assertEqual(result.returncode,0,result.stderr)
    self.assertEqual(os.path.lexists(menu),kind in ('custom','file','dry-run'))

if __name__=='__main__':unittest.main()
