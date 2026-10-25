#!/usr/bin/env python3
"""Regression: the consumed adoption apply path must never execute again."""
from pathlib import Path
from importlib.machinery import SourceFileLoader
from unittest.mock import patch
import unittest

ROOT = Path(__file__).resolve().parents[1]
mod = SourceFileLoader('retired_adoption', str(ROOT / 'scripts/gimle-adoption-activate')).load_module()


class Failures(unittest.TestCase):
    def test_apply_is_retired_regardless_of_user_or_previous_generation(self):
        for uid in (0, 501):
            with self.subTest(uid=uid), \
                    patch.object(mod.os, 'geteuid', return_value=uid), \
                    patch.object(mod.sys, 'argv', ['adopt', '--apply']), \
                    patch.object(mod, 'preflight') as preflight, \
                    patch.object(mod.subprocess, 'run') as command:
                with self.assertRaisesRegex(SystemExit, 'RETIRED'):
                    mod.main()
                preflight.assert_not_called()
                command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
