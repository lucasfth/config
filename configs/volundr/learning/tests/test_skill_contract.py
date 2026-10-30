"""Static skill contract checks; not agent behavior or pressure tests."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def shared_skill_path(name):
    """Use real shared skills; an explicit root is authoritative, never a fallback."""
    override = os.environ.get('VOLUNDR_SKILLS_DIR')
    if override is not None:
        roots = [Path(override).expanduser()] if override.strip() else []
    else:
        roots = []
        for parent in Path(__file__).resolve().parents:
            roots.extend([parent / 'skills', parent / 'volundr/skills'])
        roots.append(Path.home() / '.hermes/skills')
    for root in roots:
        candidate = root / name / 'SKILL.md'
        if candidate.is_file():
            return candidate
    checked = ', '.join(str(root) for root in roots) or '(empty override)'
    raise FileNotFoundError(
        f'Shared skill {name}/SKILL.md not found. Set VOLUNDR_SKILLS_DIR to the '
        f'authoritative Volundr skills directory. Checked: {checked}')


class SkillContractTests(unittest.TestCase):
    def test_audit_separates_execution_downstream_and_adoption(self):
        body = shared_skill_path('improvement-loop-audit').read_text()
        for phrase in ['scheduler', 'downstream', 'published', 'delivered', 'loaded',
                       'behavior', 'independent incidents', 'existing guidance',
                       'Do not restart', 'intentionally suppressed']:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, body)
        self.assertNotIn('Judge by SESSION-PATTERNS mtime only', body)
        self.assertNotIn('>= 1 skill touched in 14 days', body)

    def test_explicit_root_wins_over_repository_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            expected = root / 'shared/skills/example/SKILL.md'
            expected.parent.mkdir(parents=True)
            expected.write_text('authoritative override')
            decoy = root / 'repo/volundr/skills/example/SKILL.md'
            decoy.parent.mkdir(parents=True)
            decoy.write_text('repository copy')
            with patch.dict(os.environ, {'VOLUNDR_SKILLS_DIR': str(expected.parents[1])}), \
                 patch(f'{__name__}.__file__', str(root / 'repo/learning/tests/test.py')):
                self.assertEqual(shared_skill_path('example'), expected)

    def test_invalid_override_fails_without_falling_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fallback = root / '.hermes/skills/example/SKILL.md'
            fallback.parent.mkdir(parents=True)
            fallback.write_text('must not mask invalid override')
            for override in [str(root / 'missing'), '']:
                with self.subTest(override=override), \
                     patch.dict(os.environ, {'VOLUNDR_SKILLS_DIR': override}), \
                     patch.object(Path, 'home', return_value=root):
                    with self.assertRaisesRegex(FileNotFoundError, 'VOLUNDR_SKILLS_DIR'):
                        shared_skill_path('example')

    def test_source_repository_layouts(self):
        for relative in ['skills', 'volundr/skills']:
            with self.subTest(layout=relative), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                expected = root / 'repo' / relative / 'example/SKILL.md'
                expected.parent.mkdir(parents=True)
                expected.write_text('shared repository skill')
                with patch.dict(os.environ, {}, clear=True), \
                     patch(f'{__name__}.__file__', str(root / 'repo/learning/tests/test.py')), \
                     patch.object(Path, 'home', return_value=root / 'home'):
                    self.assertTrue(shared_skill_path('example').samefile(expected))

    def test_installed_canonical_sibling_and_hermes_layouts(self):
        for relative in ['live/volundr/skills', 'home/.hermes/skills']:
            with self.subTest(layout=relative), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                expected = root / relative / 'example/SKILL.md'
                expected.parent.mkdir(parents=True)
                expected.write_text('installed shared skill')
                installed = root / 'live/hermes/volundr-nightly/code/learning/tests/test.py'
                with patch.dict(os.environ, {}, clear=True), \
                     patch(f'{__name__}.__file__', str(installed)), \
                     patch.object(Path, 'home', return_value=root / 'home'):
                    self.assertTrue(shared_skill_path('example').samefile(expected))

    def test_missing_shared_skill_fails_with_discovery_details(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.dict(os.environ, {}, clear=True), \
                 patch(f'{__name__}.__file__', str(root / 'repo/learning/tests/test.py')), \
                 patch.object(Path, 'home', return_value=root / 'home'):
                with self.assertRaises(FileNotFoundError) as caught:
                    shared_skill_path('missing-example')
                self.assertIn('missing-example/SKILL.md', str(caught.exception))
                self.assertIn('VOLUNDR_SKILLS_DIR', str(caught.exception))
                self.assertIn(str(root / 'home/.hermes/skills'), str(caught.exception))


if __name__ == '__main__':
    unittest.main()
