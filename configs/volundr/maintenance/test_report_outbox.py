import json
from pathlib import Path
import tempfile
import unittest
import report_outbox as outbox

class ReportTests(unittest.TestCase):
    row={'night':'2026-10-31','kind':'vault','title':'fixture','summary':'fixture','details':{}}
    def test_management_token_durable_degraded_idempotent_bounded_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);env=root/'env';env.write_text('SUPABASE_URL=https://example.invalid\nSUPABASE_SECRET_KEY=sbp_fixture_private\n')
            def forbidden(*_):self.fail('PAT must not reach data API')
            a=outbox.run(self.row,state=root/'state',env_file=env,sender=forbidden,now=1000)
            b=outbox.run(self.row,state=root/'state',env_file=env,sender=forbidden,now=1001)
            self.assertEqual(a['pending'],1);self.assertEqual(a['state'],'degraded')
            self.assertEqual(b['attempted'],0)
            self.assertNotIn('sbp_fixture_private',''.join(p.read_text() for p in (root/'state').glob('*.json')))
            c=outbox.run(state=root/'state',env_file=env,sender=forbidden,now=1301)
            self.assertEqual(c['attempted'],1)
    def test_valid_key_confirmed_delivery_and_repeat_no_send(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);env=root/'env';env.write_text('SUPABASE_URL=https://example.invalid\nSUPABASE_SECRET_KEY=sb_secret_fixture\n')
            a=outbox.run(self.row,state=root/'state',env_file=env,sender=lambda *_:'confirmed-row',now=1000)
            self.assertEqual(a['state'],'remote-confirmed')
            b=outbox.run(self.row,state=root/'state',env_file=env,sender=lambda *_:self.fail('duplicate'),now=1001)
            self.assertEqual(b['attempted'],0)
    def test_sender_failure_never_false_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);env=root/'env';env.write_text('SUPABASE_URL=https://example.invalid\nSUPABASE_SECRET_KEY=sb_secret_fixture\n')
            def fail(*_):raise RuntimeError('secret response')
            a=outbox.run(self.row,state=root/'state',env_file=env,sender=fail,now=1000)
            self.assertEqual(a['state'],'degraded');self.assertEqual(a['pending'],1)
            self.assertNotIn('secret response',''.join(p.read_text() for p in (root/'state').glob('*.json')))

if __name__=='__main__':unittest.main()
