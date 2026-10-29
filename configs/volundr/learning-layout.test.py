"""Package entrypoints and compatibility adapter; never invokes a provider."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent


class LayoutTests(unittest.TestCase):
    def test_package_entrypoint_and_legacy_adapter_keep_disabled_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'config.json'
            config.write_text('{"enabled":false}')
            commands = [[sys.executable, '-m', 'learning', 'extract', '--config', str(config)],
                        [sys.executable, '-m', 'learning', 'cron', '--config', str(config)],
                        [sys.executable, str(HERE/'aar_learning.py'), 'nightly', '--config', str(config)]]
            for command in commands:
                result = subprocess.run(command, cwd=HERE, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), {'state':'disabled'})

    def test_cron_bad_configuration_is_redacted_nonzero_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            config=Path(tmp)/'private.json';config.write_text('{"enabled":true}')
            result=subprocess.run([sys.executable,'-m','learning','cron','--config',str(config)],
                cwd=HERE,capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,1)
            self.assertEqual(json.loads(result.stdout),{'state':'failed','error_type':'KeyError'})
            self.assertEqual(result.stderr,'')
            self.assertNotIn(tmp,result.stdout)


if __name__ == '__main__': unittest.main()
