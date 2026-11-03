#!/usr/bin/env python3
"""Install missing SSH connection definitions, never keys or authentication state."""
import argparse
import io
import json
from pathlib import Path
import shlex
import subprocess
import tarfile

TARGETS = ("neo", "mini", "vps1", "vps2", "freyr", "mimer", "ecoray3d", "plato", "loki", "sigyn")
ALIASES = (*TARGETS, "gimle", "sep", "windows")


def run(argv, data=None):
    result = subprocess.run(argv, input=data, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {result.stderr.decode().strip()}")
    return result.stdout


def ssh(host, command, data=None):
    return run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                "-o", "ConnectTimeout=8", host, command], data)


def fields(data):
    return dict(line.split(" ", 1) for line in data.decode().splitlines() if " " in line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hosts", nargs="+", choices=TARGETS)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    inventory = {alias: fields(run(["ssh", "-G", alias])) for alias in ALIASES}
    for host in args.hosts:
        missing = [alias for alias in ALIASES
                   if fields(ssh(host, "ssh -G " + shlex.quote(alias) + " 2>/dev/null"))["hostname"] == alias]
        blocks = ["# Generated from canonical resolved SSH inventory; no keys copied."]
        for alias in missing:
            entry = inventory[alias]
            values = {key: entry[key] for key in ("hostname", "user", "port")}
            if values["hostname"] == alias or any(any(c.isspace() for c in value) for value in values.values()):
                raise ValueError("Unresolved/unsafe source alias: " + alias)
            blocks.append(f"\nHost {alias}\n    HostName {values['hostname']}\n    User {values['user']}\n    Port {values['port']}\n    StrictHostKeyChecking yes\n")
        print(host, "missing definitions:", ", ".join(missing) or "none", flush=True)
        if not args.apply or not missing:
            continue
        current = ssh(host, 'if [ -f "$HOME/.ssh/config" ]; then cat "$HOME/.ssh/config"; fi')
        mode = ssh(host, 'if [ -L "$HOME/.ssh/config" ]; then printf symlink; else printf regular; fi').decode()
        if mode == "symlink":
            if b"Include config.d/ecoray" not in current:
                raise RuntimeError(host + ": unsupported managed SSH config")
            exists = ssh(host, 'if [ -e "$HOME/.ssh/config.d/ecoray" ]; then printf exists; fi')
            if exists:
                raise RuntimeError(host + ": managed include already exists; do not replace")
            target = "ecoray"
        else:
            target = "huginn-fleet"
        updated = current
        if mode == "regular" and b"Include config.d/huginn-fleet" not in current:
            updated = current.rstrip(b"\n") + b"\n\nHost *\n    Include config.d/huginn-fleet\n"
        include = ssh(host, 'if [ -f "$HOME/.ssh/config.d/' + target + '" ]; then cat "$HOME/.ssh/config.d/' + target + '"; fi')
        desired_include = include.rstrip(b"\n") + b"\n\n" + "\n".join(blocks).encode()
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode="w") as tar:
            for name, content in {"expected": current, "config": updated, "include-expected": include, "hosts": desired_include}.items():
                info = tarfile.TarInfo(name); info.size = len(content); info.mode = 0o600
                tar.addfile(info, io.BytesIO(content))
        command = r'''set -eu
umask 077
[ ! -L "$HOME/.ssh" ] && [ ! -L "$HOME/.ssh/config.d" ] || exit 1
mkdir -p "$HOME/.ssh/config.d"
stage=$(mktemp -d "$HOME/.ssh/.huginn-fleet.XXXXXX")
tar -xf - -C "$stage"
config="$HOME/.ssh/config"
if [ -f "$config" ]; then cmp -s "$stage/expected" "$config" || exit 1; else [ ! -s "$stage/expected" ] || exit 1; fi
[ ! -L "$HOME/.ssh/config.d/TARGET" ] || exit 1
if [ -f "$HOME/.ssh/config.d/TARGET" ]; then cmp -s "$stage/include-expected" "$HOME/.ssh/config.d/TARGET" || exit 1; else [ ! -s "$stage/include-expected" ] || exit 1; fi
if [ -e "$config" ]; then cp -p "$config" "$stage/config-before"; fi
if [ -e "$HOME/.ssh/config.d/TARGET" ]; then cp -p "$HOME/.ssh/config.d/TARGET" "$stage/include-before"; fi
mv "$stage/hosts" "$HOME/.ssh/config.d/TARGET"
if [ MODE = regular ]; then mv "$stage/config" "$config"; fi
chmod 600 "$HOME/.ssh/config.d/TARGET"
printf 'SSH definitions applied; private rollback: %s\n' "$stage"
'''.replace("TARGET", target).replace("MODE", shlex.quote(mode))
        print(ssh(host, "bash -c " + shlex.quote(command), archive.getvalue()).decode().strip(), flush=True)
        verified = all(fields(ssh(host, "ssh -G " + shlex.quote(alias) + " 2>/dev/null"))["hostname"] == inventory[alias]["hostname"] for alias in missing)
        if not verified:
            raise RuntimeError(host + ": SSH definition readback mismatch")
        print(json.dumps({"host": host, "new_definitions_verified": len(missing), "authentication_tested": False}), flush=True)


if __name__ == "__main__":
    main()
