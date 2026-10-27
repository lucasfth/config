#!/usr/bin/env python3
"""Single-node insertion and stateful import/rollback contracts; no live Resolve."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1] / 'configs/davinci-resolve/native'
sys.path.insert(0, str(ROOT))


def good_comp():
    comp, group, source, output = Mock(), Mock(), Mock(), Mock()
    group.GetAttrs.return_value = {'TOOLS_Name': 'CorridorKey', 'TOOLS_RegID': 'GroupOperator'}
    source.GetAttrs.return_value = {'TOOLS_Name': 'Source1', 'TOOLS_RegID': 'Loader'}
    output.GetAttrs.return_value = {'TOOLS_Name': 'MediaOut1', 'TOOLS_RegID': 'Saver'}
    group.GetInput.side_effect = {'InputSpace': 'REC709_COLORSPACE', 'InputGamma': 'LINEAR_GAMMA'}.get
    output.FindMainInput.return_value.GetConnectedOutput.return_value.GetTool.return_value = group
    comp.GetToolList.return_value = {1: group, 2: source, 3: output}
    return comp


class Item:
    def __init__(self, mode, text, valid=False, rename_failure=False):
        self.mode = mode
        self.comps = {'Original': text}
        self.active = 'Original'
        self.calls = []
        self.valid = valid
        self.rename_failure = rename_failure

    def GetFusionCompNameList(self):
        return list(self.comps)

    def GetFusionCompCount(self):
        return len(self.comps)

    def ExportFusionComp(self, path, index):
        self.calls.append(('export', index))
        Path(path).write_text(list(self.comps.values())[index - 1], encoding='utf-8')
        return True

    def LoadFusionCompByName(self, name):
        if name not in self.comps:
            return None
        self.active = name
        return good_comp()

    def ImportFusionComp(self, path):
        self.calls.append(('import', path))
        text = Path(path).read_text(encoding='utf-8')
        if self.mode == 'refuse' and text == 'bad':
            return None
        # Simulate a build that replaces candidate but appends rollback import.
        append = self.mode == 'append' or (self.mode == 'mixed' and text != 'bad')
        name = 'Added' + str(len(self.calls)) if append else self.active
        self.comps[name] = text
        self.active = name
        comp = good_comp()
        if not self.valid:
            comp.GetToolList.return_value = {}
        return comp

    def DeleteFusionCompByName(self, name):
        self.calls.append(('delete', name))
        del self.comps[name]
        return True

    def RenameFusionCompByName(self, old, new):
        self.calls.append(('rename', old, new))
        if self.rename_failure:
            return False
        if new in self.comps:
            return False
        self.comps[new] = self.comps.pop(old)
        self.active = new
        return True


class Setup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('single', ROOT / 'setup_single.py')
        cls.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.m)

    def fixture(self, source='Source1'):
        return ('Composition { Tools = ordered() { ' + source + ' = Loader { Inputs = {}, }, '
                'MediaOut1 = Saver { Inputs = { Input = Input { SourceOp = "' + source +
                '", Source = "Output", }, }, }, }, }')

    def test_inserts_one_current_group_and_connects_output(self):
        text = self.m.insert_group(self.fixture(), 'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA',
                                   (ROOT / 'CorridorKey.setting').read_text(encoding='utf-8'))
        self.assertEqual(text.count('CorridorKey = GroupOperator'), 1)
        self.assertIn('SourceOp = "Source1", Source = "Output"', text)
        self.assertIn('Value = FuID { "LINEAR_GAMMA" }', text)
        from comp_text import tool_block
        self.assertIn('SourceOp = "CorridorKey"', tool_block(text, 'MediaOut1'))
        self.assertIn('Source = "MainOutput1"', tool_block(text, 'MediaOut1'))
        self.assertIn('Temporal = InstanceInput', text)
        self.assertIn('Lookahead = InstanceInput', text)
        self.assertNotIn('RenderTemporal', text)
        self.assertNotIn('BTNCS_Execute', text)

    def test_existing_group_or_indirect_source_refuses(self):
        macro = (ROOT / 'CorridorKey.setting').read_text(encoding='utf-8')
        text = self.m.insert_group(self.fixture(), 'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA', macro)
        with self.assertRaisesRegex(ValueError, 'already'):
            self.m.insert_group(text, 'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA', macro)
        with self.assertRaisesRegex(ValueError, 'directly'):
            self.m.insert_group(self.fixture().replace('SourceOp = "Source1"', 'SourceOp = "Another"'),
                                'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA', macro)

    def test_invalid_colour_identifier_rejected(self):
        with self.assertRaises(ValueError):
            self.m.insert_group(self.fixture(), 'Source1', 'bad" }', 'LINEAR_GAMMA',
                                (ROOT / 'CorridorKey.setting').read_text(encoding='utf-8'))

    def test_failure_restores_composition_state_for_each_import_mode(self):
        for mode in ['append', 'replace', 'refuse', 'mixed']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                item = Item(mode, self.fixture())
                backup, new = Path(tmp) / 'original.comp', Path(tmp) / 'new.comp'
                new.write_text('bad')
                with self.assertRaisesRegex(RuntimeError, 'group|refused'):
                    self.m.import_group(item, new, backup, 'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA')
                self.assertEqual(item.comps, {'Original': self.fixture()})
                self.assertEqual(item.active, 'Original')
                self.assertEqual(item.calls[0], ('export', 1))
                self.assertEqual(backup.read_text(), self.fixture())

    def test_success_leaves_one_verified_active_composition(self):
        for mode in ['append', 'replace']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                item = Item(mode, self.fixture(), valid=True)
                backup, new = Path(tmp) / 'original.comp', Path(tmp) / 'new.comp'
                new.write_text('good')
                self.m.import_group(item, new, backup, 'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA')
                self.assertEqual(item.GetFusionCompCount(), 1)
                self.assertEqual(item.comps[item.active], 'good')
                self.assertEqual(backup.read_text(), self.fixture())

    def test_failed_rollback_rename_never_deletes_recoverable_compositions(self):
        with tempfile.TemporaryDirectory() as tmp:
            item = Item('mixed', self.fixture(), rename_failure=True)
            backup, new = Path(tmp) / 'original.comp', Path(tmp) / 'new.comp'
            new.write_text('bad')
            with self.assertRaisesRegex(RuntimeError, 'rollback not verified'):
                self.m.import_group(item, new, backup, 'Source1', 'REC709_COLORSPACE', 'LINEAR_GAMMA')
            self.assertIn('Original', item.comps)
            self.assertIn(self.fixture(), item.comps.values())
            self.assertFalse(any(call[0] == 'delete' for call in item.calls))


if __name__ == '__main__':
    unittest.main()
