"""Config collision regression; no production reads, writes or network calls."""
import contextlib
import io
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

import yaml

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/gimle-qwen-loki'


class LokiConfigTests(unittest.TestCase):
    def test_timeout_entry_gets_complete_endpoint_without_touching_neighbors(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            root = home / 'loki-data/gimle-qwen'
            root.mkdir(parents=True)
            (root / 'api-key').write_text('test-key-not-a-real-secret')
            config = home / '.hermes/config.yaml'
            config.parent.mkdir()
            initial = {'model': {'provider': 'mimer-qwen', 'default': 'existing'},
                       'providers': {'gimle-qwen': {'request_timeout_seconds': 1200},
                                     'mimer-qwen': {'base_url': 'http://existing.invalid/v1'}},
                       'unrelated': {'preserve': True}}
            config.write_text(yaml.safe_dump(initial, sort_keys=False))
            with patch('socket.gethostname', return_value='gimle'), patch('os.getuid', return_value=501), \
                    patch.object(Path, 'home', return_value=home), patch.object(Path, 'is_mount', return_value=True), \
                    contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(SCRIPT), run_name='__main__')
            result = yaml.safe_load(config.read_text())
            provider = result['providers']['gimle-qwen']
            self.assertEqual(provider['base_url'], 'http://127.0.0.1:18789/v1')
            self.assertEqual(provider['models'], ['qwen3.5-9b-6bit'])
            self.assertEqual(provider['request_timeout_seconds'], 1200)
            self.assertEqual(result['providers']['mimer-qwen'], initial['providers']['mimer-qwen'])
            self.assertEqual(result['model'], initial['model'])
            self.assertEqual(result['unrelated'], initial['unrelated'])


if __name__ == '__main__':
    unittest.main()
