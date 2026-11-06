#!/usr/bin/env python3
"""Validate next-boot payloads without touching live jobs or plists."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader('next_boot', str(Path(__file__).resolve().parents[1] / 'scripts/gimle-next-boot-install'))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class NextBoot(unittest.TestCase):
    def test_actual_payload_lints_and_rejects_wrong_owner(self):
        source = os.environ.get('GIMLE_NEXT_BOOT_PAYLOAD')
        if not source:
            self.skipTest('Set GIMLE_NEXT_BOOT_PAYLOAD to generated payload')
        jobs = json.loads(Path(source).read_text())
        for label, job in jobs.items():
            self.assertEqual(plistlib.loads(module.validate(job, label)), job)
            wrong = dict(job, UserName='root')
            with self.assertRaises(AssertionError):
                module.validate(wrong, label)

    def test_only_macos_plutil_is_executed(self):
        source = os.environ.get('GIMLE_NEXT_BOOT_PAYLOAD')
        if not source:
            self.skipTest('Set GIMLE_NEXT_BOOT_PAYLOAD to generated payload')
        jobs = json.loads(Path(source).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gateway = root / 'dk.loki.gateway.plist'
            gateway.write_bytes(plistlib.dumps(jobs['dk.loki.gateway']))
            before = gateway.read_bytes()
            with patch.object(module, 'ROOT', root), \
                 patch.object(module.socket, 'gethostname', return_value='gimle'), \
                 patch.object(module.Path, 'lstat') as meta, \
                 patch.object(module.subprocess, 'run', wraps=module.subprocess.run) as run, \
                 patch('sys.argv', ['installer', source]):
                meta.return_value.st_uid = 0
                meta.return_value.st_mode = 0o100644
                module.main()
                for call in run.call_args_list:
                    self.assertEqual(call.args[0][:2], ['/usr/bin/plutil', '-lint'])
            self.assertEqual(gateway.read_bytes(), before)
            self.assertFalse((root / 'dk.loki.dashboard.plist').exists())


if __name__ == '__main__':
    unittest.main()
