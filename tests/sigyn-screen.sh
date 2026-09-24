#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
script="$repo_root/scripts/sigyn-screen"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/bin"

cat > "$tmpdir/bin/ssh" <<'EOF'
#!/usr/bin/env python3
import os
import signal
import socket
import sys
import time

arguments = " ".join(sys.argv[1:])
with open(os.environ["SIGYN_TEST_SSH_ARGS"], "w") as stream:
    stream.write(arguments + "\n")
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
cat > "$tmpdir/bin/open" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
test -f "$SIGYN_TEST_STARTED"
test ! -f "$SIGYN_TEST_TERMINATED"
printf '%s\n' "$*" > "$SIGYN_TEST_OPEN_ARGS"
EOF
chmod +x "$tmpdir/bin/ssh" "$tmpdir/bin/open"

export PATH="$tmpdir/bin:$PATH"
export SIGYN_TEST_SSH_ARGS="$tmpdir/ssh-args"
export SIGYN_TEST_OPEN_ARGS="$tmpdir/open-args"
export SIGYN_TEST_STARTED="$tmpdir/started"
export SIGYN_TEST_TERMINATED="$tmpdir/terminated"

"$script"

ssh_args=$(cat "$SIGYN_TEST_SSH_ARGS")
open_args=$(cat "$SIGYN_TEST_OPEN_ARGS")
[[ $ssh_args =~ -L\ 127\.0\.0\.1:([0-9]+):127\.0\.0\.1:5901 ]] || {
  echo "expected a dynamic loopback VNC forward, got: $ssh_args" >&2
  exit 1
}
port=${BASH_REMATCH[1]}
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
[[ $open_args == "-W -n vnc://127.0.0.1:$port" ]] || {
  echo "expected an isolated native Screen Sharing session, got: $open_args" >&2
  exit 1
}
[[ $(cat "$SIGYN_TEST_TERMINATED") == terminated ]] || {
  echo "expected the SSH tunnel to stop after Screen Sharing exits" >&2
  exit 1
}

cat > "$tmpdir/bin/ssh" <<'EOF'
#!/usr/bin/env bash
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
