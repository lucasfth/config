#!/usr/bin/env python3
"""The Muninn worker uses only its own fixed vendor directory under python -I."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'configs/loki/readcode/upstream_worker.py'


class Transport(unittest.TestCase):
    def run_fixture(self, factory, vendor=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sandbox, deps = root / 'sandbox', root / 'worker-vendor'
            sandbox.mkdir()
            deps.mkdir()
            worker = sandbox / 'upstream_worker.py'
            worker.write_bytes(SOURCE.read_bytes())
            (sandbox / 'server_transports.py').write_text(
                'from vault_fixture_dependency import VALUE\n'
                'class MuninnLocal:\n'
                ' def call(self,name,arguments,timeout): return {"value":VALUE}\n'
                'CompanyLocal=MuninnLocal\n')
            if vendor:
                (deps / 'vault_fixture_dependency.py').write_text('VALUE="isolated-ok"\n')
            spec = {'paths': [str(sandbox)], 'module': 'server_transports',
                    'factory': factory, 'kwargs': {}}
            request = {'name': 'vault_list', 'arguments': {}, 'timeout': 1}
            result = subprocess.run([sys.executable, '-I', str(worker)],
                                    input=json.dumps(spec) + '\n' + json.dumps(request) + '\n',
                                    capture_output=True, text=True, env={})
            self.assertEqual(result.returncode, 0, result.stderr)
            return json.loads(result.stdout)

    def test_muninn_uses_fixed_vendor_under_isolated_python(self):
        result = self.run_fixture('MuninnLocal')
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['value']['value'], 'isolated-ok')

    def test_missing_dependency_still_fails_closed(self):
        self.assertFalse(self.run_fixture('MuninnLocal', vendor=False)['ok'])

    def test_company_worker_does_not_inherit_muninn_vendor(self):
        self.assertFalse(self.run_fixture('CompanyLocal')['ok'])


if __name__ == '__main__':
    unittest.main()
