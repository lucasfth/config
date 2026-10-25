import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const script = path.resolve('../..', 'scripts/gimle-browser');
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gimle-helper-test-'));
  const bin = path.join(root, 'bin'); mkdirSync(bin);
  const log = path.join(root, 'ssh.log');
  writeFileSync(path.join(bin, 'ssh'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "$TEST_LOG"\ncase " $* " in\n  *' -O check '*) exit 1;;\n  *' bash -s -- '*) cat > "$TEST_REMOTE";;\nesac\n`, { mode: 0o755 });
  writeFileSync(path.join(bin, 'lsof'), '#!/bin/sh\nexit "${TEST_PORT_BUSY:-1}"\n', { mode: 0o755 });
  return { root, log, env: { ...process.env, HOME: root, PATH: `${bin}:${process.env.PATH}`, TEST_LOG: log, TEST_REMOTE: path.join(root, 'remote.sh') } };
}

test('helper defaults to diagnostic status, with strict fixed Gimle SSH and no browser start', () => {
  const f = fixture();
  try {
    const result = spawnSync('bash', [script], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(f.log, 'utf8');
    assert.match(log, /StrictHostKeyChecking=yes/);
    assert.match(log, /gimle@gimle\.tail3e4ba0\.ts\.net/);
    assert.match(log, /bash -s -- status/);
    assert.doesNotMatch(log, /-fNT|bash -s -- start|9333|freyr/i);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('explicit start uses only a loopback 9444 tunnel and dedicated remote profile', () => {
  const f = fixture();
  try {
    const result = spawnSync('bash', [script, 'start'], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(f.log, 'utf8');
    assert.match(log, /-L 127\.0\.0\.1:9444:127\.0\.0\.1:9444/);
    assert.match(log, /ExitOnForwardFailure=yes/);
    assert.doesNotMatch(log, /9333|5999|freyr|StrictHostKeyChecking=no|accept-new|-R /i);
    const remote = readFileSync(f.env.TEST_REMOTE, 'utf8');
    assert.match(remote, /huginn-browser-gimle/);
    assert.match(remote, /--remote-debugging-address=127\.0\.0\.1/);
    assert.match(remote, /--remote-debugging-port=9444/);
    assert.match(remote, /\/Applications\/Google Chrome.app/);
    assert.doesNotMatch(remote, /pkill|headless|softwareupdate|\/Default|cookie/i);
    execFileSync('bash', ['-n'], { input: remote });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('busy local port fails before remote startup; invalid action never reaches SSH', () => {
  const f = fixture();
  try {
    const result = spawnSync('bash', [script, 'start'], { env: { ...f.env, TEST_PORT_BUSY: '0' }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(readFileSync(f.log, 'utf8'), /bash -s -- start/);
    const invalid = spawnSync('bash', [script, 'surprise'], { env: f.env, encoding: 'utf8' });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /usage/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('remote stop refuses reused PID, wrong profile/port and trailing arguments', () => {
  const f = fixture();
  try {
    const source = readFileSync(script, 'utf8');
    const remote = source.split("<<'REMOTE'\n")[1].split('\nREMOTE\n')[0];
    const dir = path.join(f.root, '.local/share/huginn-browser-gimle');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'browser.pid'), '4242\n');
    writeFileSync(path.join(f.root, 'bin/ps'), '#!/bin/sh\nprintf "%s\\n" "$TEST_COMMAND"\n', { mode: 0o755 });
    const expected = `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=${dir}/profile --remote-debugging-address=127.0.0.1 --remote-debugging-port=9444 --no-first-run --no-default-browser-check about:blank`;
    for (const command of ['unrelated-process', expected.replace('/profile ', '/personal '), expected.replace('port=9444 ', 'port=94440 '), expected + ' --unexpected']) {
      const result = spawnSync('bash', ['-s', '--', 'stop'], {
        input: 'kill() { echo SIGNALLED; };\n' + remote,
        env: { ...f.env, TEST_COMMAND: command }, encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, command);
      assert.doesNotMatch(result.stdout, /SIGNALLED/, command);
    }
    const owned = spawnSync('bash', ['-s', '--', 'stop'], {
      input: 'kill() { echo SIGNALLED; };\n' + remote,
      env: { ...f.env, TEST_COMMAND: expected }, encoding: 'utf8',
    });
    assert.equal(owned.status, 0, owned.stderr);
    assert.match(owned.stdout, /SIGNALLED/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
