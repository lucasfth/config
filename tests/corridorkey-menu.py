#!/usr/bin/env python3
"""Menu orchestration contracts without Resolve or model inference."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("menu", ROOT / "configs/davinci-resolve/CorridorKey 2.0.py")
menu = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(menu)


class MenuTests(unittest.TestCase):
    def fixture(self):
        pool = Mock()
        pool.SetCurrentFolder.return_value = True
        project = Mock()
        project.GetMediaPool.return_value = pool
        project.GetUniqueId.return_value = "test-project"
        resolve = Mock()
        resolve.GetProjectManager.return_value.GetCurrentProject.return_value = project
        bridge = SimpleNamespace(selected_path=Mock(return_value=Path('/tmp/source.mov')),
                                 process=Mock(return_value={"job": "/tmp/job"}),
                                 import_outputs=Mock(return_value=[Mock()]))
        spec = Mock()
        spec.loader.exec_module.side_effect = lambda module: module.__dict__.update(vars(bridge))
        return resolve, pool, bridge, spec

    def test_success_imports_and_restores_folder(self):
        resolve, pool, bridge, spec = self.fixture()
        with patch.object(menu.importlib.util, 'spec_from_file_location', return_value=spec), \
             patch.object(menu.importlib.util, 'module_from_spec', return_value=SimpleNamespace()):
            menu.run(resolve)
        bridge.process.assert_called_once()
        bridge.import_outputs.assert_called_once()
        self.assertEqual(pool.SetCurrentFolder.call_args.args[0], pool.GetCurrentFolder.return_value)

    def test_failed_process_never_creates_bin(self):
        resolve, pool, bridge, spec = self.fixture()
        bridge.process.side_effect = RuntimeError('failed inference')
        with patch.object(menu.importlib.util, 'spec_from_file_location', return_value=spec), \
             patch.object(menu.importlib.util, 'module_from_spec', return_value=SimpleNamespace()), \
             self.assertRaises(RuntimeError):
            menu.run(resolve)
        pool.AddSubFolder.assert_not_called()
        bridge.import_outputs.assert_not_called()

    def test_import_failure_restores_folder(self):
        resolve, pool, bridge, spec = self.fixture()
        bridge.import_outputs.side_effect = ValueError('failed import')
        with patch.object(menu.importlib.util, 'spec_from_file_location', return_value=spec), \
             patch.object(menu.importlib.util, 'module_from_spec', return_value=SimpleNamespace()), \
             self.assertRaises(ValueError):
            menu.run(resolve)
        self.assertEqual(pool.SetCurrentFolder.call_args.args[0], pool.GetCurrentFolder.return_value)

    def test_project_changed_never_imports(self):
        resolve, pool, bridge, spec = self.fixture()
        resolve.GetProjectManager.return_value.GetCurrentProject.side_effect = [
            resolve.GetProjectManager.return_value.GetCurrentProject.return_value, None]
        with patch.object(menu.importlib.util, 'spec_from_file_location', return_value=spec), \
             patch.object(menu.importlib.util, 'module_from_spec', return_value=SimpleNamespace()), \
             self.assertRaises(RuntimeError):
            menu.run(resolve)
        pool.AddSubFolder.assert_not_called()
        bridge.import_outputs.assert_not_called()


    def test_resolve_console_without_flush(self):
        class FusionConsole:
            def __init__(self):
                self.text = ''
            def write(self, text):
                self.text += text
        resolve, pool, bridge, spec = self.fixture()
        console = FusionConsole()
        with patch('sys.stdout', console), \
             patch.object(menu.importlib.util, 'spec_from_file_location', return_value=spec), \
             patch.object(menu.importlib.util, 'module_from_spec', return_value=SimpleNamespace()):
            menu.run(resolve)
        self.assertIn('imported 1 straight-alpha cutout', console.text)


    def test_entrypoint_reports_selection_error_without_flush(self):
        import runpy
        class FusionConsole:
            def __init__(self):
                self.text = ''
            def write(self, text):
                self.text += text
        resolve, pool, bridge, spec = self.fixture()
        bridge.selected_path.side_effect = ValueError('Select exactly one source clip in the Media Pool (not the timeline)')
        console = FusionConsole()
        with patch('sys.stdout', console), \
             patch.object(menu.importlib.util, 'spec_from_file_location', return_value=spec), \
             patch.object(menu.importlib.util, 'module_from_spec', return_value=SimpleNamespace()), \
             self.assertRaisesRegex(ValueError, 'Select exactly one source clip'):
            runpy.run_path(str(ROOT / 'configs/davinci-resolve/CorridorKey 2.0.py'),
                           run_name='__main__', init_globals={'resolve': resolve})
        self.assertIn('CorridorKey ERROR: Select exactly one source clip', console.text)
        pool.AddSubFolder.assert_not_called()


if __name__ == '__main__':
    unittest.main()
