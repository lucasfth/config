import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import loki_job


class CronEntryTests(unittest.TestCase):
    def test_sync_and_review_from_unrelated_cwd_with_empty_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); repo = root / 'repo'; state = root / 'state'
            guide = repo / 'skills/fixture/SKILL.md'; guide.parent.mkdir(parents=True)
            guide.write_text('---\nname: fixture\ndescription: fixture workflow\nmetadata:\n  status: active\n---\n')
            subprocess.run(['git', 'init', '-b', 'main', repo], check=True, capture_output=True)
            for args in [['config', 'user.email', 'fixture@example.invalid'], ['config', 'user.name', 'Fixture'],
                         ['add', '.'], ['commit', '-m', 'fixture']]:
                subprocess.run(['git', '-C', repo, *args], check=True, capture_output=True)
            settings = root / 'settings.json'
            marker = root / 'stub-ran'
            stub = root / 'dream_stub.py'
            stub.write_text('from pathlib import Path\nPath(' + repr(str(marker)) + ').write_text("stub only")\n')
            vault = root / 'vault.txt'; vault.write_text('unchanged vault')
            settings.write_text(json.dumps({'repo': str(repo), 'home': str(root / 'home'),
                'state': str(state), 'inbox': str(root / 'inbox'), 'path': os.environ['PATH'],
                'dream_script': str(stub)}))
            env = {**os.environ, 'PATH': ''}
            for action in ['sync', 'review', 'dream']:
                result = subprocess.run([sys.executable, HERE / 'loki_job.py', '--settings', settings, action],
                                        cwd=root, env=env, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((state / 'last-sync.json').read_text())['status'], 'no-new-bundle')
            self.assertTrue((state / 'consolidation.json').is_file())
            self.assertEqual(marker.read_text(), 'stub only')
            self.assertEqual(vault.read_text(), 'unchanged vault')
            data = json.loads(settings.read_text()); del data['dream_script']; settings.write_text(json.dumps(data))
            with self.assertRaises(KeyError):
                loki_job.execute(settings, 'dream')
            # Raw local conflict text/paths never enter review context.
            (state / 'pending.json').write_text(json.dumps({'status': 'conflict', 'conflicts': ['private-secret'],
                'candidate': '/private/secret-path', 'body': 'password=private-value'}))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                loki_job.execute(settings, 'review')
            self.assertNotIn('private', output.getvalue())
            self.assertEqual(json.loads(output.getvalue())['local_work']['conflict_count'], 1)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                loki_job.execute(settings, 'review')
            self.assertIn('wakeAgent', output.getvalue())

    def test_sync_failure_refreshes_evidence_and_records_only_error_type(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory);settings = root / 'settings.json'
            settings.write_text(json.dumps({'state': str(root), 'path': os.environ['PATH']}))
            with patch.object(loki_job.nightly, 'sync', side_effect=ValueError('sensitive context')), \
                    patch.object(loki_job.nightly, 'consolidation') as refresh, \
                    contextlib.redirect_stderr(io.StringIO()) as output:
                self.assertEqual(loki_job.execute(settings, 'sync'), 1)
            self.assertNotIn('sensitive', output.getvalue())
            refresh.assert_called_once()
            self.assertEqual(json.loads((root / 'last-error.json').read_text()), {'error_type': 'ValueError'})


if __name__ == '__main__':
    unittest.main()
