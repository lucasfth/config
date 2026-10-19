"""Run on Loki against a private copied profile, never live cron storage."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import install_loki
import dream_guard


@unittest.skipUnless(sys.platform == 'android', 'Requires Loki runtime and private source fixture')
class InstallTests(unittest.TestCase):
    def test_copy_install_rollback_and_managed_cron_stub(self):
        from cron import jobs
        from cron.scheduler_script import _run_job_script, _script_argv
        live = Path(os.environ['HERMES_HOME'])
        deployment = json.loads((live / 'volundr-nightly/deployment.json').read_text())
        original_job = deployment['original_dream_job']
        original = (Path(deployment['dream_guard']['backup']) / 'dream_obsidian.py').read_bytes()
        live_script_hash = dream_guard.snapshot(live / 'scripts/dream_obsidian.py')
        live_jobs_hash = dream_guard.snapshot(live / 'cron/jobs.json')
        with tempfile.TemporaryDirectory(dir=live / 'cache/scratch', prefix='volundr-install-test-') as directory:
            root = Path(directory);home = root / '.hermes';code = root / 'code';code.mkdir()
            (home / 'scripts').mkdir(parents=True);(home / 'cron').mkdir()
            shutil.copy2(live / 'cron/jobs.json', home / 'cron/jobs.json')
            with jobs.use_cron_store(home):
                jobs.update_job(original_job['id'], {'script': original_job['script']})
            (home / 'scripts/dream_obsidian.py').write_bytes(original)
            vault = root / 'loki-memory';(vault / 'dreams').mkdir(parents=True)
            (vault / 'dreams/example.md').write_text('untouched')
            (vault / '.dream_state.json').write_text('{"fixture":true}')
            settings = {'repo': str(Path.home() / 'volundr'), 'home': str(home),
                'state': str(home / 'volundr-nightly/state'), 'inbox': str(root / 'inbox'),
                'gitleaks': str(Path.home() / '.local/bin/gitleaks'),
                'history_allowed_signers': str(Path.home() / '.hermes/volundr-nightly/history_allowed_signers'),
                'path': os.environ['PATH'], 'dream_script': str(home / 'scripts/dream_obsidian.py'),
                'dream_job_id': original_job['id'], 'delivery_target': 'local'}
            (code / 'settings.json').write_text(json.dumps(settings))
            with jobs.use_cron_store(home), patch.object(install_loki, 'HERE', code), \
                    patch.object(dream_guard.Path, 'home', return_value=root):
                real_install = dream_guard.install
                def failed_install(*args):
                    real_install(*args)
                    raise OSError('after script replacement')
                with patch.object(install_loki.dream_guard, 'install', side_effect=failed_install), \
                        self.assertRaises(OSError):
                    install_loki.install(home)
                self.assertEqual((home / 'scripts/dream_obsidian.py').read_bytes(), original)
                self.assertEqual(jobs.get_job(settings['dream_job_id'])['script'], 'dream_obsidian.py')
                real_create = jobs.create_job
                calls = []
                def fail_second_create(*args, **kwargs):
                    if calls:
                        raise OSError('after first create')
                    job = real_create(*args, **kwargs);calls.append(job['id']);return job
                with patch.object(jobs, 'create_job', side_effect=fail_second_create), self.assertRaises(OSError):
                    install_loki.install(home)
                receipt = json.loads((home / 'volundr-nightly/deployment.json').read_text())
                self.assertEqual(receipt['state'], 'rolled-back')
                self.assertFalse(jobs.get_job(calls[0])['enabled'])
                self.assertEqual((home / 'scripts/dream_obsidian.py').read_bytes(), original)
                self.assertEqual(jobs.get_job(settings['dream_job_id'])['script'], 'dream_obsidian.py')
                for action in ['sync', 'review', 'dream']:
                    self.assertFalse((home / 'scripts' / ('volundr_' + action + '.py')).exists())

                # All following mutation is confined to this copied cron store.
                result = install_loki.install(home)
                self.assertEqual(result['state'], 'installed')
                review = next(j for j in result['jobs'] if j['name'] == 'Volundr review')
                self.assertEqual(review['enabled_toolsets'], [])
                self.assertFalse(review['no_agent'])
                self.assertEqual(review['deliver'], settings['delivery_target'])
            # Exercise all three entrypoints through Hermes' selected dependency interpreter.
            for name in ['nightly.py', 'loki_job.py', 'dream_guard.py', 'secret_gate.py', 'gitleaks.toml', 'attestation.py']:
                shutil.copy2(HERE / name, code / name)
            marker = root / 'stub-marker';stub = root / 'dream_stub.py'
            stub.write_text('from pathlib import Path\nPath(' + repr(str(marker)) + ').write_text("stub")\n')
            settings['dream_script'] = str(stub);(code / 'settings.json').write_text(json.dumps(settings))
            before = dream_guard.snapshot(vault)
            with patch.dict(os.environ, {'HERMES_HOME': str(home)}):
                for action in ['sync', 'review', 'dream']:
                    p = home / 'scripts' / ('volundr_' + action + '.py')
                    argv, _, error = _script_argv(p)
                    self.assertIsNone(error)
                    print('MANAGED_INTERPRETER', argv[:2])
                    ok, output = _run_job_script(p.name, workdir=str(root))
                    self.assertTrue(ok, output)
            self.assertEqual(marker.read_text(), 'stub')
            self.assertEqual(dream_guard.snapshot(vault), before)
        self.assertEqual(dream_guard.snapshot(live / 'cron/jobs.json'), live_jobs_hash)
        self.assertEqual(dream_guard.snapshot(live / 'scripts/dream_obsidian.py'), live_script_hash)


if __name__ == '__main__':
    unittest.main()
