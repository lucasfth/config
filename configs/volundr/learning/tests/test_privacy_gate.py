"""Deterministic checks for the write-time privacy gate."""
import unittest

from learning import privacy_gate


class PrivacyGateTests(unittest.TestCase):
    def test_each_rule_fires_on_its_own_sample(self):
        samples = {
            'openai-style-key': 'key was sk-AbCdEfGh12345678xy and it worked',
            "github-token": 'token ghp_0123456789abcdefABCDEF12 in the runner log',
            'slack-token': 'webhook xoxb-1234-5678-90ab-cdef0123post',
            'bearer-token': 'curl -H "Authorization: Bearer abcdef0123456789ABCDEF01234567"',
            'key-assignment': 'config said api_key: a1b2c3d4e5f6g7h890ijkl for the call',
            'hex-basic-auth-pair': 'basic auth 6b21c5b3b5d1e8f4a9c07d6e5f4a3b2c:1f2e3d4c5b6a79889786756544433322',
            'dk-iban': 'refunds go to DK5000400441312345 per the old policy note',
            'cpr-number': 'the incident named employee 123456-7890 by number',
        }
        for rule_id, text in samples.items():
            self.assertIn(rule_id, privacy_gate.scan_text(text), rule_id)

    def test_clean_operational_text_never_fires(self):
        clean = [
            'The gateway retry budget was 8 calls; both chunks completed.',
            "Refused, incomplete: the blocklist diff was 'added' after the cut.",
            'CVR/SKP green; BBR active on tailnet 100.68.211.78 during the soak.',
            'On 2026-10-29 the handset note names the old gateway, not its path.',
            'Rollback used the archive namespace; casematch locked the retry.',
            'Danish cpanel control panel showed IPv6 and the new DKIM selector.',
        ]
        for text in clean:
            self.assertEqual(privacy_gate.scan_text(text), [], text)

    def test_output_records_rule_ids_only_never_values(self):
        secret = 'sk-live-ABCDEFGHIJKLMNOPQRST123456'
        hits = privacy_gate.scan_text('old key ' + secret + ' rotated')
        self.assertEqual(hits, ['openai-style-key'])
        self.assertNotIn(secret, str(hits))
        self.assertNotIn('ABCDEFGHIJKLMNOPQRST123456', str(hits))

    def test_gate_proposal_scans_all_fields_and_returns_ids_only(self):
        token = 'ghp_AbCdEfGh1234567890ab'
        proposal = {'lessons': [{'text': 'runner token ' + token, 'coverage': 'unknown',
                                 'evidence': 'clean evidence', 'scope': 'general'}],
                    'open_items': [f'rotate {token} before publish']}
        hits = privacy_gate.gate_proposal(proposal)
        self.assertEqual(hits, ['github-token'])
        self.assertEqual(privacy_gate.gate_proposal({'lessons': [], 'open_items': []}), [])


if __name__ == '__main__':
    unittest.main()