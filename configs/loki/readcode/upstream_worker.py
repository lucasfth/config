"""Isolated upstream worker: one trusted transport per process, JSON lines on stdin/stdout.

Launched by upstream.Session with a clean exec (`python -I`), an explicit minimal environment
and its own session/process group, so the broker can SIGKILL the whole group at the absolute
deadline. Line 1 is the transport description {paths, module, factory, kwargs}; every later
line is {name, arguments, timeout} and gets exactly one reply line. No guest code runs here.
"""
import importlib
import json
import sys
from pathlib import Path


def main() -> None:
    spec = json.loads(sys.stdin.readline())
    for p in reversed(spec["paths"]):
        sys.path.insert(0, p)
    # Muninn's server imports FastAPI/PyYAML even for read-only operations.
    # Use one explicitly provisioned vault-only directory, not the parent's
    # site-packages, Hermes environment, PYTHONPATH or guest-selected paths.
    if spec['module'] == 'server_transports' and spec['factory'] == 'MuninnLocal':
        vendor = Path(__file__).resolve().parent.parent / 'worker-vendor'
        if vendor.is_dir():
            sys.path.insert(0, str(vendor))
    try:
        transport, init_error = getattr(importlib.import_module(spec["module"]), spec["factory"])(**spec["kwargs"]), None
    except Exception as exc:  # reported per call; never crash silently
        transport, init_error = None, type(exc).__name__
    for line in sys.stdin:
        req = json.loads(line)
        if transport is None:
            reply = {"ok": False, "etype": "WorkerInitError", "msg": init_error}
        else:
            try:
                reply = {"ok": True, "value": transport.call(req["name"], req["arguments"], req["timeout"])}
                reply = json.dumps(reply)
            except Exception as exc:
                reply = {"ok": False, "etype": type(exc).__name__, "msg": str(exc)[:300]}
        sys.stdout.write((reply if isinstance(reply, str) else json.dumps(reply)) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
