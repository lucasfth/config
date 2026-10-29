#!/usr/bin/env python3
"""Read-only, evidence-bound AAR triage. Findings require operator review.

The findings file is a review input, not an authorization token. Models may propose
its contents; unattended jobs must not supply reviewed incident identities. This
module never publishes, modifies skills, writes vault notes or grants approval.
"""
import argparse
import json
from pathlib import Path
import re

from .extract import load_state, read_source, safe, sha

FIELDS = {'record_id', 'lesson_index', 'quote', 'incident', 'pattern', 'workflow',
          'system', 'diagnosis', 'target', 'coverage_quote', 'reference'}
ROUTES = {'missing-procedure': 'skill-patch', 'discovery': 'skill-trigger',
          'enforcement': 'enforcement-review', 'runtime': 'code-review',
          'one-off': 'history', 'uncertain': 'hold'}


def assess(vault, state_dir, skills, findings):
    if not isinstance(findings, list) or len(findings) > 100:
        raise ValueError('Expected at most 100 reviewed observations')
    records = load_state(state_dir)['records']
    groups, seen = {}, set()
    for finding in findings:
        if not isinstance(finding, dict) or set(finding) != FIELDS:
            raise ValueError('Unexpected finding fields; no approval fields accepted')
        index = finding['lesson_index']
        if type(index) is not int or index < 0:
            raise ValueError('Invalid lesson index')
        for field in FIELDS - {'lesson_index'}:
            if not isinstance(finding[field], str) or not 1 <= len(finding[field].strip()) <= 2000:
                raise ValueError('Invalid finding field: ' + field)
        key = (finding['record_id'], index)
        if key in seen:
            raise ValueError('Duplicate observation')
        seen.add(key)
        record = records.get(key[0])
        if not record or index >= len(record['lessons']):
            raise ValueError('Unknown record/lesson')
        source, body = read_source(vault, record['source']['path'])
        if source != record['source']:
            raise ValueError('Source changed; reconcile before triage')
        if finding['quote'] not in body:
            raise ValueError('Evidence quote absent from source')
        diagnosis = finding['diagnosis']
        if diagnosis not in ROUTES:
            raise ValueError('Unknown diagnosis')
        if record['lessons'][index]['coverage'] == 'existing' and diagnosis == 'missing-procedure':
            raise ValueError('Already covered: investigate discovery/enforcement')
        target = finding['target']
        if not re.fullmatch(r'skills/[a-z0-9][a-z0-9-]*/SKILL\.md', target):
            raise ValueError('Expected an existing skill target; new skills require separate overlap review')
        payload = safe(skills, target).read_bytes()
        if finding['coverage_quote'] not in payload.decode('utf-8'):
            raise ValueError('Coverage quote absent from target skill')
        group_key = tuple(finding[k] for k in ('pattern', 'workflow', 'system', 'diagnosis', 'target'))
        group = groups.setdefault(group_key, {'pattern': finding['pattern'], 'workflow': finding['workflow'],
            'system': finding['system'], 'route': ROUTES[diagnosis], 'target': target,
            'target_sha256': sha(payload), 'observations': []})
        group['observations'].append({**finding, 'source': source})
    result = []
    for key in sorted(groups):
        group = groups[key]
        group['observations'].sort(key=lambda f: (f['source']['path'], f['lesson_index']))
        # Count connected evidence components: same incident OR same source bytes
        # merges observations, including transitive duplicate-account chains.
        components = []
        for observation in group['observations']:
            identity = {('incident', observation['incident']),
                        ('revision', observation['source']['sha256'])}
            overlaps = [part for part in components if part & identity]
            for part in overlaps:
                identity |= part
                components.remove(part)
            components.append(identity)
        group['independent_incidents'] = len(components)
        group['status'] = ('review-ready' if group['independent_incidents'] >= 2 else 'watch')
        if group['route'] in ('history', 'hold'):
            group['status'] = 'hold'
        group['binding'] = sha(json.dumps(group, sort_keys=True).encode())
        result.append(group)
    return {'schema': 1, 'patterns': result, 'guidance_applied': False, 'skills_changed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('vault', 'state', 'skills', 'findings'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(assess(args.vault, args.state, args.skills,
                           json.loads(args.findings.read_text())), indent=2))
