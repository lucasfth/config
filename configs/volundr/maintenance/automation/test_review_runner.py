import tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
import review_runner as rr

class RunnerTests(unittest.TestCase):
 def setup_files(self,d):
  ps=[Path(d)/x for x in ('c','b','e')]
  for p in ps:p.write_text('evidence\n')
  return ps
 def test_authenticated_child_output_admits_verdict(self):
  with tempfile.TemporaryDirectory() as d:
   c,b,e=self.setup_files(d)
   def child(argv,**kw):
    self.assertEqual(argv[:3],['/bin/zsh','-ic','exec /Users/gimle/config/scripts/pi-native "$@"']); self.assertIn('--no-tools',argv)
    return SimpleNamespace(stdout='Evidence cited\nMUNINN_REVIEW_VERDICT=APPROVE\n',stderr='',returncode=0,pid=123)
   r=rr.review(c,b,e,Path(d)/'sessions',popen=child)
   self.assertEqual(r['status'],'approved'); self.assertEqual(r['pid'],123)
   self.assertEqual(len(r['stdout_sha256']),64)
 def test_untrusted_caller_cannot_supply_approval_or_command(self):
  self.assertNotIn('command',rr.main.__code__.co_names)
  self.assertNotIn('--approve',rr.SYSTEM)
 def test_parse_failure_and_nonzero_fail_closed(self):
  with tempfile.TemporaryDirectory() as d:
   c,b,e=self.setup_files(d)
   for out,code in [('APPROVE',0),('MUNINN_REVIEW_VERDICT=APPROVE',1)]:
    r=rr.review(c,b,e,Path(d)/'s',popen=lambda *a,**k:SimpleNamespace(stdout=out,stderr='',returncode=code,pid=1))
    self.assertEqual(r['status'],'unverified')
 def test_hash_change_fails_closed(self):
  with tempfile.TemporaryDirectory() as d:
   c,b,e=self.setup_files(d)
   def child(*a,**k):
    c.write_text('changed')
    return SimpleNamespace(stdout='MUNINN_REVIEW_VERDICT=APPROVE',stderr='',returncode=0,pid=2)
   self.assertEqual(rr.review(c,b,e,Path(d)/'s',popen=child)['reason'],'input-changed')
 def test_launch_failure_fails_closed(self):
  with tempfile.TemporaryDirectory() as d:
   c,b,e=self.setup_files(d)
   r=rr.review(c,b,e,Path(d)/'s',popen=lambda *a,**k:(_ for _ in ()).throw(OSError()))
   self.assertEqual(r['status'],'unverified')
if __name__=='__main__':unittest.main()
