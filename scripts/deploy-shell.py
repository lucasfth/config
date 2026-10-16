#!/usr/bin/env python3
"""Stage pinned, user-local shell tools; activation requires explicit --apply."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shlex
import subprocess
import tarfile
import tempfile
import urllib.request

REPO = Path(__file__).resolve().parent.parent
HOSTS = {
    "neo": ("darwin-arm64", "zsh"),
    "mini": ("darwin-arm64", "zsh"),
    "freyr": ("linux-amd64", "zsh"),
    "mimer": ("linux-amd64", "zsh"),
    "vps1": ("linux-amd64", "zsh"),
    "vps2": ("linux-amd64", "zsh"),
    "ecoray3d": ("linux-amd64", "zsh"),
    "plato": (None, "bash"),
    "loki": (None, "bash"),
    "sigyn": (None, "minimal-zsh"),
}


def ssh(host, command, *, data=None, timeout=60):
    result = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, command],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError(f"{host}: SSH command failed ({result.returncode}): {result.stderr.decode().strip()}")
    return result.stdout.decode()


def download(info, cache):
    destination = cache / info["sha256"]
    if not destination.exists():
        request = urllib.request.Request(info["url"], headers={"User-Agent": "huginn-shell"})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != info["sha256"]:
            raise ValueError("Checksum mismatch: " + info["url"])
        destination.write_bytes(data)
    data = destination.read_bytes()
    if hashlib.sha256(data).hexdigest() != info["sha256"]:
        raise ValueError("Invalid cached archive: " + str(destination))
    return data


def unpack_plugin(data, target):
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive.getmembers():
            parts = Path(member.name).parts
            if not parts or parts[0] in ("/", "..") or ".." in parts:
                raise ValueError("Unsafe plugin archive path")
            relative = Path(*parts[1:])
            if not relative.parts:
                continue
            destination = target / relative
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source:
                    destination.write_bytes(source.read())
                destination.chmod(member.mode & 0o755)
            # Repository symlinks are not needed by these plugins and are not followed.


def install_binary(data, tool, destination, raw=False):
    if raw:
        destination.write_bytes(data)
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            members = [m for m in archive.getmembers() if m.isfile() and Path(m.name).name == tool]
            if len(members) != 1:
                raise ValueError("Expected one executable in archive: " + tool)
            with archive.extractfile(members[0]) as source:
                destination.write_bytes(source.read())
    destination.chmod(0o755)


def capabilities(host):
    command = r'''if command -v zsh >/dev/null 2>&1; then shell=$(command -v zsh); elif [ -x "$HOME/.nix-profile/bin/zsh" ]; then shell="$HOME/.nix-profile/bin/zsh"; else shell=$(command -v bash); fi; "$shell" -ic 'for tool in starship fzf zoxide direnv bat fd rg; do command -v "$tool" >/dev/null 2>&1 && printf "HUGINN_TOOL=%s\n" "$tool"; done; :' '''
    result = ssh(host, command)
    return {line.split("=", 1)[1] for line in result.splitlines() if line.startswith("HUGINN_TOOL=")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hosts", nargs="+", choices=sorted(HOSTS))
    parser.add_argument("--apply", action="store_true", help="Stage and activate; never changes login shells or restarts servers")
    parser.add_argument("--cache", type=Path, default=Path.home() / ".cache/huginn-shell")
    args = parser.parse_args()
    manifest = json.loads((REPO / "shell/tools.json").read_text())
    for host in args.hosts:
        platform, profile = HOSTS[host]
        available = capabilities(host) if platform else set()
        missing = sorted(set(manifest["platforms"][platform]) - available) if platform else []
        print(f"{host}: profile={profile}; user-local missing tools={','.join(missing) or 'none'}", flush=True)
        print(f"  bash ~/.local/share/huginn-shell/setup.sh --host {host} --profile {profile}", flush=True)
        if not args.apply:
            continue
        args.cache.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="huginn-shell-payload-") as temporary:
            root = Path(temporary)
            for name in ("setup.sh", "fleet.zsh", "fleet.bash", "minimal.zsh", "identity.zsh", "identity.bash"):
                (root / name).write_bytes((REPO / "shell" / name).read_bytes())
            for name in ("starship.toml", "starship-ssh.toml"):
                (root / name).write_bytes((REPO / "configs/starship" / name).read_bytes())
            (root / "bin").mkdir()
            if platform:
                for tool in missing:
                    info = manifest["platforms"][platform][tool]
                    install_binary(download(info, args.cache), tool, root / "bin" / tool, raw=(tool == "direnv"))
                for name, info in manifest["plugins"].items():
                    unpack_plugin(download(info, args.cache), root / "plugins" / name)
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode="w") as output:
                for path in root.iterdir():
                    output.add(path, arcname=path.name)
            # Payload contains only public config and verified executables; never host startup/secrets.
            stage_command = r'''set -eu
umask 077
home=$(CDPATH= cd "$HOME" && pwd -P)
parent="$home/.local/share"
root="$parent/huginn-shell"
for directory in "$home/.local" "$parent" "$root"; do
    if [ -L "$directory" ]; then printf 'Refusing symlink payload path\n' >&2; exit 1; fi
done
mkdir -p "$parent"
stage=$(mktemp -d "$parent/.huginn-shell-stage.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
tar -xf - -C "$stage"
if [ -d "$root" ]; then
    # Preserve local executables, private backups and generated startup from the
    # prior installation, without allowing archived paths to follow symlinks.
    for entry in backups zsh bashrc bin; do
        if [ -L "$root/$entry" ]; then printf 'Refusing symlink payload entry\n' >&2; exit 1; fi
    done
    if [ -d "$root/bin" ]; then
        for binary in "$root/bin/"*; do
            [ -e "$binary" ] || continue
            [ ! -L "$binary" ] || { printf 'Refusing symlink executable\n' >&2; exit 1; }
            [ -e "$stage/bin/${binary##*/}" ] || cp -p "$binary" "$stage/bin/"
        done
    fi
    for entry in backups zsh bashrc; do
        [ ! -e "$root/$entry" ] || cp -Rp "$root/$entry" "$stage/$entry"
    done
    previous=$(mktemp -d "$parent/.huginn-shell-previous.XXXXXX")
    rmdir "$previous"
    mv "$root" "$previous"
    if ! mv "$stage" "$root"; then mv "$previous" "$root"; exit 1; fi
    printf 'Previous payload retained privately at %s\n' "$previous"
else
    mv "$stage" "$root"
fi
trap - EXIT HUP INT TERM
'''
            print(ssh(host, 'bash -c ' + shlex.quote(stage_command), data=archive.getvalue(), timeout=120), end="", flush=True)
            command = 'bash "$HOME/.local/share/huginn-shell/setup.sh" --host ' + shlex.quote(host) + ' --profile ' + shlex.quote(profile)
            print(ssh(host, command), end="", flush=True)


if __name__ == "__main__":
    main()
