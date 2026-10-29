#!/usr/bin/env python3
"""Prepare a hash-bound skill diff for review; never apply or publish it.

A packet is evidence, not authorization. Re-run read-only triage against current
sources before publication. Filesystem isolation belongs to the execution host;
this helper's validation is not an autonomous-writer security boundary.
"""
import argparse
import difflib
import json
from pathlib import Path
import re
from .extract import safe, sha


def prepare(skills, group, candidate):
    unsigned = {key: value for key, value in group.items() if key != 'binding'}
    if group.get('binding') != sha(json.dumps(unsigned, sort_keys=True).encode()):
        raise ValueError('Pattern binding changed; repeat triage')
    if group.get('status') != 'review-ready' or group.get('route') not in ('skill-patch', 'skill-trigger'):
        raise ValueError('Pattern is not qualified for a skill candidate')
    target = group['target']
    if not re.fullmatch(r'skills/[a-z0-9][a-z0-9-]*/SKILL\.md', target):
        raise ValueError('Invalid existing skill target')
    before = safe(skills, target).read_bytes()
    if sha(before) != group['target_sha256']:
        raise ValueError('Skill target changed; repeat coverage review')
    # Resolve platform aliases such as macOS /var; reject a symlink payload.
    # This is input hygiene, not isolation of an untrusted writer.
    if candidate.is_symlink():
        raise ValueError('Symlink candidate is not supported')
    candidate = candidate.resolve(strict=True)
    if candidate.stat().st_size > 100000:
        raise ValueError('Candidate exceeds review budget')
    after = candidate.read_bytes()
    if before == after:
        raise ValueError('No change')
    old, new = before.decode('utf-8'), after.decode('utf-8')
    header = lambda text: re.match(r'\A---\n[\s\S]*?\n---\n', text)
    old_header, new_header = header(old), header(new)
    if not old_header or not new_header or old_header[0] != new_header[0]:
        raise ValueError('Preserve frontmatter; trigger/metadata edits need separate reviewed handling')
    if not new.endswith('\n') or new.endswith('\n\n'):
        raise ValueError('Candidate must end with exactly one newline')
    packet = {'schema': 1, 'state': 'awaiting-evaluation-and-review', 'target': target,
        'base_sha256': sha(before), 'candidate_sha256': sha(after),
        'pattern_binding': group['binding'], 'publication_authorized': False,
        'diff': ''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
            fromfile=target, tofile=target + ' (candidate)')),
        'limitations': ['No semantic safety approval', 'No consumer behavioral evidence',
                        'Not a sandbox or publication permit']}
    packet['binding'] = sha(json.dumps(packet, sort_keys=True).encode())
    return packet


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills', type=Path, required=True)
    parser.add_argument('--group', type=Path, required=True, help='One group from fresh aar_patterns output')
    parser.add_argument('--candidate', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.skills, json.loads(args.group.read_text()), args.candidate), indent=2))
