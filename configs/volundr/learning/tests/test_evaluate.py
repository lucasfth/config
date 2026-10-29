"""Offline qualification of captured runs; no shell/model execution."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from learning import evaluate as evaluation
from learning.extract import sha


class EvalTests(unittest.TestCase):
    def fixture(self, root):
        suite = json.loads((Path(__file__).parents[1] / 'fixtures/pilots.json').read_text())
        packet = {'base_sha256': 'a'*64, 'candidate_sha256': 'b'*64}
        traces = []
        for harness in ['hugi', 'loki']:
            for variant in ['baseline', 'candidate']:
                for case in suite['cases']:
                    artifact = root / f'{harness}-{variant}-{case["id"]}.json'
                    claims = copy.deepcopy(case['expected'])
                    if variant == 'baseline' and case['id'] == 'downstream-write-failed':
                        claims['status'] = 'complete'
                    artifact.write_text(json.dumps({'claims': claims}))
                    traces.append({'harness': harness, 'variant': variant, 'case': case['id'],
                        'trial': 1, 'model': 'fixture-model', 'provider': 'fixture-provider',
                        'harness_revision': 'c'*40, 'skill_sha256': packet['base_sha256' if variant == 'baseline' else 'candidate_sha256'],
                        'elapsed_seconds': 1, 'input_tokens': 20, 'output_tokens': 10,
                        'artifact': artifact.name, 'artifact_sha256': sha(artifact.read_bytes()),
                        'capture': 'synthetic'} )
        return suite, packet, traces

    def test_fixture_comparison_is_not_native_behavior_qualification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            suite, packet, traces = self.fixture(root)
            result = evaluation.compare(root, suite, packet, traces)
            self.assertEqual(result['target_improvements'], 2)
            self.assertFalse(result['qualified'])
            self.assertEqual(result['state'], 'fixture-only')

    def test_missing_harness_case_trial_and_regression_block_qualification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            suite, packet, traces = self.fixture(root)
            result = evaluation.compare(root, suite, packet, traces[:-1])
            self.assertEqual(result['state'], 'incomplete')
            # A zero-gain or regressing candidate is not an improvement.
            first = next(t for t in traces if t['variant'] == 'candidate')
            path = root / first['artifact']
            path.write_text('{"claims":{"status":"complete"}}')
            first['artifact_sha256'] = sha(path.read_bytes())
            result = evaluation.compare(root, suite, packet, traces)
            self.assertFalse(result['qualified'])
            self.assertGreater(result['candidate_failures'], 0)

    def test_tampered_artifact_skill_hash_and_duplicate_capture_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            suite, packet, traces = self.fixture(root)
            for field, value in [('skill_sha256', 'd'*64), ('artifact', '../escape'),
                                 ('artifact_sha256', 'e'*64), ('elapsed_seconds', -1),
                                 ('model', 'different-model'), ('input_tokens', 1.5)]:
                altered = copy.deepcopy(traces)
                altered[0][field] = value
                with self.subTest(field=field), self.assertRaises(ValueError):
                    evaluation.compare(root, suite, packet, altered)
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                evaluation.compare(root, suite, packet, traces + [traces[0]])

    def test_native_provider_error_is_not_a_completed_capture(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            suite, packet, traces = self.fixture(root)
            trace = traces[0]
            path = root / trace['artifact']
            artifact = json.loads(path.read_text())
            artifact['result'] = {'failed': True, 'completed': False, 'error': 'format_error'}
            path.write_text(json.dumps(artifact))
            trace['artifact_sha256'] = sha(path.read_bytes())
            with self.assertRaisesRegex(ValueError, 'failed'):
                evaluation.compare(root, suite, packet, traces)

    def test_native_labels_alone_do_not_authorize_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            suite, packet, traces = self.fixture(root)
            for trace in traces:
                trace['capture'] = 'native'
            result = evaluation.compare(root, suite, packet, traces)
            self.assertFalse(result['publication_authorized'])
            self.assertEqual(result['state'], 'awaiting-independent-trace-review')
            self.assertFalse(result['qualified'])


if __name__ == '__main__':
    unittest.main()
