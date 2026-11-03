import contextlib
import io
import json
from pathlib import Path
import runpy
import sys
from types import ModuleType
import unittest
from unittest.mock import patch

class WrapperTests(unittest.TestCase):
    def test_existing_overlap_wake_and_prompt_preserved(self):
        for wake in (False,True):
            with self.subTest(wake=wake):
                old=ModuleType('loki_job');new=ModuleType('auto_review')
                old.execute=lambda *_:print(json.dumps({'wakeAgent':wake,**({'prompt':'Existing overlap evidence only.'} if wake else {})}))
                new.cycle=lambda:{'state':'proposer-no-change-unreviewed','reviewed':0,'staged':0}
                out=io.StringIO()
                with patch.dict(sys.modules,{'loki_job':old,'auto_review':new}),contextlib.redirect_stdout(out),self.assertRaises(SystemExit) as stopped:
                    runpy.run_path(str(Path(__file__).parent/'volundr_review.py'),run_name='__main__')
                self.assertEqual(stopped.exception.code,0)
                result=json.loads(out.getvalue());self.assertEqual(result['wakeAgent'],wake)
                if wake:self.assertIn('Existing overlap evidence only.',result['prompt'])
                self.assertFalse(result['aar_cycle']['publication_authorized'])

    def test_actual_evidence_output_without_wake_flag_is_preserved(self):
        evidence={'local_work':{'conflict_count':1,'review_required':True},'consolidation':{'archive_count':0}}
        old=ModuleType('loki_job');new=ModuleType('auto_review')
        old.execute=lambda *_:print(json.dumps(evidence))
        new.cycle=lambda:{'state':'idle','reviewed':0,'staged':0}
        out=io.StringIO()
        with patch.dict(sys.modules,{'loki_job':old,'auto_review':new}),contextlib.redirect_stdout(out),self.assertRaises(SystemExit):
            runpy.run_path(str(Path(__file__).parent/'volundr_review.py'),run_name='__main__')
        result=json.loads(out.getvalue())
        self.assertNotIn('wakeAgent',result);self.assertEqual(result['local_work'],evidence['local_work'])
        self.assertTrue(result['aar_cycle']['overlap_review_required'])

if __name__=='__main__':unittest.main()
