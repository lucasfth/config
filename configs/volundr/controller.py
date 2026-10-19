#!/usr/bin/env python3
"""Once-daily Copenhagen delivery, retried when an awake controller is available."""
import argparse
import datetime
import fcntl
import json
from pathlib import Path
from zoneinfo import ZoneInfo
import deliver


def tick(config, library, state, now=None, send=deliver.deliver):
    now = now or datetime.datetime.now(ZoneInfo('Europe/Copenhagen'))
    state = Path(state)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / 'controller.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'busy'}
        marker = state / 'last-delivery.json'
        last = json.loads(marker.read_text()) if marker.exists() else {}
        day = now.date().isoformat()
        if (now.hour, now.minute) < (2, 31) or last.get('day') == day:
            return {'status': 'not-due'}
        result = send(config, library, 'loki')
        result['day'] = day
        temporary = marker.with_suffix('.tmp')
        temporary.write_text(json.dumps(result) + '\n')
        temporary.replace(marker)
        return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--library', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(tick(args.config, args.library, Path.home() / '.local/state/volundr')))
