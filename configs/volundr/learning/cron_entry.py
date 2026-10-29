#!/usr/bin/env python3
"""Installed as ~/.hermes/scripts/aar_distill_nightly.py; no Dreaming or agent turn."""
import os
from pathlib import Path
import sys

code = Path.home() / '.hermes/volundr-nightly/code'
sys.path.insert(0, str(code))
from learning.cron import run

if __name__ == '__main__':
    # An explicit config permits a no-provider disabled-path deployment check.
    config = Path(sys.argv[1]) if len(sys.argv) == 2 else code / 'aar-learning-config.json'
    raise SystemExit(run(config))
