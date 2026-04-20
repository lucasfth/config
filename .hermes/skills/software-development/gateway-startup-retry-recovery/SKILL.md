---
name: gateway-startup-retry-recovery
description: Debug and fix Hermes gateway startup failures where one or more platform adapters fail to connect. Distinguish retryable vs non-retryable errors, keep the gateway alive when recovery is possible, and add regression tests.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [debugging, gateway, startup, retries, regression-tests]
---

# Gateway Startup Retry Recovery

Use this skill when the gateway appears to shut down during messaging platform setup, especially after enabling Slack, Telegram, Discord, or other adapters.

## Goal

Determine whether the gateway should:
- exit cleanly,
- fail startup permanently, or
- stay alive and recover in the background.

The common bug is treating a retryable adapter failure as a fatal gateway shutdown.

## Process

### 1) Reproduce the exact startup path

Use a small live harness or the relevant test to reproduce the behavior.
Capture:
- `runner.start()` return value
- `runner.should_exit_cleanly`
- `runner.should_exit_with_failure`
- runtime status payload
- adapter fatal error code/message

### 2) Inspect the gateway startup flow

Read these areas first:
- `gateway/run.py`:
  - `GatewayRunner.start()`
  - `_handle_adapter_fatal_error()`
  - `_platform_reconnect_watcher()`
  - `start_gateway()`
  - `_create_adapter()` requirement gating
- `gateway/config.py`:
  - `get_connected_platforms()`
- `gateway/channel_directory.py`:
  - `build_channel_directory()` and `_build_slack()`
- platform adapter `connect()` implementations

Look for these distinctions:
- retryable adapter error
- non-retryable adapter error
- no platforms enabled
- all platforms failed
- connected platforms count
- adapter is connected but channel directory is empty

### 3) Decide the expected behavior

Rules of thumb:
- No platforms enabled: gateway should stay up for cron/local work.
- Retryable startup failure: gateway should stay up if recovery is possible, with the failed platform queued for reconnection.
- Non-retryable startup conflict: gateway may exit cleanly or fail startup, depending on the error contract.

### 4) Fix the root cause

Typical fixes:
- Do not return `False` from `GatewayRunner.start()` for retryable platform startup failures if the gateway can still run.
- Keep `_failed_platforms` populated so the reconnect watcher can recover.
- Ensure runtime status is updated to `running` for the gateway and `retrying` for the platform.
- Avoid calling shutdown paths that clear adapters too early.

### 5) Add or update regression tests

Add a focused test that proves:
- a retryable adapter failure does not kill the gateway
- runtime status reflects `running`
- the failed platform is marked `retrying`
- the failure reason/code is preserved

If the current tests assert the old behavior, update them to match the intended gateway lifecycle.

### 6) Verify with a live repro

When possible, run a minimal Python harness that:
- builds a `GatewayRunner`
- injects a fake adapter
- forces a retryable failure
- prints the resulting state

This catches state-machine mistakes that unit tests can miss.

## Useful checks

- `runner.adapters` should retain any successfully connected platforms
- `read_runtime_status()` should show the gateway as `running` if it is alive
- `_failed_platforms` should contain retryable failures
- `start_gateway()` should only return `False` when the gateway truly cannot continue

## Pitfalls

- Do not confuse startup failure with shutdown failure.
- Do not treat every adapter error as fatal.
- Do not fix only the Slack code if the actual bug is in shared gateway control flow.
- Do not leave tests asserting a dead gateway when the intended behavior is recovery.

## Example outcome

A Slack token or app-token problem may still be retryable depending on the adapter contract. If the gateway can continue serving cron/local work, keep it alive and let the reconnect watcher handle recovery instead of exiting the whole process.
