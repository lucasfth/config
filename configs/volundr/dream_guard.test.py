import ast
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('dream_guard', Path(__file__).with_name('dream_guard.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

FIXTURE = '''from pathlib import Path
DREAMS_DIR = Path('/forbidden')
def consume_hardener_proposals(state):
    raise AssertionError('old auto-apply called')
def proactive_skill_patching(state, error_report):
    if 'No error' in error_report:
        return '', []
    if not error_report:
        return '', []
    return 'fixture', ['suggestion-only']
'''


class DreamGuardTests(unittest.TestCase):
    def test_optional_learning_runs_only_when_explicitly_configured(self):
        import sys
        import types
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = root / 'settings.json'
            calls = []
            consolidation = types.SimpleNamespace(consolidation=lambda config: calls.append('consolidate'))
            learning = types.SimpleNamespace(nightly=lambda config: calls.append(('learning', config)) or {'processed': []})
            runner = types.SimpleNamespace(returncode=0)
            settings.write_text(json.dumps({'state': str(root / 'state')}))
            with patch.dict(sys.modules, {'nightly': consolidation, 'aar_learning': learning}), \
                    patch.object(module.subprocess, 'run', return_value=runner):
                self.assertEqual(module.run_dream(settings, root / 'never-executed.py'), 0)
                self.assertEqual(calls, ['consolidate'])
                calls.clear()
                config = root / 'aar-learning.json'
                settings.write_text(json.dumps({'state': str(root / 'state'), 'aar_learning_config': str(config)}))
                self.assertEqual(module.run_dream(settings, root / 'never-executed.py'), 0)
                self.assertEqual(calls, ['consolidate', ('learning', config)])

    def test_learning_summary_does_not_deliver_raw_sources_or_candidates(self):
        import contextlib
        import io
        import sys
        import types
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = root / 'settings.json'
            settings.write_text(json.dumps({'state': str(root/'state'), 'aar_learning_config': str(root/'learning.json')}))
            result = {'processed': ['candidate-id'], 'errors': [{'source': 'PRIVATE_SOURCE_PATH', 'error': 'PRIVATE_ERROR_TEXT'}],
                      'archive_plan': {'eligible': [{'source': 'PRIVATE_ARCHIVE_PATH'}]}}
            learning = types.SimpleNamespace(nightly=lambda _: result)
            consolidation = types.SimpleNamespace(consolidation=lambda _: None)
            output = io.StringIO()
            with patch.dict(sys.modules, {'nightly': consolidation, 'aar_learning': learning}), \
                    patch.object(module.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(module.run_dream(settings, root/'unused.py'), 1)
            self.assertNotIn('PRIVATE_', output.getvalue())
            self.assertIn('candidates', output.getvalue())
            self.assertIn('errors', output.getvalue())

    def test_all_return_paths_without_a_report_local(self):
        text = module.guarded_source(FIXTURE)
        namespace = {}
        exec(compile(text, '<guard-fixture>', 'exec'), namespace)
        for error_report, patches in [('No errors', []), ('', []), ('recurring error', ['suggestion-only'])]:
            state = {'original': True}
            section, actual = namespace['proactive_skill_patching'](state, error_report)
            self.assertEqual(section.count('Volundr consolidation evidence:'), 1)
            self.assertEqual(actual, patches)
            self.assertEqual(state, {'original': True})
        self.assertEqual(module.guarded_source(text).encode(), text.encode())

    def test_captured_source_functions_without_importing_or_running_dream(self):
        import os
        source = os.environ.get('VOLUNDR_DREAM_SOURCE')
        if not source:
            self.skipTest('Set VOLUNDR_DREAM_SOURCE to a private captured dream script')
        original = Path(source).read_text()
        guarded = module.guarded_source(original)
        self.assertEqual(module.guarded_source(guarded).encode(), guarded.encode())
        names = {'consume_hardener_proposals', 'proactive_skill_patching', '_proactive_skill_patching_original'}
        functions = [n for n in ast.parse(guarded).body if isinstance(n, ast.FunctionDef) and n.name in names]
        self.assertEqual(len(functions), 3)
        namespace = {}
        # Execute only the changed function definitions, never module-level code.
        exec(compile(ast.Module(body=functions, type_ignores=[]), source, 'exec'), namespace)
        self.assertEqual(namespace['consume_hardener_proposals']({})[1:], (0, 0))
        for error_report in ['No errors', '', 'recurring errors']:
            namespace['_detect_recurring_patterns'] = lambda text: []
            with patch('builtins.open', side_effect=AssertionError('Unexpected I/O')), \
                    patch('subprocess.run', side_effect=AssertionError('Unexpected process')):
                state = {'applied_patches': ['existing']}
                section, patches = namespace['proactive_skill_patching'](state, error_report)
            self.assertEqual(patches, [])
            self.assertEqual(section.count('Volundr consolidation evidence:'), 1)
            self.assertEqual(state, {'applied_patches': ['existing']})
        # Exercise the real suggestion branch with only its file-writing boundary stubbed.
        namespace['_detect_recurring_patterns'] = lambda text: [{'source': 'fixture', 'count': 2}]
        namespace['create_skill_patch'] = lambda *args: Path('fixture-proposal.md')
        section, patches = namespace['proactive_skill_patching']({}, 'recurring errors')
        self.assertEqual(patches, ['fixture-proposal.md'])
        self.assertIn('Proactive Skill Patches', section)
        self.assertEqual(section.count('Volundr consolidation evidence:'), 1)

    def test_install_backs_up_and_disables_auto_apply_without_running_dream(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / '.hermes'
            (home / 'scripts').mkdir(parents=True)
            (home / 'cron').mkdir()
            (home / 'cron/jobs.json').write_text('{"jobs": []}')
            (root / 'loki-memory/dreams').mkdir(parents=True)
            (root / 'loki-memory/dreams/example.md').write_text('original dream')
            (root / 'loki-memory/.dream_state.json').write_text('{"last_run": "original"}')
            script = home / 'scripts/dream_obsidian.py'
            script.write_text(FIXTURE)
            with patch.object(module.Path, 'home', return_value=root):
                receipt = module.install(script, home)
            backup = Path(receipt['backup'])
            self.assertEqual((backup / script.name).read_text(), FIXTURE)
            self.assertEqual((backup / 'dreams/example.md').read_text(), 'original dream')
            self.assertEqual((backup / '.dream_state.json').read_text(), '{"last_run": "original"}')
            text = script.read_text()
            ast.parse(text)
            namespace = {}
            exec(compile(text, str(script), 'exec'), namespace)
            self.assertEqual(namespace['consume_hardener_proposals']({})[1:], (0, 0))
            self.assertIn('consolidation.json', namespace['proactive_skill_patching']({}, '')[0])
            self.assertFalse(receipt['dream_run'])
            self.assertEqual(module.guarded_source(text), text)


if __name__ == '__main__':
    unittest.main()
