#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
script="$repo_root/scripts/sigyn-screen"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/bin"

python3 - "$tmpdir/managed.plist" <<'PY'
import plistlib
import sys

with open(sys.argv[1], "wb") as stream:
    plistlib.dump({"FullPassword": "new-password-value"}, stream)
PY

cat > "$tmpdir/bin/ssh" <<'EOF'
#!/usr/bin/env python3
import os
import signal
import socket
import sys
import time

arguments = " ".join(sys.argv[1:])
with open(os.environ["SIGYN_TEST_SSH_ARGS"], "a") as stream:
    stream.write(arguments + "\n")

if arguments.endswith(
    "sigyn cat /var/jb/Library/PreferenceBundles/TrollVNCPrefs.bundle/Managed.plist"
):
    with open(os.environ["SIGYN_TEST_MANAGED_PLIST"], "rb") as stream:
        sys.stdout.buffer.write(stream.read())
    sys.exit(0)

forward = sys.argv[sys.argv.index("-L") + 1]
port = int(forward.split(":")[1])
listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listener.bind(("127.0.0.1", port))
listener.listen()
open(os.environ["SIGYN_TEST_STARTED"], "w").close()


def stop(_signum, _frame):
    with open(os.environ["SIGYN_TEST_TERMINATED"], "w") as stream:
        stream.write("terminated")
    sys.exit(0)


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
while True:
    time.sleep(0.05)
EOF
cat > "$tmpdir/bin/security" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  find-internet-password)
    exit 44
    ;;
  add-internet-password)
    (
      IFS='|'
      printf '%s\n' "$*"
    ) > "$SIGYN_TEST_KEYCHAIN_ARGS"
    cat > "$SIGYN_TEST_KEYCHAIN_INPUT"
    ;;
  *)
    exit 2
    ;;
esac
EOF
mkdir -p "$tmpdir/python/vncdotool"
cat > "$tmpdir/python/vncdotool/__init__.py" <<'EOF'
from . import api
EOF
cat > "$tmpdir/python/vncdotool/api.py" <<'EOF'
import os


class Screen:
    size = (1024, 768)


class Client:
    screen = Screen()

    def refreshScreen(self):
        pass

    def mouseMove(self, x, y):
        with open(os.environ["SIGYN_TEST_MOUSE_MOVES"], "a") as stream:
            stream.write(f"{x},{y}\n")

    def mouseDown(self, _button):
        pass

    def mouseUp(self, _button):
        pass

    def disconnect(self):
        pass


def connect(server, **_kwargs):
    with open(os.environ["SIGYN_TEST_VNC_ENDPOINT"], "w") as stream:
        stream.write(server)
    return Client()
EOF
cat > "$tmpdir/bin/open" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
test -f "$SIGYN_TEST_STARTED"
test ! -f "$SIGYN_TEST_TERMINATED"
printf '%s\n' "$*" > "$SIGYN_TEST_OPEN_ARGS"
EOF
chmod +x "$tmpdir/bin/ssh" "$tmpdir/bin/open" "$tmpdir/bin/security"

real_home=$HOME
export HOME="$tmpdir/home"
export UV_CACHE_DIR="$real_home/.cache/uv"
export PYTHONPATH="$tmpdir/python"
mkdir -p "$HOME/.config/sigyn"
printf '%s\n' 'stale-password-value' > "$HOME/.config/sigyn/vnc-password"
chmod 600 "$HOME/.config/sigyn/vnc-password"
export PATH="$tmpdir/bin:$PATH"
export SIGYN_TEST_SSH_ARGS="$tmpdir/ssh-args"
export SIGYN_TEST_OPEN_ARGS="$tmpdir/open-args"
export SIGYN_TEST_STARTED="$tmpdir/started"
export SIGYN_TEST_TERMINATED="$tmpdir/terminated"
export SIGYN_TEST_KEYCHAIN_ARGS="$tmpdir/keychain-args"
export SIGYN_TEST_KEYCHAIN_INPUT="$tmpdir/keychain-input"
export SIGYN_TEST_VNC_ENDPOINT="$tmpdir/vnc-endpoint"
export SIGYN_TEST_MOUSE_MOVES="$tmpdir/mouse-moves"
export SIGYN_TEST_MANAGED_PLIST="$tmpdir/managed.plist"

"$script"

mapfile -t ssh_calls < "$SIGYN_TEST_SSH_ARGS"
[[ ${ssh_calls[0]} == *"-o BatchMode=yes"* ]] || {
  echo "expected non-interactive authentication for credential refresh, got: ${ssh_calls[0]}" >&2
  exit 1
}
[[ ${ssh_calls[0]} == *"sigyn cat /var/jb/Library/PreferenceBundles/TrollVNCPrefs.bundle/Managed.plist"* ]] || {
  echo "expected the managed TrollVNC credential to refresh before opening Screen Sharing" >&2
  exit 1
}
ssh_args=${ssh_calls[1]}
open_args=$(cat "$SIGYN_TEST_OPEN_ARGS")
[[ $ssh_args == *"-L 127.0.0.1:5901:127.0.0.1:5901"* ]] || {
  echo "expected the stable loopback VNC forward, got: $ssh_args" >&2
  exit 1
}
[[ $ssh_args == *"-o BatchMode=yes"* ]] || {
  echo "expected non-interactive SSH authentication, got: $ssh_args" >&2
  exit 1
}
[[ $ssh_args == *"-o StrictHostKeyChecking=yes"* ]] || {
  echo "expected strict SSH host verification, got: $ssh_args" >&2
  exit 1
}
[[ $ssh_args == *"-o ExitOnForwardFailure=yes"* ]] || {
  echo "expected forwarding failure detection, got: $ssh_args" >&2
  exit 1
}
[[ $ssh_args == *" sigyn" ]] || {
  echo "expected the sigyn SSH host, got: $ssh_args" >&2
  exit 1
}
[[ $open_args == "-W -n vnc://VNC@127.0.0.1:5901" ]] || {
  echo "expected Screen Sharing's VNC account with the native loopback Keychain endpoint, got: $open_args" >&2
  exit 1
}
keychain_args=$(cat "$SIGYN_TEST_KEYCHAIN_ARGS")
[[ $keychain_args == *"add-internet-password|-a||-s|127.0.0.1:5901|-r|vnc "* ]] || {
  echo "expected Screen Sharing's native VNC Keychain item, got: $keychain_args" >&2
  exit 1
}
[[ $keychain_args == *"|-U|-w" ]] || {
  echo "expected the native VNC Keychain item to update after credential rotation" >&2
  exit 1
}
[[ $keychain_args != *"new-password-value"* ]] || {
  echo "VNC password leaked into Keychain command arguments" >&2
  exit 1
}
[[ $(cat "$SIGYN_TEST_KEYCHAIN_INPUT") == $'new-pass\nnew-pass' ]] || {
  echo "expected the refreshed VNC password to reach Keychain only through stdin" >&2
  exit 1
}
[[ $(cat "$HOME/.config/sigyn/vnc-password") == new-password-value ]] || {
  echo "expected the local VNC credential cache to refresh" >&2
  exit 1
}
[[ $(stat -f '%Lp' "$HOME/.config/sigyn/vnc-password") == 600 ]] || {
  echo "expected the refreshed VNC credential cache to remain mode 0600" >&2
  exit 1
}
[[ $(cat "$SIGYN_TEST_VNC_ENDPOINT") == "127.0.0.1::5901" ]] || {
  echo "expected vncdotool to use TCP port 5901, got: $(cat "$SIGYN_TEST_VNC_ENDPOINT")" >&2
  exit 1
}
mapfile -t mouse_moves < "$SIGYN_TEST_MOUSE_MOVES"
[[ ${mouse_moves[0]} == "512,720" ]] || {
  echo "expected unlock drag to start at 93.75% framebuffer height" >&2
  exit 1
}
[[ ${mouse_moves[-1]} == "512,253" ]] || {
  echo "expected unlock drag to end near one-third framebuffer height" >&2
  exit 1
}
[[ $(cat "$SIGYN_TEST_TERMINATED") == terminated ]] || {
  echo "expected the SSH tunnel to stop after Screen Sharing exits" >&2
  exit 1
}

cat > "$tmpdir/bin/ssh" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *" cat /var/jb/Library/PreferenceBundles/TrollVNCPrefs.bundle/Managed.plist" ]]; then
  cat "$SIGYN_TEST_MANAGED_PLIST"
  exit 0
fi
exit 12
EOF
chmod +x "$tmpdir/bin/ssh"
rm -f "$SIGYN_TEST_OPEN_ARGS"

set +e
failure_output=$("$script" 2>&1)
failure_status=$?
set -e
[[ $failure_status -ne 0 ]] || {
  echo "expected tunnel startup failure to fail the command" >&2
  exit 1
}
[[ ! -e $SIGYN_TEST_OPEN_ARGS ]] || {
  echo "Screen Sharing opened despite tunnel startup failure" >&2
  exit 1
}
[[ $failure_output == *"SSH tunnel failed to start"* ]] || {
  echo "expected a useful tunnel failure, got: $failure_output" >&2
  exit 1
}
