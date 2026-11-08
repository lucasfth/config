#!/usr/bin/env python3
"""Sync shared Herdr config without restarting servers; explicit --apply required."""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tomllib

REPO = Path(__file__).resolve().parent.parent
HOSTS = ("neo", "mini", "vps1", "vps2", "freyr", "mimer", "ecoray3d", "plato", "loki")


def ssh(host, command, data=None, *, api=False):
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                             "-o", "ConnectTimeout=8", host, command], input=data,
                            capture_output=True, timeout=45)
    if result.returncode:
        if api:
            try:
                error = json.loads(result.stderr)
                if error.get("error", {}).get("code") == "server_not_running":
                    return result.stderr
            except ValueError:
                pass
        raise RuntimeError(f"{host}: {result.stderr.decode().strip()}")
    return result.stdout


def flattened(value, prefix=""):
    return {name: item for key, child in value.items()
            for name, item in (flattened(child, prefix + key + ".").items()
                               if isinstance(child, dict) else [(prefix + key, child)])}


def candidate(current, home):
    source = (REPO / "configs/herdr/config.toml").read_text()
    extra = flattened(tomllib.loads(current)).keys() - flattened(tomllib.loads(source)).keys()
    if extra:
        raise ValueError("Unmanaged Herdr keys require explicit preservation: " + ", ".join(sorted(extra)))
    return source.replace('default_shell = "zsh"',
                          "default_shell = " + json.dumps(home + "/.local/bin/huginn-shell")).encode()


def snapshot(host):
    value = json.loads(ssh(host, '~/.local/bin/herdr api snapshot', api=True))
    if "error" in value:
        if value["error"]["code"] == "server_not_running":
            return None
        raise RuntimeError(value["error"])
    return value["result"]["snapshot"]


def panes(state):
    return sorted(pane["pane_id"] for pane in state["panes"]) if state else []


def require_picker(host):
    reply = json.loads(ssh(host, '~/.local/bin/herdr plugin list --plugin herdr-omni --json'))
    plugins = reply.get("result", {}).get("plugins", [])
    if not any(plugin.get("plugin_id") == "herdr-omni" and plugin.get("enabled")
               and any(pane.get("id") == "picker" for pane in plugin.get("panes", []))
               for plugin in plugins):
        raise RuntimeError(host + ": install/register herdr-omni before deploying its prefix+g binding")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hosts", nargs="+", choices=HOSTS)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    for host in args.hosts:
        home = ssh(host, 'printf "%s" "$HOME"').decode()
        if not home.startswith("/") or any(c in home for c in '\n\r"\\'):
            raise ValueError("Unsafe remote home")
        current = ssh(host, 'cat "$HOME/.config/herdr/config.toml"')
        desired = candidate(current.decode(), home)
        before = snapshot(host)
        require_picker(host)
        if args.apply:
            digest = hashlib.sha256(current).hexdigest()
            command = r'''set -eu
config="$HOME/.config/herdr/config.toml"
[ -x "$HOME/.local/bin/huginn-shell" ] || exit 1
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$config"); else actual=$(shasum -a 256 "$config"); fi
[ "${actual%% *}" = EXPECTED ] || { echo 'Config changed since preflight' >&2; exit 1; }
umask 077
backup=$(mktemp -d "$HOME/.config/herdr/.huginn-config-backup.XXXXXX")
cp -p "$config" "$backup/config.toml"
chmod 700 "$backup"; chmod 600 "$backup/config.toml"
if [ -L "$config" ]; then readlink "$config" > "$backup/original-symlink"; fi
temp=$(mktemp "$HOME/.config/herdr/.huginn-config.XXXXXX")
trap 'rm -f "$temp"' EXIT
cat > "$temp"; chmod 600 "$temp"; mv -f "$temp" "$config"
printf 'Backup: %s\n' "$backup"
'''.replace("EXPECTED", shlex.quote(digest))
            print(host, ssh(host, "bash -c " + shlex.quote(command), desired).decode().strip(), flush=True)
            if before:
                print(ssh(host, '~/.local/bin/herdr server reload-config').decode().strip(), flush=True)
            actual = ssh(host, 'cat "$HOME/.config/herdr/config.toml"')
            if actual != desired:
                raise RuntimeError(host + ": config readback mismatch")
            after = snapshot(host)
            if bool(before) != bool(after) or panes(before) != panes(after):
                raise RuntimeError(host + ": runtime/pane preservation check failed")
            print(json.dumps({"host": host, "config_verified": True, "server_running": bool(after),
                              "panes_preserved": panes(after), "sha256": hashlib.sha256(actual).hexdigest()}), flush=True)
        else:
            print(host, "would sync config; running:", bool(before), "panes:", panes(before))


if __name__ == "__main__":
    main()
