#!/usr/bin/env python3
"""Compare hash-bound captured runs against deterministic development checks.

Never runs a model, command or live tool. Native capture labels are claims until
an operator checks traces and actual loaders. Passing this comparator is not
independent review, acceptance-set isolation or publication authorization.
"""
import argparse
import json
import math
from pathlib import Path
from .extract import safe, sha


def compare(root, suite, packet, traces):
    if suite.get('schema') != 1 or type(suite.get('trials')) is not int or not 1 <= suite['trials'] <= 3:
        raise ValueError('Invalid bounded evaluation suite')
    cases = {case['id']: case for case in suite['cases']}
    if not cases or len(cases) != len(suite['cases']) or len(cases) > 30:
        raise ValueError('Invalid evaluation cases')
    results, native, identities = {}, True, {}
    for trace in traces:
        key = (trace['harness'], trace['variant'], trace['case'], trace['trial'])
        if key in results:
            raise ValueError('Duplicate capture')
        harness, variant, case_id, trial = key
        if harness not in ('hugi', 'loki') or variant not in ('baseline', 'candidate') or case_id not in cases:
            raise ValueError('Unexpected capture identity')
        if type(trial) is not int or not 1 <= trial <= suite['trials']:
            raise ValueError('Invalid trial')
        if trace['skill_sha256'] != packet['base_sha256' if variant == 'baseline' else 'candidate_sha256']:
            raise ValueError('Captured skill differs from packet')
        for field in ('model', 'provider', 'harness_revision'):
            if not isinstance(trace[field], str) or not trace[field].strip():
                raise ValueError('Missing capture metadata')
        identity = tuple(trace[field] for field in ('model', 'provider', 'harness_revision'))
        if identities.setdefault(harness, identity) != identity:
            raise ValueError('Model/provider/harness changed across comparison')
        for field in ('elapsed_seconds', 'input_tokens', 'output_tokens'):
            value = trace[field]
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError('Invalid measured usage')
            if field.endswith('_tokens') and type(value) is not int:
                raise ValueError('Token counts must be measured integers')
        if trace['capture'] not in ('synthetic', 'native'):
            raise ValueError('Unknown capture type')
        native = native and trace['capture'] == 'native'
        artifact = safe(root, trace['artifact']).read_bytes()
        if sha(artifact) != trace['artifact_sha256']:
            raise ValueError('Artifact changed')
        captured = json.loads(artifact)
        result = captured.get('result', {})
        if result.get('failed') or result.get('error') or result.get('completed') is False:
            raise ValueError('Native capture failed; provider error is not model behavior')
        claims = captured.get('claims', {})
        expected = cases[case_id]['expected']
        # Strict JSON value types: Python otherwise equates True with 1.
        passed = all(k in claims and type(claims[k]) is type(v) and claims[k] == v for k, v in expected.items())
        results[key] = passed
    required = {(h, v, c, t) for h in ('hugi', 'loki') for v in ('baseline', 'candidate')
                for c in cases for t in range(1, suite['trials']+1)}
    incomplete = required - results.keys()
    candidate_failures = sum(not passed for (_, v, _, _), passed in results.items() if v == 'candidate')
    improvements, regressions = 0, 0
    for h, v, c, t in required:
        if v != 'baseline' or (h, v, c, t) not in results or (h, 'candidate', c, t) not in results:
            continue
        baseline, candidate = results[(h, v, c, t)], results[(h, 'candidate', c, t)]
        improvements += not baseline and candidate
        regressions += baseline and not candidate
    state = ('incomplete' if incomplete else 'checks-failed' if candidate_failures or regressions else
             'no-observed-uplift' if not improvements else 'awaiting-independent-trace-review' if native else 'fixture-only')
    return {'schema': 1, 'state': state, 'captures': len(results), 'missing': len(incomplete),
        'candidate_failures': candidate_failures, 'regressions': regressions,
        'target_improvements': improvements, 'qualified': False, 'publication_authorized': False,
        'suite_sha256': sha(json.dumps(suite, sort_keys=True).encode()),
        'packet_sha256': sha(json.dumps(packet, sort_keys=True).encode()),
        'traces_sha256': sha(json.dumps(traces, sort_keys=True).encode()),
        'limitation': 'Structured claims require independent trace/loader review; public fixtures are not held-out acceptance.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('root', 'suite', 'packet', 'traces'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.root, json.loads(args.suite.read_text()), json.loads(args.packet.read_text()),
                     json.loads(args.traces.read_text()))
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result['missing'] or result['candidate_failures'] or result['regressions'] else 0)
