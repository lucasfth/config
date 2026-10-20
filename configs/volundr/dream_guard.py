#!/usr/bin/env python3
"""Run existing dreaming under the skill-sync lock; install a proposal-only guard.

--install patches only the two named functions in the existing local script,
after making a private backup. Never runs dreaming during installation/testing.
"""
import argparse
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

GUARD = '''def consume_hardener_proposals(state: dict) -> tuple[str, int, int]:
    """Legacy hardener is retired: no severity authorizes automatic writes."""
    return "Legacy hardener auto-apply disabled; shared skill changes are proposals only.", 0, 0
'''

WRAPPER = '''def proactive_skill_patching(state, error_report):
    section, patches = _proactive_skill_patching_original(state, error_report)
    pointer = "\\nVolundr consolidation evidence: ~/.hermes/volundr-nightly/state/consolidation.json (proposals only).\\n"
    return section + pointer, patches
'''


def guarded_source(text):
    tree = ast.parse(text)
    functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    hardener = functions['consume_hardener_proposals']
    proactive = functions['proactive_skill_patching']
    same = lambda left, right: ast.dump(left, include_attributes=False) == ast.dump(ast.parse(right).body[0], include_attributes=False)
    if '_proactive_skill_patching_original' in functions:
        if same(hardener, GUARD) and same(proactive, WRAPPER):
            return text
        raise ValueError('Partially guarded or modified dream script requires manual review')
    if 'Volundr consolidation evidence:' in text:
        raise ValueError('Unexpected legacy guard; restore the original before patching')
    lines = text.splitlines(keepends=True)
    original = ''.join(lines[proactive.lineno - 1:proactive.end_lineno])
    original = original.replace('def proactive_skill_patching(', 'def _proactive_skill_patching_original(', 1)
    replacements = [(proactive, original + '\n\n' + WRAPPER), (hardener, GUARD)]
    for node, replacement in sorted(replacements, key=lambda item: item[0].lineno, reverse=True):
        lines[node.lineno - 1:node.end_lineno] = [replacement]
    result = ''.join(lines)
    ast.parse(result)
    return result


def snapshot(root):
    root = Path(root)
    if not root.exists():
        return None
    paths = [root] if not root.is_dir() else sorted(root.rglob('*'))
    return {str(p.relative_to(root)) if p != root else '.':
            ('link', os.readlink(p)) if p.is_symlink() else
            ('file', hashlib.sha256(p.read_bytes()).hexdigest()) if p.is_file() else ('dir', '')
            for p in paths}


def install(script, home):
    script, home = Path(script), Path(home)
    original = script.read_bytes()
    replacement = guarded_source(original.decode()).encode()
    backup = home / 'volundr-nightly' / ('dream-backup-' + str(time.time_ns()))
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(script, backup / script.name)
    vault = Path.home() / 'loki-memory'
    before = {name: snapshot(vault / name) for name in ['dreams', '.dream_state.json']}
    jobs_before = snapshot(home / 'cron/jobs.json')
    if (vault / 'dreams').is_dir():
        shutil.copytree(vault / 'dreams', backup / 'dreams', symlinks=True)
    if (vault / '.dream_state.json').exists():
        shutil.copy2(vault / '.dream_state.json', backup / '.dream_state.json')
    shutil.copy2(home / 'cron/jobs.json', backup / 'jobs.json')
    if script.read_bytes() != original or (backup / script.name).read_bytes() != original:
        raise ValueError('Dream script changed or backup differs')
    for name, expected in before.items():
        if snapshot(vault / name) != expected or snapshot(backup / name) != expected:
            raise ValueError('Dream data changed or backup differs: ' + name)
    if snapshot(home / 'cron/jobs.json') != jobs_before or snapshot(backup / 'jobs.json') != jobs_before:
        raise ValueError('Cron definitions changed or backup differs')
    temporary = script.with_suffix('.volundr.tmp')
    temporary.write_bytes(replacement)
    temporary.chmod(script.stat().st_mode & 0o777)
    temporary.replace(script)
    receipt = {'backup': str(backup), 'before': hashlib.sha256(original).hexdigest(),
               'after': hashlib.sha256(replacement).hexdigest(), 'dream_run': False}
    (backup / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


def run_dream(settings_path, script):
    settings = json.loads(Path(settings_path).read_text())
    state = Path(settings['state'])
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / 'sync.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Dreaming skipped: shared skill sync is still running.')
            return 0
        # Only deterministic evidence generation precedes the already-scheduled dream.
        import nightly
        nightly.consolidation(settings)
        # Source-only opt-in; existing deployments have no config key and stay unchanged.
        if settings.get('aar_learning_config'):
            import aar_learning
            result = aar_learning.nightly(Path(settings['aar_learning_config']))
            print('AAR learning: ' + json.dumps(result))
        return subprocess.run([sys.executable, str(script)], check=False, env=os.environ).returncode


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path)
    parser.add_argument('--home', type=Path, default=Path.home() / '.hermes')
    parser.add_argument('--script', type=Path, required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    if args.install:
        print(json.dumps(install(args.script, args.home)))
    else:
        raise SystemExit(run_dream(args.settings, args.script))
