import contextlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from learning.deploy import deploy


class DeployTests(unittest.TestCase):
    def test_selected_conflict_preserved_then_scoped_install_keeps_unrelated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);config=root/'config';config.mkdir()
            subprocess.run(['git','init','-q',str(config)],check=True)
            subprocess.run(['git','-C',str(config),'config','user.email','fixture@example.invalid'],check=True)
            subprocess.run(['git','-C',str(config),'config','user.name','Fixture'],check=True)
            target=config/'configs/pi/extensions/muninn.ts';target.parent.mkdir(parents=True);target.write_text('old')
            unrelated=config/'unrelated';unrelated.write_text('original')
            subprocess.run(['git','-C',str(config),'add','.'],check=True)
            subprocess.run(['git','-C',str(config),'commit','-qm','fixture'],check=True)
            staged=root/'staged';p=staged/'configs/pi/extensions/muninn.ts';p.parent.mkdir(parents=True);p.write_text('new')
            package=staged/'configs/volundr/learning';package.mkdir(parents=True)
            (package/'cron_entry.py').write_text('# fixture')
            (package.parent/'aar_learning.py').write_text('# adapter')
            target.write_text('another worker');unrelated.write_text('pending')
            with self.assertRaisesRegex(ValueError,'pending edits'):deploy(staged,'a'*40,root)
            self.assertEqual(target.read_text(),'another worker')
            target.write_text('old')
            with contextlib.redirect_stdout(io.StringIO()):deploy(staged,'a'*40,root)
            self.assertEqual(target.read_text(),'new');self.assertEqual(unrelated.read_text(),'pending')
            self.assertEqual((root/'.hermes/scripts/aar_distill_nightly.py').read_text(),'# fixture')
            self.assertTrue(list((root/'.hermes/volundr-nightly/deployments').glob('*/receipt.json')))


if __name__=='__main__':unittest.main()
