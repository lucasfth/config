#!/usr/bin/env python3
"""Cron adapter with an explicit environment; no secrets stored in source."""
import argparse
import re
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import nightly


def execute(settings_path, action):
    settings = json.loads(Path(settings_path).read_text())
    os.environ['PATH'] = settings['path']
    if action == 'sync':
        try:
            result = nightly.sync(settings)
        except Exception as exc:
            nightly.save(Path(settings['state']) / 'last-error.json', {'error_type': type(exc).__name__})
            print('Volundr sync blocked; local receipt retained (' + type(exc).__name__ + ').', file=sys.stderr)
            return 1
        finally:
            nightly.consolidation(settings)
        if result['status'] not in {'up-to-date', 'no-new-bundle', 'busy'}:
            # Candidate locations and conflict paths stay in the private local receipt.
            summary = {'status': result['status']}
            if 'conflicts' in result:
                summary['conflict_count'] = len(result['conflicts'])
            print(json.dumps(summary))
    elif action == 'review':
        state = Path(settings['state'])
        # Do not send raw pending diffs, paths, exceptions or personal skill bodies to a model.
        parts = {}
        for name in ['pending.json', 'consolidation.json']:
            p = state / name
            if p.exists():
                value = json.loads(p.read_text())
                if name == 'pending.json':
                    status = value.get('status')
                    parts['local_work'] = {'status': status if status in {'conflict', 'local-review-required'} else 'review-required',
                                           'conflict_count': len(value.get('conflicts', []))}
                else:
                    pairs = value.get('candidates', [])[:10]
                    safe = lambda name: isinstance(name, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', name)
                    parts['consolidation'] = {'pairs': [x['skills'] for x in pairs
                        if len(x.get('skills', [])) == 2 and all(safe(n) for n in x['skills'])]}
        evidence = json.dumps(parts, sort_keys=True) if parts else ''
        signature = nightly.hashlib.sha256(evidence.encode()).hexdigest()
        marker = state / 'last-review-input.json'
        old = json.loads(marker.read_text()) if marker.exists() else {}
        if old.get('sha256') == signature or not evidence:
            print('{"wakeAgent":false}')
        else:
            print(evidence)
            nightly.save(marker, {'sha256': signature})
    else:
        import dream_guard
        return dream_guard.run_dream(settings_path, settings['dream_script'])
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('action', choices=['sync', 'review', 'dream'])
    args = parser.parse_args()
    raise SystemExit(execute(args.settings, args.action))
