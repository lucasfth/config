#!/usr/bin/env python3
"""llama-swap harness: objective benchmark for the dk.gimle.qwen endpoint.

Runs against 127.0.0.1:18789 with the existing bearer auth. Same battery on
every model so results compare 1:1. Writes <out>/raw.jsonl and summary.json
under <out>.

Run (as gimle, via the service venv so psutil/transformers/mx exist):
  ~/loki-data/gimle-qwen/venv/bin/python <<this-file>> <model-id> <out-dir> [api-key]

Battery:
  P0  endpoint sanity (/health)
  P1  prefill: max_tokens=1 at 1024/8192/16384/32768 goal tokens, 2 runs, median
  P2  decode:  max_tokens=256 at ~1024 goal tokens, 3 runs, median
  P3  probes:  3 fixed coding tasks, temperature=0, max_tokens=256

Memory: one continuous sampler thread sums RSS over the endpoint process tree
(service.py + descendants) at 200 ms for the whole run - identical methodology
to the footprint supervisor (sampled, not a hard cap) - and snapshots a peak
at every phase boundary.
"""
import json
import os
import re
import stat
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import psutil

PORT = 18789
CONTEXTS = (1024, 8192, 16384, 32768)
FILLER = ('You are a precise systems programmer. Answer the task exactly, no preamble, no commentary. '
          'Reference context: the endpoint serves a single MLX model on loopback with beam width one, '
          'a fixed chat template and a bounded completion window. Kernel scheduling on Apple silicon '
          'reserves shared unified memory for heterogeneous tensor tiles and prompt cache checkpoints. '
          'Footprint supervising samples the process tree at a short interval and stops it when the '
          'sampled bytes cross the configured threshold, which is a stop rule, not a hard cap. '
          'Rollback restores the previous model symlink and state file, then restarts the launch agent '
          'and waits for two healthy probes and a smoke completion before touching the registry. ')


def die(msg):
    print('bench: ' + msg, file=sys.stderr)
    sys.exit(1)


def load_key(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        die('api-key file must be owned 0600')
    key = path.read_text().strip()
    if len(key) < 32:
        die('api-key too short')
    return key


def pad_to_tokens(text, target, tokenizer):
    ids = tokenizer.encode(text, add_special_tokens=False)
    if not ids:
        die('tokenizer produced no ids')
    ids = (ids * (-(-target // len(ids))))[:target]
    return tokenizer.decode(ids, skip_special_tokens=True)


def request(key, model_id, messages, max_tokens):
    body = json.dumps({'model': model_id, 'messages': messages, 'max_tokens': max_tokens,
                       'temperature': 0}).encode()
    req = urllib.request.Request('http://127.0.0.1:%d/v1/chat/completions' % PORT, data=body,
                                 headers={'Authorization': 'Bearer ' + key,
                                          'Content-Type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=3600) as r:
        data = json.load(r)
    dt = time.time() - t0
    usage = data.get('usage') or {}
    content = (data.get('choices') or [{}])[0].get('message', {}).get('content') or ''
    return dt, usage, content


class TreeSampler(threading.Thread):
    """Continuous process-tree RSS peak sampler for the endpoint tree."""

    def __init__(self, stop_event):
        super().__init__(daemon=True)
        self.stop_event = stop_event
        self.peak = 0
        self.phase_peak = 0
        self.snapshot = {}

    def _find_processes(self):
        found = []
        for proc in psutil.process_iter():
            try:
                cmd = ' '.join(proc.cmdline() or [])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            if 'service.py' in cmd:
                found.append(proc)
        return found

    def _rss(self, proc):
        total = 0
        try:
            total += proc.memory_info().rss
            for child in proc.children(recursive=True):
                try:
                    total += child.memory_info().rss
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        return total

    def mark(self, phase):
        self.snapshot[phase] = self.peak
        self.phase_finished = phase

    def run(self):
        while not self.stop_event.is_set():
            total = 0
            for proc in self._find_processes():
                total += self._rss(proc)
            if total > self.peak:
                self.peak = total
            time.sleep(0.2)


def main():
    if len(sys.argv) < 3:
        die('usage: bench.py <model-id> <out-dir> [api-key]')
    model_id = sys.argv[1]
    out = Path(sys.argv[2])
    out.mkdir(parents=True, mode=0o700, exist_ok=True)
    root = Path(os.environ.get('GIMLE_QWEN_ROOT', '/Users/gimle/loki-data/gimle-qwen'))
    key = sys.argv[3] if len(sys.argv) > 3 else load_key(root / 'api-key')

    from transformers import AutoTokenizer  # venv
    tokenizer = AutoTokenizer.from_pretrained(str(root / 'models' / model_id), trust_remote_code=True)

    stop = threading.Event()
    sampler = TreeSampler(stop)
    sampler.start()

    records = []

    def record(phase, context, max_tokens, run, dt, usage, content, note=''):
        rec = {'phase': phase, 'context': context, 'max_tokens': max_tokens, 'run': run,
               'wall_s': round(dt, 3), 'prompt_tokens': usage.get('prompt_tokens'),
               'completion_tokens': usage.get('completion_tokens'), 'content': content, 'note': note}
        records.append(rec)
        with open(out / 'raw.jsonl', 'a') as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + '\n')
        return rec

    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/health' % PORT, timeout=5) as r:
            health = r.status
        print('P0 health: %s' % health)
        sampler.mark('p0')

        for ctx in CONTEXTS:
            goal = max(ctx - 48, 512)
            prompt = pad_to_tokens(FILLER, goal, tokenizer) + '\n\nOne word: READY'
            messages = [{'role': 'user', 'content': prompt}]
            times = []
            for run in (1, 2):
                dt, usage, content = request(key, model_id, messages, 1)
                record('prefill', ctx, 1, run, dt, usage, content)
                times.append(dt)
            median = statistics.median(times)
            p_tok = records[-1]['prompt_tokens'] or ctx
            print('P1 ctx=%d prompt_tokens=%s median=%.2fs ~%.0f tok/s'
                  % (ctx, p_tok, median, p_tok / max(median, 0.001)))
            sampler.mark('prefill_%d' % ctx)

        prompt = pad_to_tokens(FILLER, max(1024 - 48, 512), tokenizer) + '\n\nList the first 40 primes, comma separated.'
        messages = [{'role': 'user', 'content': prompt}]
        decode = []
        for run in (1, 2, 3):
            dt, usage, content = request(key, model_id, messages, 256)
            rec = record('decode', 1024, 256, run, dt, usage, content)
            decode.append((rec['completion_tokens'] or 1) / max(dt, 0.001))
        print('P2 decode@1K median=%.1f tok/s runs=%s'
              % (statistics.median(decode), [round(x, 1) for x in decode]))
        sampler.mark('decode_1024')

        probes = (
            ('fix-swap', 'Fix this Python swap of two ints (x=1, y=2) without a temp variable. Show only the single swapped line.',
             lambda c: bool(re.search(r'\b([a-zA-Z_]\w*)\s*,\s*([a-zA-Z_]\w*)\s*=\s*\2\s*,\s*\1\b', c))),
            ('find-large', 'One shell command: list all files larger than 100MB under /var, with sizes.',
             lambda c: 'find' in c and '100' in c and '-s' in c),
            ('sql-sales', 'One SQL query: total sales per customer from table sales(customer_id, amount).',
             lambda c: 'group by' in c.lower() and 'sum' in c.lower()),
        )
        for name, task, check in probes:
            try:
                dt, usage, content = request(key, model_id, [{'role': 'user', 'content': task}], 256)
                passed = bool(check(content))
                record('probe', 0, 256, 1, dt, usage, content, 'id=%s pass=%s' % (name, passed))
                print('P3 %s: %s (%.1fs)' % (name, 'PASS' if passed else 'FAIL', dt))
            except Exception as exc:
                record('probe', 0, 256, 1, 0, {}, '', 'id=%s error=%s' % (name, exc))
                print('P3 %s: ERROR %s' % (name, exc))
        sampler.mark('probes')
    finally:
        stop.set()
        sampler.join(timeout=2)

    summary = {
        'model': model_id,
        'memory_peak_tree_rss_bytes': sampler.peak,
        'memory_peaks_by_phase': {k: v for k, v in sampler.snapshot.items()},
        'prefill': {re.sub(r'.*_(\d+)$', r'\1', k): {
            'median_s': round(statistics.median([r['wall_s'] for r in records
                                                  if r['phase'] == 'prefill' and r['context'] == int(k2)]), 3),
            'prompt_tokens': [r['prompt_tokens'] for r in records
                              if r['phase'] == 'prefill' and r['context'] == int(k2)][-1]}
            for k, k2 in [(m, c) for m, c in ((('prefill_%d' % c), c) for c in CONTEXTS)]},
        'decode_1024': {'median_tok_s': round(statistics.median(decode), 1),
                        'runs_tok_s': [round(x, 1) for x in decode],
                        'completion_tokens': [r['completion_tokens'] for r in records
                                              if r['phase'] == 'decode'][-1] if any(r['phase'] == 'decode' for r in records) else None},
        'probes': {r['note'].split('id=')[1].split(' ')[0]: r['note'].split('pass=')[1]
                   for r in records if r['phase'] == 'probe' and 'id=' in r['note']},
    }
    (out / 'summary.json').write_text(json.dumps(summary, indent=1) + '\n')
    print('bench: done -> %s (tree peak %.2f GB)' % (out, sampler.peak / 1e9))


if __name__ == '__main__':
    main()