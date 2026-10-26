#!/usr/bin/env python3
"""Local disposable socket tests; no router, SSH or service changes."""
import asyncio
import importlib.machinery
import importlib.util
from pathlib import Path
import tempfile
import unittest

loader = importlib.machinery.SourceFileLoader('hbit_relay', str(Path(__file__).resolve().parents[1] / 'scripts/hbit-lan-relay'))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class RelayTests(unittest.IsolatedAsyncioTestCase):
    async def test_bytes_limits_disconnects_and_idle_cleanup(self):
        async def echo(reader, writer):
            try:
                while data := await reader.read(8192):
                    writer.write(data)
                    await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'public.sock')
            backend = await asyncio.start_unix_server(echo, path)
            relay = module.Relay(path, limit=1, idle=0.15, lifetime=2)
            server = await asyncio.start_server(relay.handle, '127.0.0.1', 0)
            port = server.sockets[0].getsockname()[1]
            try:
                reader, writer = await asyncio.open_connection('127.0.0.1', port)
                writer.write(b'SSH-2.0-test\r\n'); await writer.drain()
                self.assertEqual(await asyncio.wait_for(reader.readexactly(14), 1), b'SSH-2.0-test\r\n')
                other, other_writer = await asyncio.open_connection('127.0.0.1', port)
                self.assertEqual(await asyncio.wait_for(other.read(), 1), b'')
                other_writer.close(); await other_writer.wait_closed()
                self.assertEqual(await asyncio.wait_for(reader.read(), 1), b'')
                writer.close(); await writer.wait_closed()
                await asyncio.sleep(0.02)
                self.assertEqual(relay.active, 0)
                again, again_writer = await asyncio.open_connection('127.0.0.1', port)
                again_writer.write(b'new'); await again_writer.drain()
                self.assertEqual(await asyncio.wait_for(again.readexactly(3), 1), b'new')
                again_writer.close(); await again_writer.wait_closed()
            finally:
                server.close(); backend.close()
                await server.wait_closed(); await backend.wait_closed()
                await asyncio.sleep(0.2)

    def test_setup_plan_is_read_only_and_names_exact_scoped_endpoint(self):
        import json
        import subprocess
        import sys
        script = Path(__file__).resolve().parents[1] / 'scripts/hbit-lan-setup'
        result = subprocess.run([sys.executable, str(script), '--plan'], check=True, capture_output=True, text=True)
        plan = json.loads(result.stdout)
        self.assertEqual(plan['listener'], '192.168.86.51:2223')
        self.assertEqual(plan['target'], module.SOCKET)
        self.assertIn('2222 -> 192.168.1.16:2222', plan['outer_router'])
        self.assertIn('2222 -> 192.168.86.51:2223', plan['google_router'])
        self.assertIn('Funnel or Serve', plan['does_not_change'])

    def test_only_fixed_public_backend_can_be_approved(self):
        info = {'status': {'state': 'running'}, 'configuration': {
            'id': 'hbit-public', 'image': {'descriptor': {'digest': module.IMAGE_DIGEST}},
            'initProcess': {'executable': '/hbit', 'arguments': ['-listen','unix:/run/hbit/ssh.sock','-public-menu'], 'environment': [], 'user': {'raw': {'userString': '10001:10001'}}},
            'capAdd': [], 'capDrop': ['ALL'], 'networks': [], 'publishedPorts': [], 'ssh': False,
            'dns': {'nameservers': []}, 'maskedPaths': ['/dev/kmsg'],
            'resources': {'cpus': 1, 'memoryInBytes': 268435456},
            'mounts': [{'destination': '/keys', 'options': ['ro'], 'type': {'volume': {'name': 'hbit-public-keys'}}}],
            'publishedSockets': [{'containerPath': '/run/hbit/ssh.sock', 'hostPath': module.SOCKET}],
        }}
        module.validate(info)
        import copy
        for field, value in [('networks', [{'network':'hbit-private'}]), ('publishedPorts',[{'hostPort':22}]), ('id','hbit'), ('capAdd',['ALL']), ('mounts',[])]:
            changed=copy.deepcopy(info); changed['configuration'][field]=value
            with self.subTest(field=field), self.assertRaises(ValueError): module.validate(changed)
        changed=copy.deepcopy(info);changed['configuration']['image']['descriptor']['digest']='unknown'
        with self.assertRaises(ValueError):module.validate(changed)


if __name__ == '__main__':
    unittest.main()
