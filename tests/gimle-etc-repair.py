#!/usr/bin/env python3
"""No root, launchd or real /etc changes: disposable exact-link repair fixtures."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import patch
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
repair = SourceFileLoader('etc_repair', str(ROOT / 'scripts/gimle-etc-repair')).load_module()


class Repair(unittest.TestCase):
    def test_atomic_link_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            link = root / 'static'
            link.symlink_to(root / 'old')
            repair.replace_link(link, root / 'new')
            self.assertEqual(link.readlink(), root / 'new')
            self.assertEqual(list(root.glob('.static-repair-*')), [])

    def fixture(self, root, failure=False):
        static, aux = root / 'static', root / 'aux'
        old, new = root / 'old', root / 'new'
        old.mkdir()
        new.mkdir()
        (old / 'enabled').write_text('enabled\n')
        static.symlink_to(old)
        aux.symlink_to(static / 'enabled')
        context = [patch.object(repair, 'STATIC', static), patch.object(repair, 'AUX', aux),
                   patch.object(repair, 'EXPECTED_NEW', new), patch.object(repair, 'RECOVERY', root),
                   patch.object(repair, 'inspect', side_effect=[(False, {'pid': 42}), (True, {'pid': 42})]),
                   patch.object(repair, 'verify_loki', side_effect=ValueError('fixture failure') if failure else None),
                   patch.object(repair.os, 'geteuid', return_value=0),
                   patch.object(repair.sys, 'argv', ['repair', '--apply'])]
        return context, static, aux, old, new

    def test_success_changes_only_two_links(self):
        from contextlib import ExitStack
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            contexts, static, aux, old, new = self.fixture(Path(directory).resolve())
            for context in contexts:
                stack.enter_context(context)
            previous = repair.os.umask(0o022)
            try:
                repair.main()
            finally:
                repair.os.umask(previous)
            self.assertEqual(static.readlink(), new)
            self.assertFalse(aux.is_symlink())

    def test_failure_restores_two_links(self):
        from contextlib import ExitStack
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            contexts, static, aux, old, new = self.fixture(Path(directory).resolve(), failure=True)
            for context in contexts:
                stack.enter_context(context)
            previous = repair.os.umask(0o022)
            try:
                with self.assertRaisesRegex(ValueError, 'fixture failure'):
                    repair.main()
            finally:
                repair.os.umask(previous)
            self.assertEqual(static.readlink(), old)
            self.assertEqual(aux.readlink(), static / 'enabled')

    def test_default_never_changes_links(self):
        with patch.object(repair, 'inspect', return_value=(False, {})), \
                patch.object(repair.Path, 'readlink', return_value=Path('/fixture')), \
                patch.object(repair.sys, 'argv', ['repair']), \
                patch.object(repair, 'replace_link') as change:
            repair.main()
            change.assert_not_called()


if __name__ == '__main__':
    unittest.main()
