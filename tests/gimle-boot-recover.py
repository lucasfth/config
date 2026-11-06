#!/usr/bin/env python3
"""Ensure the scoped installer preserves runtimes and never reloads live jobs."""
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
import os
import plistlib
import tempfile

path = Path(__file__).resolve().parents[1] / 'scripts/gimle-boot-recover'
loader = importlib.machinery.SourceFileLoader('boot_recover', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class BootInstaller(unittest.TestCase):
    def job(self, name):
        args = ['/nix/store/original-python/bin/python3',
                '/etc/loki/volume-mount.py' if name == 'volume' else '/etc/loki/service-run.py']
        if name != 'volume':
            args.append(name)
        job = {'Label': f'dk.loki.{name}', 'ProgramArguments': args,
               'RunAtLoad': True, 'KeepAlive': {'SuccessfulExit': False}}
        if name != 'volume':
            job['UserName'] = 'gimle'
        return job

    def test_only_arguments_change_and_original_runtime_survives(self):
        for name in module.NAMES:
            with self.subTest(name=name):
                original = self.job(name)
                patched = module.patched_job(original, name)
                self.assertEqual(patched['ProgramArguments'][4:], original['ProgramArguments'])
                self.assertEqual({k:v for k,v in patched.items() if k != 'ProgramArguments'},
                                 {k:v for k,v in original.items() if k != 'ProgramArguments'})
                self.assertEqual(module.patched_job(patched, name), patched)

    def test_rejects_unknown_runtime(self):
        job = self.job('gateway')
        job['ProgramArguments'][0] = '/tmp/python3'
        with self.assertRaises(AssertionError):
            module.patched_job(job, 'gateway')

    def test_wrapper_matches_evaluated_nix_source(self):
        snapshot = os.environ.get('GIMLE_BOOT_JOBS')
        if not snapshot:
            self.skipTest('Set GIMLE_BOOT_JOBS to an evaluated launchd JSON file')
        jobs = json.loads(Path(snapshot).read_text())
        args = jobs['loki-volume']['ProgramArguments']
        self.assertEqual(module.WRAPPER[:2], args[:2])
        self.assertEqual(module.BOOT_SCRIPT.strip(), args[2].strip())
        self.assertEqual(module.WRAPPER[3], args[3])

    def test_dry_run_only_invokes_plutil(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in module.NAMES:
                (root / f'dk.loki.{name}.plist').write_bytes(plistlib.dumps(self.job(name)))
            before = {p.name:p.read_bytes() for p in root.iterdir()}
            with patch.object(module, 'PLISTS', root), \
                 patch.object(module.socket, 'gethostname', return_value='gimle'), \
                 patch.object(module.os, 'geteuid', return_value=0), \
                 patch.object(module.Path, 'lstat') as metadata, \
                 patch.object(module.subprocess, 'run', wraps=module.subprocess.run) as run, \
                 patch('sys.argv', ['gimle-boot-recover']):
                metadata.return_value.st_mode = 0o100644
                metadata.return_value.st_uid = 0
                module.main()
                self.assertEqual(run.call_count, len(module.NAMES))
                for call in run.call_args_list:
                    self.assertEqual(call.args[0][:2], ['/usr/bin/plutil', '-lint'])
            self.assertEqual(before, {p.name:p.read_bytes() for p in root.iterdir()})


if __name__ == '__main__':
    unittest.main()
