#!/usr/bin/env python3
"""Pull and restore Muninn without discarding local notes or opening Obsidian."""
import argparse
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile


class RefreshError(Exception):
    pass


def run(*args, capture=False):
    result = subprocess.run([str(arg) for arg in args], check=True,
                            stdout=subprocess.PIPE if capture else None,
                            text=capture)
    return result.stdout.strip() if capture else None


def require_closed_obsidian():
    result = subprocess.run(["pgrep", "-x", "Obsidian"], stdout=subprocess.DEVNULL)
    if result.returncode == 0:
        raise RefreshError("Quit Obsidian before running muninn-refresh. No app will be opened or closed for you.")
    if result.returncode != 1:
        raise RefreshError("Cannot determine whether Obsidian is running; refusing refresh.")


def manifest(root):
    """Hash snapshot content, excluding Obsidian settings and Finder metadata."""
    files = {}
    for directory, dirs, names in os.walk(root, followlinks=False):
        relative = Path(directory).relative_to(root)
        if relative == Path("."):
            dirs[:] = [name for name in dirs if name != ".obsidian"]
        for name in dirs + names:
            path = Path(directory) / name
            if path.is_symlink():
                raise RefreshError(f"Snapshot contains a symlink: {path.relative_to(root)}")
        for name in names:
            path = Path(directory) / name
            if not path.is_file():
                raise RefreshError(f"Snapshot contains a non-regular file: {path.relative_to(root)}")
            if name == ".DS_Store":
                continue
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            files[path.relative_to(root).as_posix()] = digest.hexdigest()
    return files


def without_finder_metadata(files):
    return {name: digest for name, digest in files.items() if Path(name).name != ".DS_Store"}


def check_local(current, expected):
    expected = without_finder_metadata(expected)
    if current == expected:
        return
    changed = sorted(name for name in current.keys() | expected.keys()
                     if current.get(name) != expected.get(name))
    sample = ", ".join(changed[:5])
    raise RefreshError(f"Unreconciled local files ({len(changed)}): {sample}. Current vault was not replaced. Reconcile through Muninn MCP first; never seal or push this snapshot.")


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def recover_pending(home):
    state = home / ".local/state/muninn"
    pending = state / "pending.json"
    if not pending.exists():
        return
    transaction = json.loads(pending.read_text())
    volume = home / ".local/share/muninn-volume"
    vault = volume / "vault"
    backup = Path(transaction["backup"])
    destination = Path(transaction["destination"])
    if backup.parent != volume or not backup.name.startswith("vault-before-refresh-") or destination.parent.parent != volume:
        raise RefreshError("Invalid pending refresh paths; refusing recovery.")
    if not vault.exists():
        if not backup.is_dir():
            raise RefreshError("Interrupted refresh has no current or previous vault; recover the preserved snapshot manually.")
        backup.rename(vault)
        pending.unlink()
        print("Recovered previous readable vault after interrupted refresh.")
    elif not destination.exists() and backup.is_dir():
        check_local(manifest(vault), transaction["receipt"]["files"])
        write_json(state / "refresh.json", transaction["receipt"])
        pending.unlink()
        print("Completed the receipt for an already-switched snapshot.")
    elif destination.exists() and not backup.exists():
        pending.unlink()
    else:
        raise RefreshError("Pending refresh state is ambiguous; preserved snapshots were not changed.")


def mount_volume(home):
    volume = home / ".local/share/muninn-volume"
    if not (volume / "vault").is_dir():
        image = home / ".local/share/muninn/readable.sparsebundle"
        if not image.is_dir():
            raise RefreshError(f"Existing readable image is missing: {image}")
        volume.mkdir(parents=True, exist_ok=True)
        run("hdiutil", "attach", image, "-mountpoint", volume, "-nobrowse")
    result = subprocess.run(["diskutil", "info", "-plist", str(volume)],
                            check=True, stdout=subprocess.PIPE)
    info = plistlib.loads(result.stdout)
    filesystem = str(info.get("FilesystemName", "")).lower()
    if "case-sensitive" not in filesystem or "apfs" not in filesystem or Path(info.get("MountPoint", "/")) != volume:
        raise RefreshError("Readable destination must be the mounted case-sensitive APFS image; refusing restore on another filesystem.")
    return volume


def require_restore_space(home, volume, vault):
    # Salt's index is encrypted: the current plaintext size is only an estimate.
    # Allow twice that size plus 1 GiB; a much larger incoming vault can still exceed it.
    size = sum((Path(directory) / name).stat().st_size
               for directory, _, names in os.walk(vault) for name in names)
    required = 2 * size + 1024 ** 3
    for path in (volume, home):
        free = shutil.disk_usage(path).free
        if free < required:
            raise RefreshError(
                f"Not enough free space on {path}: {free / 1024**3:.1f} GiB free; "
                f"estimated restore headroom {required / 1024**3:.1f} GiB. "
                "Current vault and all rollback snapshots are preserved. "
                "Grow the readable sparsebundle if its volume is full, or free space on the Mac if its disk is full. "
                "See README.md: Salt / Muninn backups. No snapshots are deleted automatically.")
    print(f"Restore space check passed (estimated headroom {required / 1024**3:.1f} GiB).", flush=True)


def require_trusted(repo):
    # Salt restore verifies signatures but only warns if the signer set is unpinned.
    # Doctor is read-only; require its explicit approval match, not just exit status.
    result = subprocess.run(["salt", "doctor", str(repo)], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    diagnostics = (result.stdout + "\n" + result.stderr).splitlines()
    if not any(line.strip() == "✓ keys and settings match what you approved" for line in diagnostics):
        raise RefreshError("Salt keys/settings are not explicitly approved on this Mac. Inspect the expected recipients, then run `salt trust ~/muninn` yourself. This command never approves keys automatically.")


def refresh(home, reconciled=()):
    require_closed_obsidian()
    recover_pending(home)
    repo = home / "muninn"
    if not (repo / ".git").exists():
        raise RefreshError(f"Encrypted Git checkout is missing: {repo}")
    if run("git", "-C", repo, "status", "--porcelain", "--untracked-files=no", capture=True):
        raise RefreshError("Encrypted checkout has tracked local changes. Preserve/reconcile them first; nothing will be reset or staged.")
    require_trusted(repo)
    volume = mount_volume(home)
    vault = volume / "vault"
    if vault.is_symlink() or not vault.is_dir():
        raise RefreshError("Expected an existing readable vault directory on the mounted image.")
    receipt_path = home / ".local/state/muninn/refresh.json"
    current = manifest(vault)
    if receipt_path.exists():
        try:
            receipt = json.loads(receipt_path.read_text())
            expected = receipt["files"]
            if not isinstance(expected, dict):
                raise ValueError("invalid manifest")
            # Apply the new comparison scope in memory; never rewrite old receipts.
            receipt["files"] = expected = without_finder_metadata(expected)
        except (ValueError, KeyError) as error:
            raise RefreshError("Refresh receipt is invalid; preserve it and reconcile the baseline before replacing notes.") from error
        for name in reconciled:
            if name not in current:
                raise RefreshError(f"Reconciled path is not a snapshot file: {name}")
        # Defer only explicitly named edits; incoming bytes must verify them below.
        check_local(current, expected | {name: current[name] for name in reconciled})
    else:
        if reconciled:
            raise RefreshError("Reconciliation requires an existing refresh receipt.")
        # Establish the existing snapshot's provenance before pulling a new commit.
        previous_commit = run("git", "-C", repo, "rev-parse", "HEAD", capture=True)
        require_restore_space(home, volume, vault)
        with tempfile.TemporaryDirectory(prefix="muninn-baseline-", dir=volume) as temp:
            baseline = Path(temp) / "readable"
            run("salt", "restore", repo, "--to", baseline)
            check_local(current, manifest(baseline))
        receipt = {"commit": previous_commit, "files": current}
        write_json(receipt_path, receipt)
    run("git", "-C", repo, "pull", "--ff-only")
    require_trusted(repo)
    commit = run("git", "-C", repo, "rev-parse", "HEAD", capture=True)
    if receipt.get("commit") == commit and current == receipt["files"]:
        print(f"Muninn already current at {commit[:12]} ({len(current)} files); no restore or duplicate rollback needed.")
        return
    require_restore_space(home, volume, vault)
    with tempfile.TemporaryDirectory(prefix="muninn-refresh-", dir=volume) as temp:
        destination = Path(temp) / "vault"
        # Salt verifies the signed index and every restored file; never bypass signatures.
        run("salt", "restore", repo, "--to", destination)
        restored = manifest(destination)
        if not restored:
            raise RefreshError("Restored snapshot is empty; refusing replacement.")
        for name in reconciled:
            if current[name] != restored.get(name):
                raise RefreshError(f"Reconciled file does not match the verified incoming snapshot: {name}. Current vault and receipt were not changed.")
        require_closed_obsidian()
        check_local(manifest(vault), current)
        settings = vault / ".obsidian"
        if settings.exists():
            restored_settings = destination / ".obsidian"
            if restored_settings.is_dir():
                shutil.rmtree(restored_settings)
            elif restored_settings.exists():
                raise RefreshError("Restored .obsidian is not a directory.")
            shutil.copytree(settings, restored_settings, symlinks=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        backup = volume / ("vault-before-refresh-" + stamp)
        receipt = {"commit": commit, "files": restored, "previous_snapshot": str(backup)}
        if reconciled:
            receipt["reconciled_files"] = {name: current[name] for name in reconciled}
        pending = receipt_path.parent / "pending.json"
        write_json(pending, {"backup": str(backup), "destination": str(destination), "receipt": receipt})
        vault.rename(backup)
        try:
            destination.rename(vault)
        except BaseException:
            backup.rename(vault)
            pending.unlink()
            raise
        write_json(receipt_path, receipt)
        pending.unlink()
        print(f"Muninn refreshed to {commit[:12]} ({len(restored)} files).")
        print(f"Readable vault: {vault}")
        print(f"Previous snapshot preserved: {backup}")
        print("Obsidian was not opened. This is the latest published backup, not bidirectional MCP sync.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, epilog="Quit Obsidian first. Uses Salt's saved Keychain key or its interactive prompt; never seals, pushes, or discards local notes.")
    parser.add_argument("--reconciled", action="append", default=[], metavar="PATH",
                        help="MCP-reconciled vault-relative file; must exactly match the verified incoming backup (repeatable)")
    arguments = parser.parse_args()
    for name in arguments.reconciled:
        path = Path(name)
        if not name or path.is_absolute() or ".." in path.parts or path.as_posix() != name:
            parser.error("--reconciled requires a normalized vault-relative file path")
    if sys.platform != "darwin":
        raise RefreshError("muninn-refresh is a macOS command.")
    os.umask(0o077)
    state = Path.home() / ".local/state/muninn"
    state.mkdir(parents=True, exist_ok=True)
    with (state / "refresh.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RefreshError("Another muninn-refresh is running.") from error
        refresh(Path.home(), arguments.reconciled)


if __name__ == "__main__":
    try:
        main()
    except (RefreshError, OSError, subprocess.CalledProcessError) as error:
        print(f"muninn-refresh: {error}", file=sys.stderr)
        sys.exit(1)
