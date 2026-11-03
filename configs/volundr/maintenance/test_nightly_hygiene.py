import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import nightly_hygiene as hygiene

class HygieneTests(unittest.TestCase):
    def test_inventory_never_reads_private_and_bounds(self):
        with tempfile.TemporaryDirectory() as tmp:
            v=Path(tmp);(v/'personal-notes').mkdir();(v/'personal-notes/private.md').write_text('private')
            (v/'tech').mkdir();(v/'tech/note.md').write_text('no yaml')
            r=hygiene.inventory(v);self.assertEqual(r['notes'],1);self.assertEqual(r['missing_frontmatter'],1)
            with self.assertRaises(ValueError):hygiene.inventory(v,limit=0)
    def test_guarded_filing_readback_and_degraded_reporting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';vault.mkdir();state=root/'state';calls=[]
            def api(name,args):
                calls.append(name)
                if name=='vault_read':
                    p=vault/args['filename']
                    return {'sha256':hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else 'f'*64}
                if name=='vault_file_note':
                    p=vault/args['filename'];p.parent.mkdir(exist_ok=True);p.write_text(args['content'])
                    (vault/'dreams/_INDEX.md').write_text(args['index_entry']+'\n')
                    return {'filing':'complete','status':'success'}
                self.fail(name)
            result=hygiene.execute(vault=vault,state=state,api=api,reporter=lambda _: {'state':'degraded','pending':1})
            self.assertEqual(result['state'],'degraded-reporting');self.assertTrue(result['note_sha256'])
            self.assertIn('vault_file_note',calls);self.assertFalse(result['semantic_review'])
            self.assertEqual(calls[-1],'vault_read')
            self.assertTrue(result['index_sha256'])
    def test_filing_failure_is_failed_not_scheduler_green(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);v=root/'vault';v.mkdir()
            def api(name,args):
                if name=='vault_read':return {'sha256':'f'*64}
                return {'filing':'pending'}
            r=hygiene.execute(vault=v,state=root/'state',api=api,reporter=lambda _:self.fail('report after failure'))
            self.assertEqual(r['state'],'failed');self.assertNotIn('note_sha256',r)

    def test_rewrite_without_archive_receipt_is_preservation_pending(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);v=root/'vault';(v/'dreams').mkdir(parents=True)
            now=datetime.now(ZoneInfo('Europe/Copenhagen'))
            p=v/f'dreams/{now.date()}-Dream.md';p.write_text('producer: bounded-nightly-hygiene-v1\nold output\n')
            def api(name,args):
                if name=='vault_read':return {'sha256':'f'*64}
                if name=='vault_write':return {'status':'success'}
                self.fail('must not file without archive verification')
            r=hygiene.execute(vault=v,state=root/'state',api=api,now=now,reporter=lambda _:self.fail('report after failure'))
            self.assertEqual(r['state'],'preservation-pending')
            self.assertNotIn('note_sha256',r)

    def test_archive_verified_mismatch_and_filing_conflict_preserve_intermediate(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        for mode in ('success','archive-mismatch','index-conflict','index-readback-mismatch'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);v=root/'vault';(v/'dreams').mkdir(parents=True)
                now=datetime(2026,10,31,23,40,tzinfo=ZoneInfo('Europe/Copenhagen'))
                p=v/'dreams/2026-10-31-Dream.md';old=b'producer: bounded-nightly-hygiene-v1\nold output\n';p.write_bytes(old)
                digest=hashlib.sha256(old).hexdigest();calls=[]
                def api(name,args):
                    calls.append(name)
                    if name=='vault_read':
                        target=v/args['filename']
                        return {'sha256':hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else 'f'*64}
                    if name=='vault_write':
                        self.assertEqual(args['expected_revision'],digest);p.write_text(args['content'])
                        return {'status':'success','archive':{'archive_id':'fixture-archive'}}
                    if name=='vault_archive_read':
                        self.assertEqual(args['archive_id'],'fixture-archive')
                        return {'sha256':digest if mode!='archive-mismatch' else 'a'*64}
                    if name=='vault_file_note':
                        if mode=='index-conflict':return {'filing':'pending','transaction_id':'fixture'}
                        (v/'dreams/_INDEX.md').write_text(args['index_entry']+'\n' if mode!='index-readback-mismatch' else 'wrong entry\n')
                        return {'filing':'complete'}
                    self.fail(name)
                r=hygiene.execute(vault=v,state=root/'state',api=api,now=now,reporter=lambda _:{'state':'degraded'})
                if mode=='success':
                    self.assertEqual(r['state'],'degraded-reporting');self.assertTrue(r['index_sha256'])
                else:
                    self.assertEqual(r['state'],'failed');self.assertNotIn('note_sha256',r)
                    # A verified archival rewrite may precede a failed filing.
                    self.assertNotEqual(p.read_bytes(),old)
                self.assertIn('vault_archive_read',calls)
                if mode=='archive-mismatch':self.assertNotIn('vault_file_note',calls)

if __name__=='__main__':unittest.main()
