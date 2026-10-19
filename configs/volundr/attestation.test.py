import copy
import hashlib
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import attestation


class AttestationTests(unittest.TestCase):
    def test_signature_binds_target_bundle_scope_and_controller(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);key=root/'key'
            subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(key)],check=True)
            allowed=root/'allowed_signers';allowed.write_text('volundr-controller '+key.with_suffix('.pub').read_text())
            bundle=root/'bundle';bundle.write_bytes(b'inert bundle fixture')
            item={'target':'a'*40,'config_revision':'b'*40,'bundle_sha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'created_at':time.time()}
            proof=attestation.sign(item,bundle,key)
            attestation.verify(item,bundle,proof,allowed)
            for field,value in [('target','c'*40),('bundle_sha256','d'*64),('config_revision','e'*40)]:
                altered={**item,field:value}
                with self.assertRaises(RuntimeError):attestation.verify(altered,bundle,proof,allowed)
            altered=copy.deepcopy(proof);altered['receipt']=altered['receipt'].replace('git-history-and-tree','tree-only')
            with self.assertRaises(RuntimeError):attestation.verify(item,bundle,altered,allowed)
            altered=copy.deepcopy(proof);altered['signature']=altered['signature'].replace('A','B',1)
            with self.assertRaises(RuntimeError):attestation.verify(item,bundle,altered,allowed)
            bundle.write_bytes(b'tampered')
            with self.assertRaises(RuntimeError):attestation.verify(item,bundle,proof,allowed)


if __name__=='__main__':unittest.main()
