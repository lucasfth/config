#!/usr/bin/env python3
"""Mocked readiness checks: never attach a real volume or read a real key."""
import importlib.machinery
import importlib.util
from pathlib import Path
import plistlib
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

path = Path(__file__).resolve().parents[1] / 'scripts/loki-volume-mount'
loader = importlib.machinery.SourceFileLoader('loki_mount', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class VolumeReadiness(unittest.TestCase):
    def check(self, image_path='/private/Loki.sparsebundle', mountpoint='/private/LokiData', uid=501, mode=0o700):
        image = Path('/private/Loki.sparsebundle')
        mount = MagicMock()
        mount.__str__.return_value = '/private/LokiData'
        mount.stat.return_value = SimpleNamespace(st_uid=uid, st_mode=mode)
        info = {'images': [{'image-path': image_path, 'system-entities': [{'mount-point': mountpoint}]}]}
        with patch.object(module, 'IMAGE', image), patch.object(module, 'MOUNT', mount), \
                patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=501)), \
                patch.object(module.subprocess, 'check_output', return_value=plistlib.dumps(info)):
            module.verify_mount()

    def test_exact_image_owner_and_mode(self):
        self.check()

    def test_wrong_image_rejected(self):
        with self.assertRaises(AssertionError):
            self.check(image_path='/private/other.sparsebundle')

    def test_wrong_mount_rejected(self):
        with self.assertRaises(AssertionError):
            self.check(mountpoint='/private/elsewhere')

    def test_wrong_owner_rejected(self):
        with self.assertRaises(AssertionError):
            self.check(uid=0)

    def test_unsafe_mode_rejected(self):
        with self.assertRaises(AssertionError):
            self.check(mode=0o755)

    def test_nonroot_rejected_before_key_access(self):
        with patch.object(module.os, 'geteuid', return_value=501):
            with self.assertRaises(AssertionError):
                module.main()


if __name__ == '__main__':
    unittest.main()
