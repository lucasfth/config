import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys
import secret_gate


class GateTests(unittest.TestCase):
    def test_tree_staged_and_history_block_deleted_basic_auth_and_cannot_self_allow(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            def git(*args):
                return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
            git('init', '-b', 'main');git('config', 'user.name', 'Fixture');git('config', 'user.email', 'fixture@example.invalid')
            (repo / 'guide.md').write_text('safe')
            git('add', '.');git('commit', '-m', 'safe')
            secret_gate.scan(repo)
            # Generate inert credential-shaped data at runtime; never embed a real secret.
            (repo / 'guide.md').write_text(' '.join(['curl', '-u', '"' + 'ab' * 16 + ':' + 'cd' * 16 + '"']) + ' # gitleaks:allow\n')
            (repo / '.gitleaksignore').write_text('*\n')
            git('add', '.')
            with self.assertRaises(RuntimeError):secret_gate.scan(repo, 'staged')
            git('commit', '-m', 'unsafe fixture')
            with self.assertRaises(RuntimeError):secret_gate.scan(repo)
            (repo / 'guide.md').write_text('safe again');git('add', '.');git('commit', '-m', 'removed')
            secret_gate.scan(repo)
            with self.assertRaises(RuntimeError):secret_gate.scan(repo, 'history')

    def test_trusted_entrypoint_ignores_candidate_code_and_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            def git(*args):
                subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
            git('init', '-b', 'main');git('config', 'user.name', 'Fixture');git('config', 'user.email', 'fixture@example.invalid')
            (repo / 'secret_gate.py').write_text('raise RuntimeError("candidate code loaded")')
            (repo / 'gitleaks.toml').write_text('title="candidate allow everything"')
            (repo / 'unsafe.md').write_text('curl -u "' + 'ab' * 16 + ':' + 'cd' * 16 + '"')
            git('add', '.');git('commit', '-m', 'candidate')
            result = subprocess.run([sys.executable, str(Path(secret_gate.__file__).resolve()), 'tree', str(repo), '--policy', str(secret_gate.POLICY)],
                                    cwd=repo, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Secret gate blocked', result.stderr)
            self.assertNotIn('candidate code loaded', result.stderr)
            with self.assertRaisesRegex(RuntimeError, 'trusted scanner policy'):
                secret_gate.scan(repo, policy=repo / 'gitleaks.toml')


if __name__ == '__main__':
    unittest.main()
