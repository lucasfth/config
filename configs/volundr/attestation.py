"""SSH-signed controller history result; consumer trust key is installed separately."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import secret_gate

NAMESPACE = 'volundr-history-v1'


def sign(item, bundle, key):
    # Called only after the trusted controller completed history and tree scans.
    receipt = {k: item[k] for k in ['target', 'config_revision', 'bundle_sha256', 'created_at']}
    receipt.update({'policy_sha256': secret_gate.POLICY_SHA256, 'scanner': 'gitleaks-8.30.1',
                    'scope': 'git-history-and-tree', 'version': 1})
    data = json.dumps(receipt, sort_keys=True, separators=(',', ':')).encode() + b'\n'
    with tempfile.TemporaryDirectory() as directory:
        p = Path(directory) / 'receipt';p.write_bytes(data)
        subprocess.run(['ssh-keygen', '-Y', 'sign', '-f', str(key), '-n', NAMESPACE, str(p)],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        signature = p.with_suffix('.sig').read_text()
    return {'receipt': data.decode(), 'signature': signature}


def verify(item, bundle, proof, allowed_signers):
    if not Path(allowed_signers).is_file():raise RuntimeError('Missing pinned controller trust key')
    data = proof['receipt'].encode();receipt = json.loads(data)
    for k in ['target', 'config_revision', 'bundle_sha256', 'created_at']:
        if receipt.get(k) != item[k]:raise RuntimeError('Attestation does not cover this delivery')
    if receipt.get('policy_sha256') != secret_gate.POLICY_SHA256 or receipt.get('scope') != 'git-history-and-tree':
        raise RuntimeError('Wrong attestation scope or policy')
    if receipt.get('scanner') != 'gitleaks-8.30.1' or receipt.get('version') != 1:
        raise RuntimeError('Unsupported attestation')
    if hashlib.sha256(Path(bundle).read_bytes()).hexdigest() != receipt['bundle_sha256']:
        raise RuntimeError('Attested bundle differs')
    age = time.time() - receipt['created_at']
    if age < -300 or age > 7 * 86400:raise RuntimeError('Expired attestation')
    with tempfile.TemporaryDirectory() as directory:
        sig = Path(directory) / 'receipt.sig';sig.write_text(proof['signature'])
        result = subprocess.run(['ssh-keygen', '-Y', 'verify', '-f', str(allowed_signers),
            '-I', 'volundr-controller', '-n', NAMESPACE, '-s', str(sig)], input=data,
            capture_output=True, timeout=20)
        if result.returncode:raise RuntimeError('Invalid controller history attestation signature')
