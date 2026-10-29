#!/usr/bin/env python3
"""Compatibility entrypoint for installed distill wrappers; implementation moved.

Do not restore retired startup approval or direct-vault archival through this shim.
Deploy the complete learning package with this adapter, never this file alone.
"""
from learning.extract import nightly

if __name__ == '__main__':
    import argparse
    import json
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['nightly'])
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    result = nightly(args.config)
    print(json.dumps(result))
    raise SystemExit(1 if result.get('errors') else 0)
