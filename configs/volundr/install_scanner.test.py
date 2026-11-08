import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import call, patch
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
    def test_retries_gateway_timeouts_then_installs_checksum_verified_binary(self):
        binary = b'pinned scanner fixture'
        archive = scanner_archive(binary)
        url = 'https://example.invalid/gitleaks.tar.gz'
        timeout = HTTPError(url, 504, 'Gateway Time-out', {}, None)
        fixture_asset = ('linux_x64', hashlib.sha256(archive).hexdigest())

        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(scanner.ASSETS, {('Linux', 'x86_64'): fixture_asset}), \
             patch.object(scanner.time, 'sleep') as sleep:
            destination = Path(directory) / 'gitleaks'
            with patch.object(scanner.platform, 'system', return_value='Linux'), \
                 patch.object(scanner.platform, 'machine', return_value='x86_64'), \
                 patch.object(scanner.urllib.request, 'urlopen', side_effect=[timeout] * 4 + [io.BytesIO(archive)]) as open_url:
                result = scanner.install(destination)

            self.assertEqual(result, destination)
            self.assertEqual(destination.read_bytes(), binary)
            self.assertEqual(open_url.call_count, 5)
            self.assertEqual(sleep.call_args_list, [call(2), call(4), call(8), call(16)])

    def test_stops_after_bounded_transient_failures(self):
        url = 'https://example.invalid/gitleaks.tar.gz'
        timeout = HTTPError(url, 504, 'Gateway Time-out', {}, None)

        with patch.object(scanner.time, 'sleep') as sleep, \
             patch.object(scanner.platform, 'system', return_value='Linux'), \
             patch.object(scanner.platform, 'machine', return_value='x86_64'), \
             patch.object(scanner.urllib.request, 'urlopen', side_effect=timeout) as open_url:
            with self.assertRaises(HTTPError) as caught:
                scanner.download(url)

        self.assertEqual(caught.exception.code, 504)
        self.assertEqual(open_url.call_count, scanner.DOWNLOAD_ATTEMPTS)
        self.assertEqual(sleep.call_args_list, [call(2), call(4), call(8), call(16), call(30)])

    def test_does_not_retry_client_error(self):
        url = 'https://example.invalid/gitleaks.tar.gz'
        not_found = HTTPError(url, 404, 'Not Found', {}, None)

        with patch.object(scanner.time, 'sleep') as sleep, \
             patch.object(scanner.urllib.request, 'urlopen', side_effect=not_found) as open_url:
            with self.assertRaises(HTTPError) as caught:
                scanner.download(url)

        self.assertEqual(caught.exception.code, 404)
        open_url.assert_called_once_with(url, timeout=60)
        sleep.assert_not_called()

    def test_rejects_checksum_mismatch_before_installing_binary(self):
        binary = b'pinned scanner fixture'
        archive = scanner_archive(binary)
        url = 'https://example.invalid/gitleaks.tar.gz'
        wrong_asset = ('linux_x64', '0' * 64)

        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(scanner.ASSETS, {('Linux', 'x86_64'): wrong_asset}), \
             patch.object(scanner.platform, 'system', return_value='Linux'), \
             patch.object(scanner.platform, 'machine', return_value='x86_64'), \
             patch.object(scanner.urllib.request, 'urlopen', return_value=io.BytesIO(archive)):
            destination = Path(directory) / 'gitleaks'
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                scanner.install(destination)
            self.assertFalse(destination.exists())


if __name__ == '__main__':
    unittest.main()
