#!/usr/bin/env python3
from pathlib import Path
from importlib.machinery import SourceFileLoader
import base64
import hashlib
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
vendor = SourceFileLoader('vendor', str(ROOT / 'scripts/loki-readcode-vendor')).load_module()


class Vendor(unittest.TestCase):
    def fixture(self, root):
        source = root / 'source'
        source.mkdir()
        (source / 'fixture.py').write_bytes(b'VALUE=1\n')
        info = source / 'fixture-1.0.dist-info'
        info.mkdir()
        (info / 'METADATA').write_text('Name: fixture\nVersion: 1.0\n')
        rows = []
        for path in (source / 'fixture.py', info / 'METADATA'):
            data = path.read_bytes()
            digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')
            rows.append(f'{path.relative_to(source)},sha256={digest},{len(data)}')
        (info / 'RECORD').write_text('\n'.join(rows) + '\nfixture-1.0.dist-info/RECORD,,\n')
        return source

    def test_copies_verified_pinned_files_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            destination = root / 'vendor'
            self.assertEqual(vendor.provision(source, destination, {'fixture': '1.0'}), 3)
            self.assertEqual((destination / 'fixture.py').read_bytes(), b'VALUE=1\n')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                vendor.provision(source, destination, {'fixture': '1.0'})

    def test_bad_record_or_version_never_publishes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            destination = root / 'vendor'
            with self.assertRaisesRegex(ValueError, 'Unexpected version'):
                vendor.provision(source, destination, {'fixture': '2.0'})
            (source / 'fixture.py').write_text('corrupted')
            with self.assertRaisesRegex(ValueError, 'RECORD mismatch'):
                vendor.provision(source, destination, {'fixture': '1.0'})
            self.assertFalse(destination.exists())
            self.assertEqual(list(root.glob('.worker-vendor-*')), [])


if __name__ == '__main__':
    unittest.main()
