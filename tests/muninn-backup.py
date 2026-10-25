#!/usr/bin/env python3
"""Native Muninn backup regression checks; no production data or network."""
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'configs/loki/backup_obsidian.py'


class BackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('backup', SOURCE)
        cls.b = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.b)

    def test_native_paths_and_no_android_environment(self):
        self.assertEqual(self.b.SOURCE, Path.home() / 'loki-data/loki-memory')
        self.assertEqual(self.b.REPO, Path.home() / 'loki-data/loki-muninn-backup')
        self.assertNotIn('/data/data/', self.b.BACKUP_PATH)

    def test_snapshot_sqlite_and_ordinary_files(self):
        with tempfile.TemporaryDirectory() as d:
            source, dest = Path(d) / 'source', Path(d) / 'dest'
            source.mkdir()
            (source / '.git').mkdir()
            (source / '.git/private').write_text('not payload')
            (source / 'note.md').write_text('hello')
            with sqlite3.connect(source / 'index.db') as db:
                db.execute('create table example (value)')
                db.execute('insert into example values (42)')
            self.b.snapshot_tree(source, dest)
            self.assertFalse((dest / '.git').exists())
            self.assertEqual((dest / 'note.md').read_text(), 'hello')
            with sqlite3.connect(dest / 'index.db') as db:
                self.assertEqual(db.execute('select value from example').fetchone(), (42,))

    def test_snapshot_refuses_symlinks(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'source').mkdir()
            (root / 'source/link').symlink_to('/etc/hosts')
            with self.assertRaisesRegex(RuntimeError, 'symlink'):
                self.b.snapshot_tree(root / 'source', root / 'dest')

    def test_snapshot_detects_source_change(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'source').mkdir()
            (root / 'source/note.md').write_text('before')
            original = self.b.shutil.copy2
            def mutate(source, target):
                result = original(source, target)
                Path(source).write_text('after')
                return result
            with patch.object(self.b.shutil, 'copy2', side_effect=mutate):
                with self.assertRaisesRegex(RuntimeError, 'changed'):
                    self.b.snapshot_tree(root / 'source', root / 'dest')

    def test_volundr_includes_unpublished_but_not_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); repo = root / 'repo'; repo.mkdir()
            def git(*args):
                return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
            git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid')
            (repo / '.gitignore').write_text('secret.local\n')
            (repo / 'SKILL.md').write_text('old'); git('add', '.'); git('commit', '-qm', 'initial')
            (repo / 'SKILL.md').write_text('edited'); (repo / 'new.md').write_text('new')
            (repo / 'secret.local').write_text('excluded')
            dest = root / 'snapshot'; result = self.b.snapshot_volundr(repo, dest)
            self.assertEqual((dest / 'worktree/SKILL.md').read_text(), 'edited')
            self.assertFalse((dest / 'worktree/secret.local').exists())
            self.assertEqual(result['worktree_files'], 3)

    def test_network_retries_are_bounded(self):
        bad = subprocess.CompletedProcess([], 1, '', 'unavailable')
        with tempfile.TemporaryDirectory() as d, patch.object(self.b, 'LOG', Path(d) / 'log'), patch.object(self.b.subprocess, 'run', return_value=bad) as run, patch.object(self.b.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'after 3 attempt'):
                self.b.run('git', 'fetch', attempts=3)
            self.assertEqual(run.call_count, 3)

    def test_ciphertext_tree_allowlist(self):
        self.b.validate_ciphertext_paths(['.salt/format.json', '.salt/key.age', '.salt/recipients.txt', '.gitignore', '.gitattributes', 'index.age', 'objects/ab/cd.age'])
        with self.assertRaises(RuntimeError):
            self.b.validate_ciphertext_paths(['note.md'])


if __name__ == '__main__':
    unittest.main()
