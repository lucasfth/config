#!/usr/bin/env python3
"""Local contract checks; deliberately never opens SSH."""
import importlib.util
import importlib.machinery
import json
import pathlib
import subprocess
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent
HELPER = ROOT.parent / 'scripts' / 'sigyn-chat'
spec = importlib.util.spec_from_loader('helper', importlib.machinery.SourceFileLoader('helper', str(HELPER)))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

class HelperTests(unittest.TestCase):
    def response(self, **changes):
        data = dict(model='bonsai-2-2b-ptq1', adapter='uncensored-research-scale-1', text='Hello.',
                    finish_reason='stop', prompt_tokens=18, generated_tokens=2,
                    prefill_seconds=1.0, generation_seconds=0.5)
        data.update(changes)
        return json.dumps(data).encode()

    def test_leak_is_error_not_stripped(self):
        for text in ['{}\n</think>\n{}', '<think>hidden', '<|im_start|>system']:
            with self.assertRaises(helper.RequestError):
                helper.validate_response(self.response(text=text))

    def test_valid_response(self):
        self.assertEqual(helper.validate_response(self.response())['text'], 'Hello.')

    def test_wrong_model_and_malformed_response(self):
        for data in [b'not json', b'[]', b'NaN', self.response(adapter='off'),
                     self.response(text=''), self.response(generated_tokens=True),
                     self.response(prompt_tokens=449), self.response(generation_seconds=float('nan'))]:
            with self.assertRaises(helper.RequestError): helper.validate_response(data)

    def test_reject_truncated_response(self):
        with self.assertRaises(helper.RequestError):
            helper.validate_response(self.response(finish_reason='length'))

    def test_prompt_boundary(self):
        for raw in [b'', b'\xff', b'a'*2049, b'<|im_start|>', b'x\x00', b'<think>']:
            with self.assertRaises(helper.RequestError): helper.encode_request(raw)
        self.assertEqual(json.loads(helper.encode_request('Hello café'.encode())), {'prompt':'Hello café'})

    def test_error_does_not_echo_input(self):
        canary = 'PRIVATE_CANARY_30f632'
        p = subprocess.run(['python3', str(HELPER)], input=(canary+'\x00').encode(), capture_output=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertNotIn(canary.encode(), p.stdout+p.stderr)

    def test_prompt_not_in_command(self):
        for direct in (True, False):
            cmd = helper.ssh_command(direct)
            self.assertNotIn('prompt', ' '.join(cmd))
            self.assertIn('StrictHostKeyChecking=yes', ' '.join(cmd))
            self.assertNotIn('root', ' '.join(cmd))

class TransportTests(unittest.TestCase):
    response = HelperTests.response
    def invoke_fake(self, stdout, stderr, rc=0):
        # Real local pipes exercise the transport loop, but never launch SSH.
        popen = subprocess.Popen
        code = 'import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write(%r); sys.stderr.buffer.write(%r); sys.exit(%d)' % (stdout, stderr, rc)
        def launch(*args, **kwargs):
            return popen(['python3', '-c', code], **kwargs)
        with mock.patch.object(helper.subprocess, 'Popen', side_effect=launch):
            return helper.invoke(helper.encode_request(b'Hello'), direct=True)

    def test_transport_success(self):
        data = self.invoke_fake(self.response(), b'GUARD exit=0 reason=none peak_rss_kib=450000 lowest_available_mib=400 sampled_seconds=5\n')
        self.assertEqual(data['text'], 'Hello.')

    def test_transport_rejects_unexpected_receipt(self):
        for stderr in [b'', b'PRIVATE_BACKEND_CANARY', b'GUARD exit=0 reason=none peak_rss_kib=800000 lowest_available_mib=400 sampled_seconds=5\n']:
            with self.assertRaises(helper.RequestError):
                self.invoke_fake(self.response(), stderr)

    def test_transport_bounded_streams(self):
        for stdout, stderr in [(b'x'*20000, b''), (b'', b'x'*6000)]:
            with self.assertRaises(helper.RequestError): self.invoke_fake(stdout, stderr)

    def test_transport_diagnostics_are_generic(self):
        for rc, category in [(24, 'busy'), (23, 'guard_or_backend_failed'), (255, 'unavailable')]:
            with self.assertRaisesRegex(helper.RequestError, '^'+category+'$'):
                self.invoke_fake(b'', b'PRIVATE_BACKEND_CANARY', rc)

    def test_timeout_cleans_owned_process(self):
        popen = subprocess.Popen
        children = []
        def launch(*args, **kwargs):
            p = popen(['python3', '-c', 'import sys,time; sys.stdin.buffer.read(); time.sleep(10)'], **kwargs)
            children.append(p)
            return p
        with mock.patch.object(helper.subprocess, 'Popen', side_effect=launch), mock.patch.object(helper.time, 'monotonic', side_effect=[0, 146]):
            with self.assertRaisesRegex(helper.RequestError, '^timeout$'):
                helper.invoke(helper.encode_request(b'Hello'))
        self.assertIsNotNone(children[0].poll())

    def test_cleanup_term_then_kill(self):
        proc = mock.Mock(pid=98765)
        proc.poll.return_value = None
        proc.wait.side_effect = [subprocess.TimeoutExpired('fake', 3), 0]
        with mock.patch.object(helper.os, 'killpg') as kill:
            helper.stop_owned(proc)
        self.assertEqual(kill.call_args_list, [mock.call(98765, helper.signal.SIGTERM), mock.call(98765, helper.signal.SIGKILL)])

    def test_keyboard_interrupt_cleans_owned_process(self):
        popen = subprocess.Popen
        children = []
        def launch(*args, **kwargs):
            p = popen(['python3', '-c', 'import sys,time; sys.stdin.buffer.read(); time.sleep(10)'], **kwargs)
            children.append(p)
            return p
        with mock.patch.object(helper.subprocess, 'Popen', side_effect=launch), mock.patch.object(helper.selectors.DefaultSelector, 'select', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt): helper.invoke(helper.encode_request(b'Hello'))
        self.assertIsNotNone(children[0].poll())

class SchemaBoundaryTests(unittest.TestCase):
    response = HelperTests.response

    def test_invalid_schema_boundaries(self):
        good = json.loads(self.response())
        invalid = [b'\xff', b'{"text":"\\ud800"}', b'{' + self.response()[1:-1] + b',"text":"duplicate"}', b'x'*16385]
        for changes in [dict(model='wrong'),dict(finish_reason='bad'),dict(prompt_tokens=0),
                        dict(prompt_tokens=1.5),dict(generated_tokens=65),dict(prefill_seconds=-1),
                        dict(generation_seconds=121),dict(text='x'*8193),dict(text='\ud800')]:
            invalid.append(self.response(**changes))
        for obj in [{**good, 'extra':True}, {k:v for k,v in good.items() if k!='text'}]:
            invalid.append(json.dumps(obj).encode())
        for data in invalid:
            with self.subTest(data=data[:80]), self.assertRaises(helper.RequestError): helper.validate_response(data)

    def test_valid_boundaries(self):
        for prompt_tokens in (1, 448):
            for generated_tokens in (1, 64):
                self.assertEqual(helper.validate_response(self.response(prompt_tokens=prompt_tokens, generated_tokens=generated_tokens, prefill_seconds=0, generation_seconds=120))['text'], 'Hello.')



if __name__ == '__main__': unittest.main()