from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from zoneinfo import ZoneInfo
import dream_staleness_check as watch

class WatchTests(unittest.TestCase):
    def test_current_nightly_not_retired_weekly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state';state.mkdir();(vault/'dreams').mkdir(parents=True)
            note=vault/'dreams/2026-10-31-Dream.md';note.write_text('actual output')
            now=datetime(2026,11,1,9,17,tzinfo=ZoneInfo('Europe/Copenhagen'));os.utime(note,(now.timestamp(),now.timestamp()))
            receipt={'state':'complete','finished_epoch':now.timestamp(),'note':'dreams/'+note.name,
                     'note_sha256':hashlib.sha256(note.read_bytes()).hexdigest(),'reporting':{'state':'remote-confirmed'}}
            (state/'latest.json').write_text(json.dumps(receipt))
            self.assertEqual(watch.assess(vault,state,now)['state'],'healthy')
            note.write_text('external change')
            self.assertIn('dream-output-revision-changed',watch.assess(vault,state,now)['findings'])
    def test_no_outputs_and_old_chain_are_not_green(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'state';state.mkdir()
            self.assertIn('nightly-dream-missing',watch.assess(root/'vault',state)['findings'])
            (state/'latest.json').write_text(json.dumps({'state':'degraded-reporting','finished_epoch':0,'reporting':{'state':'degraded'}}))
            result=watch.assess(root/'vault',state)
            self.assertIn('hygiene-chain-stale',result['findings'])
            self.assertIn('remote-reporting-degraded',result['findings'])

    def test_recent_historical_file_does_not_satisfy_expected_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state';state.mkdir();(vault/'dreams').mkdir(parents=True)
            (vault/'dreams/2026-10-20-Dream.md').write_text('recent mtime, wrong producer date')
            now=datetime(2026,11,1,9,17,tzinfo=ZoneInfo('Europe/Copenhagen'))
            self.assertIn('nightly-dream-missing',watch.assess(vault,state,now)['findings'])

    def test_same_day_verified_manual_run_satisfies_previous_deadline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state';state.mkdir();(vault/'dreams').mkdir(parents=True)
            note=vault/'dreams/2026-10-31-Dream.md';note.write_text('verified manual output')
            now=datetime(2026,10,31,17,0,tzinfo=ZoneInfo('Europe/Copenhagen'));os.utime(note,(now.timestamp(),now.timestamp()))
            (state/'latest.json').write_text(json.dumps({'state':'degraded-reporting','finished_epoch':now.timestamp(),
                'note':'dreams/'+note.name,'note_sha256':hashlib.sha256(note.read_bytes()).hexdigest(),'reporting':{'state':'degraded'}}))
            result=watch.assess(vault,state,now)
            self.assertEqual(result['note'],'dreams/'+note.name)
            self.assertEqual(result['findings'],['remote-reporting-degraded'])

if __name__=='__main__':unittest.main()
