"""Connect reviewed evidence to candidate packets; never execute patch commands.

This is an operator-reviewed source cycle, not an autonomous approval workflow.
Only sanitized counts are suitable for a scheduled digest. Exact evidence/diffs
remain in private external state. Re-run against current sources before shipping.
"""
import fcntl
import json
from pathlib import Path
from .extract import safe, save, sha
from .patterns import assess
from .review import prepare


def configured(config_path):
    config = json.loads(config_path.read_text())
    expected = {'mode', 'vault', 'state', 'skills', 'findings', 'candidates'}
    if set(config) != expected or config['mode'] != 'reviewed-inputs-only':
        raise ValueError('Explicit reviewed-inputs-only cycle configuration required')
    paths = {key: Path(config[key]) for key in expected - {'mode'}}
    if not all(path.is_absolute() for path in paths.values()):
        raise ValueError('Absolute private cycle paths required')
    return run(paths['vault'], paths['state'], paths['skills'],
               json.loads(paths['findings'].read_text()), json.loads(paths['candidates'].read_text()))


def run(vault, state, skills, findings, candidates):
    if state.resolve().is_relative_to(vault.resolve()) or state.resolve().is_relative_to(skills.resolve()):
        raise ValueError('Cycle state must be outside vault and skill trees')
    if not isinstance(candidates, dict) or len(candidates) > 3:
        raise ValueError('At most three explicitly supplied candidate files')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with safe(state, 'learning-cycle.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        patterns = assess(vault, state, skills, findings)['patterns']
        groups = {}
        for group in patterns:
            if group['status'] == 'review-ready' and group['route'] in ('skill-patch', 'skill-trigger'):
                groups.setdefault(group['target'], []).append(group)
        if set(candidates) - groups.keys():
            raise ValueError('Unmatched candidate target; current reviewed pattern required')
        packets = []
        for target, candidate in sorted(candidates.items()):
            if len(groups[target]) != 1:
                raise ValueError('Multiple patterns for target need one reconciled coverage review')
            packets.append(prepare(skills, groups[target][0], Path(candidate)))
        ready = sum(g['status'] == 'review-ready' for g in patterns)
        routes = {}
        for group in patterns:
            routes[group['route']] = routes.get(group['route'], 0) + 1
        summary = {'state': 'awaiting-evaluation-and-review' if packets else
                   'awaiting-patch-review' if groups else
                   'awaiting-diagnosis-review' if ready else 'watching-evidence',
                   'patterns': len(patterns), 'review_ready': ready, 'routes': routes,
                   'held_or_watch': len(patterns)-ready, 'packets': len(packets),
                   'skills_changed': False, 'guidance_applied': False,
                   'publication_authorized': False}
        receipt = {'schema': 1, 'patterns': patterns, 'packets': packets, 'summary': summary}
        content = json.dumps(receipt, sort_keys=True, indent=2) + '\n'
        identifier = sha(content.encode())
        path = safe(state, f'cycles/{identifier}.json')
        if path.exists():
            if path.read_text() != content:
                raise ValueError('Existing content-addressed receipt differs')
        else:
            save(path, content)
        result = {'receipt_sha256': identifier, 'summary': summary}
        save(safe(state, 'last-cycle.json'), json.dumps(result, sort_keys=True, indent=2)+'\n')
        return result
