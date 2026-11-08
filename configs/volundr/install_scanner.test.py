import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


MODULE_PATH = Path(__file__).with_name('install_scanner.py')
spec = importlib.util.spec_from_file_location('install_scanner', MODULE_PATH)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


def scanner_archive(binary):
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode='w:gz') as output:
        info = tarfile.TarInfo('gitleaks')
        info.size = len(binary)
        output.addfile(info, io.BytesIO(binary))
    return archive.getvalue()


class InstallScannerTests(unittest.TestCase):
    def test_retries_gateway_timeout_then_installs_checksum_verified_binary(self):
        binary = b'pinned scanner fixture'
        archive = scanner_archive(binary)
        url = 'https://example.invalid/gitleaks.tar.gz'
        timeout = HTTPError(url, 504, 'Gateway Time-out', {}, None)
        fixture_asset = ('linux_x64', hashlib.sha256(archive).hexdigest())

        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(scanner.ASSETS, {('Linux', 'x86_64'): fixture_asset}), \
             patch('time.sleep') as sleep:
            destination = Path(directory) / 'gitleaks'
            with patch.object(scanner.platform, 'system', return_value='Linux'), \
                 patch.object(scanner.platform, 'machine', return_value='x86_64'), \
                 patch.object(scanner.urllib.request, 'urlopen', side_effect=[timeout, io.BytesIO(archive)]) as open_url:
                result = scanner.install(destination)

            self.assertEqual(result, destination)
            self.assertEqual(destination.read_bytes(), binary)
            self.assertEqual(open_url.call_count, 2)
            sleep.assert_called_once_with(1)


if __name__ == '__main__':
    unittest.main()
