"""Static skill contract checks; not agent behavior or pressure tests."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[4]


class SkillContractTests(unittest.TestCase):
    def test_audit_separates_execution_downstream_and_adoption(self):
        body = (ROOT / 'volundr/skills/improvement-loop-audit/SKILL.md').read_text()
        for phrase in ['scheduler', 'downstream', 'published', 'delivered', 'loaded',
                       'behavior', 'independent incidents', 'existing guidance',
                       'Do not restart', 'intentionally suppressed']:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, body)
        self.assertNotIn('Judge by SESSION-PATTERNS mtime only', body)
        self.assertNotIn('>= 1 skill touched in 14 days', body)


if __name__ == '__main__':
    unittest.main()
