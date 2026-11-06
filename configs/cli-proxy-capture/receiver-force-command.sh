#!/usr/bin/env bash
set -euo pipefail
# Install this file under a versioned path; authorized_keys forces this wrapper.
# The original requested command is compared, never eval'd or executed.
expected='/home/lucas/.local/lib/cli-proxy-capture/current/trainingarchive receive --root /home/lucas/data/cli-proxy-training'
if [[ ${SSH_ORIGINAL_COMMAND:-} != "$expected" ]]; then
  printf 'Capture receiver: command refused\n' >&2
  exit 64
fi
exec /home/lucas/.local/lib/cli-proxy-capture/current/trainingarchive receive --root /home/lucas/data/cli-proxy-training
