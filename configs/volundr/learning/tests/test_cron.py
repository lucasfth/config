"""Cron consumer honors partial failure and keeps all raw evidence private."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from learning import cron


class CronTests(unittest.TestCase):
    def test_partial_failure_redacts_paths_and_keeps_private_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);config=root/'config.json';state=root/'state'
            config.write_text(json.dumps({'enabled':True,'state':str(state),'archive_enabled':False}))
            result={'processed':['PRIVATE_ID'],'skipped':[{'source':'PRIVATE_NOTE'}],
                'errors':[{'source':'PRIVATE_FAILED_SOURCE','error':'PRIVATE_FAILURE'}],
                'status':'partial-failure','guidance_applied':False,'skills_changed':False}
            with patch.object(cron.extract,'nightly',return_value=result), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cron.run(config),1)
            self.assertNotIn('PRIVATE',output.getvalue());self.assertNotIn(str(root),output.getvalue())
            self.assertEqual(json.loads(output.getvalue())['errors'],1)
            receipt=json.loads(next((state/'runs').glob('*.json')).read_text())
            self.assertEqual(receipt['result'],result)
            self.assertEqual(receipt['status'],'partial-failure')

    def test_unexpected_exception_reports_type_only_and_disabled_never_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);config=root/'config.json';state=root/'state'
            config.write_text(json.dumps({'enabled':True,'state':str(state)}))
            with patch.object(cron.extract,'nightly',side_effect=ValueError('PRIVATE_SECRET')), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cron.run(config),1)
            self.assertNotIn('PRIVATE_SECRET',output.getvalue())
            self.assertEqual(json.loads(output.getvalue())['error_type'],'ValueError')
            config.write_text('{"enabled":false}')
            with patch.object(cron.extract,'nightly') as call, contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cron.run(config),0)
            call.assert_not_called();self.assertEqual(json.loads(output.getvalue()),{'state':'disabled'})

    def test_boundary_violation_is_failed_not_reported_as_learning(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);config=root/'config.json';config.write_text(json.dumps({'enabled':True,'state':str(root/'state')}))
            result={'processed':[],'errors':[],'skipped':[],'guidance_applied':True,'skills_changed':False}
            with patch.object(cron.extract,'nightly',return_value=result), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cron.run(config),1)
            self.assertEqual(json.loads(output.getvalue())['state'],'boundary-violation')


if __name__ == '__main__': unittest.main()
