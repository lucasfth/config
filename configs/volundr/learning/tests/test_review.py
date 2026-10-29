"""Hash-bound candidate packet fixtures; not an autonomous writer sandbox."""
import json
from pathlib import Path
import tempfile
import unittest
from learning import review
from learning.extract import sha


class ReviewTests(unittest.TestCase):
    def fixture(self, root):
        skills = root / 'skills-repo'
        target = skills / 'skills/cron-audit/SKILL.md'
        target.parent.mkdir(parents=True)
        target.write_text('---\nname: cron-audit\ndescription: Audit scheduled jobs.\n---\n# Audit\nCheck execution.\n')
        candidate = root / 'candidate.md'
        candidate.write_text(target.read_text() + 'Check downstream artifacts separately.\n')
        group = {'route': 'skill-patch', 'status': 'review-ready', 'target': target.relative_to(skills).as_posix(),
            'target_sha256': sha(target.read_bytes()), 'observations': [{'source': {'path': 'fixture', 'sha256': 'a'*64}}]}
        group['binding'] = sha(json.dumps(group, sort_keys=True).encode())
        return skills, target, candidate, group

    def test_packet_binds_exact_candidate_and_never_writes_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills, target, candidate, group = self.fixture(Path(tmp))
            before = target.read_bytes()
            packet = review.prepare(skills, group, candidate)
            self.assertEqual(packet['candidate_sha256'], sha(candidate.read_bytes()))
            self.assertEqual(packet['state'], 'awaiting-evaluation-and-review')
            self.assertFalse(packet['publication_authorized'])
            self.assertIn('+Check downstream artifacts', packet['diff'])
            self.assertEqual(target.read_bytes(), before)

    def test_changed_binding_or_target_and_unqualified_route_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills, target, candidate, group = self.fixture(Path(tmp))
            for key, value in [('binding', 'b'*64), ('route', 'code-review'), ('status', 'watch')]:
                altered = {**group, key: value}
                with self.assertRaises(ValueError):
                    review.prepare(skills, altered, candidate)
            target.write_text(target.read_text() + 'Concurrent edit\n')
            with self.assertRaisesRegex(ValueError, 'target changed'):
                review.prepare(skills, group, candidate)

    def test_noop_frontmatter_change_and_symlink_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skills, target, candidate, group = self.fixture(root)
            candidate.write_bytes(target.read_bytes())
            with self.assertRaisesRegex(ValueError, 'No change'):
                review.prepare(skills, group, candidate)
            candidate.write_text(target.read_text().replace('name: cron-audit', 'name: different'))
            with self.assertRaisesRegex(ValueError, 'frontmatter'):
                review.prepare(skills, group, candidate)
            candidate.unlink()
            candidate.symlink_to(target)
            with self.assertRaisesRegex(ValueError, 'Symlink'):
                review.prepare(skills, group, candidate)


if __name__ == '__main__':
    unittest.main()
