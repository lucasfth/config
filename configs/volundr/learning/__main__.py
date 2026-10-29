"""One entrypoint; explicit actions never imply publication or activation."""
import argparse
import json
from pathlib import Path

from . import extract, patterns, review, evaluate, cycle, cron


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    for action in ('extract', 'cron'):
        command = commands.add_parser(action)
        command.add_argument('--config', type=Path, required=True)
    for action, fields in [('triage', ('vault', 'state', 'skills', 'findings')),
                           ('review', ('skills', 'group', 'candidate')),
                           ('evaluate', ('root', 'suite', 'packet', 'traces')),
                           ('cycle', ('vault', 'state', 'skills', 'findings', 'candidates'))]:
        command = commands.add_parser(action)
        for field in fields:
            command.add_argument('--' + field, type=Path, required=True)
    args = parser.parse_args()
    load = lambda path: json.loads(path.read_text())
    if args.action == 'cron':
        return cron.run(args.config)
    if args.action == 'extract':
        result = extract.nightly(args.config)
        failed = bool(result.get('errors'))
    elif args.action == 'triage':
        result = patterns.assess(args.vault, args.state, args.skills, load(args.findings))
        failed = False
    elif args.action == 'review':
        result = review.prepare(args.skills, load(args.group), args.candidate)
        failed = False
    elif args.action == 'cycle':
        result = cycle.run(args.vault, args.state, args.skills, load(args.findings), load(args.candidates))
        failed = False
    else:
        result = evaluate.compare(args.root, load(args.suite), load(args.packet), load(args.traces))
        failed = bool(result['missing'] or result['candidate_failures'] or result['regressions'])
    print(json.dumps(result, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
