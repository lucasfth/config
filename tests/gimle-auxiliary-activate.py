#!/usr/bin/env python3
"""Non-privileged checks of activation links and embedded recovery validation."""
from pathlib import Path
import os
import stat
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/gimle-auxiliary-activate'


class Activation(unittest.TestCase):
    def test_root_managed_links_are_traversable_even_under_private_parent_umask(self):
        source = SOURCE.read_text()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'target'
            target.write_text('fixture')
            for name in ('runner', 'gate'):
                link = Path(directory) / name
                script = source.split('"$PYTHON"', 1)[0]
                script = script[script.index('umask '):]
                subprocess.run(['/bin/bash', '-c', script + '\nln -s "$1" "$2"', 'fixture', str(target), str(link)], check=True)
                self.assertEqual(stat.S_IMODE(link.lstat().st_mode) & 0o555, 0o555)
                self.assertEqual(link.read_text(), 'fixture')

    def test_rollback_rejects_missing_empty_and_invalid_records(self):
        source = SOURCE.read_text()
        rollback = source.split("<<'ROLLBACK'\n", 1)[1].split('\nROLLBACK', 1)[0]
        self.assertLess(rollback.index('PREVIOUS='), rollback.index('launchctl bootout'))
        validator = rollback.split("<<'PY'\n", 1)[1].split('\nPY', 1)[0]
        with tempfile.TemporaryDirectory() as directory:
            record = Path(directory) / 'record'
            for content in (None, '', '/tmp/not-a-managed-runner\n'):
                if content is not None:
                    record.write_text(content)
                result = subprocess.run([sys.executable, '-I', '-c', validator, str(record)], capture_output=True)
                self.assertNotEqual(result.returncode, 0)

    def test_embedded_python_parses_and_record_precedes_import(self):
        source = SOURCE.read_text()
        self.assertLess(source.index('Previous managed runner recorded'), source.index('"$NIX" --extra'))
        for block in source.split("<<'PY'\n")[1:]:
            compile(block.split('\nPY', 1)[0], str(SOURCE), 'exec')


if __name__ == '__main__':
    unittest.main()
