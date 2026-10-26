#!/usr/bin/env python3
"""Fake-boundary tests: no container daemon, launchd or SSH is contacted."""
import copy
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest

loader = importlib.machinery.SourceFileLoader('hbit_startup', str(Path(__file__).resolve().parents[1] / 'scripts/hbit-ensure-running'))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


def fixture(state='running'):
    return {'configuration': {
        'id': 'hbit', 'image': {'descriptor': {'digest': module.IMAGE_DIGEST}},
        'initProcess': {'user': {'raw': {'userString': '10001:10001'}}, 'executable': '/hbit', 'arguments': [], 'environment': []},
        'readOnly': True, 'ssh': False, 'capAdd': [], 'capDrop': ['ALL'],
        'maskedPaths': ['/dev/kmsg'], 'dns': {'nameservers': []},
        'resources': {'cpus': 1, 'memoryInBytes': 268435456},
        'publishedPorts': [{'hostAddress': '127.0.0.1', 'hostPort': 2222, 'containerPort': 2222, 'count': 1, 'proto': 'tcp'}],
        'publishedSockets': [], 'networks': [{'network': 'hbit-private'}],
        'mounts': [{'destination': '/keys', 'options': ['ro'], 'type': {'volume': {'name': 'hbit-keys'}}}],
    }, 'status': {'state': state}}


class StartupTests(unittest.TestCase):
    def test_running_does_not_restart(self):
        calls=[]
        module.ensure(lambda: fixture(), calls.append)
        self.assertEqual(calls, [])

    def test_stopped_starts_only_existing_hbit_and_checks_after(self):
        calls=[]
        states=iter([fixture('stopped'), fixture()])
        module.ensure(lambda: next(states), calls.append)
        self.assertEqual(calls, [['start', 'hbit']])

    def test_failed_start_is_not_success(self):
        with self.assertRaisesRegex(ValueError, 'not running'):
            module.ensure(lambda: fixture('stopped'), lambda _: None)

    def test_changed_boundaries_never_start(self):
        changes=[
            lambda c: c.update(readOnly=False),
            lambda c: c.update(ssh=True),
            lambda c: c.update(capAdd=['NET_ADMIN']),
            lambda c: c.update(capDrop=[]),
            lambda c: c.update(maskedPaths=[]),
            lambda c: c.update(dns={'nameservers': ['1.1.1.1']}),
            lambda c: c['initProcess']['user']['raw'].update(userString='0:0'),
            lambda c: c['initProcess'].update(arguments=['-listen', ':22']),
            lambda c: c['initProcess'].update(environment=['LD_PRELOAD=/evil']),
            lambda c: c['image']['descriptor'].update(digest='sha256:changed'),
            lambda c: c['publishedPorts'][0].update(hostAddress='0.0.0.0'),
            lambda c: c.update(publishedSockets=[{'path':'/host'}]),
            lambda c: c['networks'][0].update(network='default'),
            lambda c: c['mounts'][0].update(options=['rw']),
            lambda c: c['mounts'].append({'destination':'/home'}),
            lambda c: c['resources'].update(cpus=4),
        ]
        for change in changes:
            with self.subTest(change=change):
                info=fixture('stopped');change(info['configuration']);calls=[]
                with self.assertRaises(ValueError):module.ensure(lambda: info, calls.append)
                self.assertEqual(calls, [])

    def test_missing_container_is_not_created(self):
        def missing():raise RuntimeError('not found')
        calls=[]
        with self.assertRaises(RuntimeError):module.ensure(missing,calls.append)
        self.assertEqual(calls, [])

    def test_transition_is_not_interrupted(self):
        calls=[]
        with self.assertRaisesRegex(ValueError, 'Unexpected container state'):
            module.ensure(lambda: fixture('starting'),calls.append)
        self.assertEqual(calls, [])


if __name__ == '__main__':unittest.main()
