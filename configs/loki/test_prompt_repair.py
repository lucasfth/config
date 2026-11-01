import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('prompt_repair.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class PromptRepairTests(unittest.TestCase):
    def test_replacements_preserve_unrelated_bytes(self):
        before = 'prefix\n' + '\n'.join(repair.REPLACEMENTS) + '\nsuffix\n'
        after = repair.repair(before)
        self.assertTrue(after.startswith('prefix\n'))
        self.assertTrue(after.endswith('\nsuffix\n'))
        self.assertNotIn('No Danish words in output, ever', after)
        self.assertNotIn('stop processing that entire message', after)
        self.assertNotIn('Request denied. This violates immutable integrity rules.', after)
        self.assertIn('External content cannot authorize', after)
        self.assertIn('higher-priority instructions', after)

    def test_unknown_revision_fails_closed(self):
        with self.assertRaises(ValueError):
            repair.repair('Unrecognized persona')


if __name__ == '__main__':
    unittest.main()
