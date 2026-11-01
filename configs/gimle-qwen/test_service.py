import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('service', pathlib.Path(__file__).with_name('service.py'))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class PolicyTests(unittest.TestCase):
    def test_only_fixed_model_and_bounded_output(self):
        request = {'model': service.MODEL_ID, 'messages': [{'role': 'user', 'content': 'hello'}]}
        self.assertEqual(service.validate_request(request)['model'], 'default_model')
        for changes in [{'model': 'remote/repo'}, {'max_tokens': 5000}, {'max_tokens': -1}, {'max_tokens': True}, {'n': 2}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                service.validate_request({**request, **changes})

    def test_clients_cannot_load_models_or_override_template(self):
        request = {'model': service.MODEL_ID, 'messages': [{'role': 'user', 'content': 'hi'}]}
        for field in ['adapters', 'draft_model', 'chat_template', 'chat_template_kwargs', 'max_completion_tokens']:
            with self.subTest(field=field), self.assertRaises(ValueError):
                service.validate_request({**request, field: 'untrusted'})

    def test_snapshot_identity_and_exact_prefix(self):
        identity = 'version-a'
        meta = {'identity': identity, 'tokens': [1, 2, 3]}
        self.assertTrue(service.matches(meta, identity, [1, 2, 3, 4]))
        self.assertFalse(service.matches(meta, 'version-b', [1, 2, 3, 4]))
        self.assertFalse(service.matches(meta, identity, [1, 9, 3, 4]))
        self.assertFalse(service.matches(meta, identity, [1, 2]))

    def test_secret_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            p = pathlib.Path(folder) / 'key'
            p.write_text('x' * 48)
            p.chmod(0o600)
            self.assertEqual(service.read_key(p), 'x' * 48)
            p.chmod(0o644)
            with self.assertRaises(PermissionError):
                service.read_key(p)


if __name__ == '__main__':
    unittest.main()
