#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
script="$repo_root/scripts/sigyn-vnc"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/bin" "$tmpdir/home/.config/sigyn" "$tmpdir/python/vncdotool"

python3 - "$tmpdir/managed.plist" <<'PY'
import plistlib
import sys

with open(sys.argv[1], "wb") as stream:
    plistlib.dump({"FullPassword": "new-password-value"}, stream)
PY
printf '%s\n' 'stale-password-value' > "$tmpdir/home/.config/sigyn/vnc-password"
chmod 600 "$tmpdir/home/.config/sigyn/vnc-password"

cat > "$tmpdir/bin/ssh" <<'PY'
#!/usr/bin/env python3
import os
import signal
import sys
import time
from pathlib import Path

with open(os.environ["SIGYN_TEST_SSH_ARGS"], "a") as stream:
    stream.write(" ".join(sys.argv[1:]) + "\n")

if "-L" not in sys.argv:
    sys.stdout.buffer.write(Path(os.environ["SIGYN_TEST_MANAGED_PLIST"]).read_bytes())
    raise SystemExit(0)

forward = sys.argv[sys.argv.index("-L") + 1]
endpoint = forward.removesuffix(":127.0.0.1:5901")
Path(endpoint).touch()

def stop(_signum, _frame):
    raise SystemExit(0)

signal.signal(signal.SIGTERM, stop)
while True:
    time.sleep(0.05)
PY
chmod +x "$tmpdir/bin/ssh"

cat > "$tmpdir/python/vncdotool/__init__.py" <<'PY'
from . import api
PY
cat > "$tmpdir/python/vncdotool/api.py" <<'PY'
import os


class Screen:
    size = (1024, 768)


class Client:
    screen = Screen()

    def refreshScreen(self):
        _record("refresh")

    def mouseMove(self, x, y):
        _record(f"move {x} {y}")

    def mouseDown(self, button):
        _record(f"down {button}")

    def mouseUp(self, button):
        _record(f"up {button}")

    def disconnect(self):
        _record("disconnect")


def _record(event):
    with open(os.environ["SIGYN_TEST_VNC_EVENTS"], "a") as stream:
        stream.write(event + "\n")


def connect(server, password, **_kwargs):
    _record(f"connect {server} {password}")
    return Client()
PY

real_home=$HOME
export HOME="$tmpdir/home"
export UV_CACHE_DIR="$real_home/.cache/uv"
export PYTHONPATH="$tmpdir/python"
export PATH="$tmpdir/bin:$PATH"
export SIGYN_TEST_MANAGED_PLIST="$tmpdir/managed.plist"
export SIGYN_TEST_SSH_ARGS="$tmpdir/ssh-args"
export SIGYN_TEST_VNC_EVENTS="$tmpdir/vnc-events"

"$script" unlock

[[ $(cat "$HOME/.config/sigyn/vnc-password") == new-password-value ]] || {
  echo "expected the local credential cache to refresh from Sigyn" >&2
  exit 1
}
[[ $(stat -f '%Lp' "$HOME/.config/sigyn/vnc-password") == 600 ]] || {
  echo "expected the refreshed credential cache to remain mode 0600" >&2
  exit 1
}
mapfile -t ssh_calls < "$SIGYN_TEST_SSH_ARGS"
[[ ${ssh_calls[0]} == *"-o BatchMode=yes"* ]] || {
  echo "expected non-interactive SSH for credential refresh" >&2
  exit 1
}
[[ ${ssh_calls[0]} == *"-o StrictHostKeyChecking=yes"* ]] || {
  echo "expected strict host-key checking for credential refresh" >&2
  exit 1
}
[[ ${ssh_calls[0]} == *"sigyn cat /var/jb/Library/PreferenceBundles/TrollVNCPrefs.bundle/Managed.plist"* ]] || {
  echo "expected credential refresh from Sigyn's managed TrollVNC preferences" >&2
  exit 1
}
[[ ${ssh_calls[1]} == *"-L "*"/vnc.sock:127.0.0.1:5901 sigyn"* ]] || {
  echo "expected a private Unix-socket VNC tunnel" >&2
  exit 1
}
mapfile -t events < "$SIGYN_TEST_VNC_EVENTS"
[[ ${events[0]} == connect\ *\ new-pass ]] || {
  echo "expected VNC authentication with the refreshed first eight characters" >&2
  exit 1
}
[[ ${events[1]} == refresh ]] || {
  echo "expected framebuffer refresh before input" >&2
  exit 1
}
[[ ${events[2]} == "down 3" && ${events[3]} == "up 3" ]] || {
  echo "expected Home-button wake in the unlock session" >&2
  exit 1
}
[[ ${events[4]} == "move 512 720" && ${events[5]} == "down 1" ]] || {
  echo "expected unlock drag to start at bottom-center for a 1024x768 framebuffer" >&2
  exit 1
}
[[ " ${events[*]} " == *" move 512 253 "* ]] || {
  echo "expected unlock drag to end at a resolution-relative vertical position" >&2
  exit 1
}
last_index=$((${#events[@]} - 1))
[[ ${events[$((last_index - 1))]} == "up 1" && ${events[$last_index]} == disconnect ]] || {
  echo "expected the unlock drag and VNC session to finish cleanly" >&2
  exit 1
}
