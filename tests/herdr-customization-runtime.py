#!/usr/bin/env python3
"""Disposable Herdr/Pi acceptance test; requires built plugin directories and Pi deps."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shlex
import shutil
import socket
import struct
import subprocess
import tempfile
import termios
import time

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--herdr", required=True)
parser.add_argument("--omni", required=True)
parser.add_argument("--rename", required=True)
args = parser.parse_args()
node = shutil.which("node")
assert node, "Node and configs/pi npm dependencies are required"


def until(probe, label):
    for _ in range(120):
        value = probe()
        if value:
            return value
        time.sleep(0.1)
    raise AssertionError(label)


with tempfile.TemporaryDirectory(prefix="herdr-custom-", dir="/tmp") as tmp:
    base = Path(tmp)
    home, config, state = (base / name for name in ("home", "config", "state"))
    for directory in (home, config / "herdr", config / "herdr-automatic-rename", state):
        directory.mkdir(parents=True, exist_ok=True)
    (config / "herdr/config.toml").write_text(
        (ROOT / "configs/herdr/config.toml").read_text().replace('default_shell = "zsh"', 'default_shell = "/bin/zsh"'))
    (config / "herdr-automatic-rename/config.sh").write_bytes((ROOT / "configs/herdr/automatic-rename.sh").read_bytes())
    (home / ".zshrc").write_text(
        f"source {shlex.quote(str(Path(args.rename) / 'shell/hook.zsh'))}\n"
        f"touch {shlex.quote(str(base / 'shell-ready'))}\n")
    env = {key: value for key, value in os.environ.items() if not key.startswith(("HERDR_", "XDG_", "PI_"))}
    env.update(HOME=str(home), XDG_CONFIG_HOME=str(config), XDG_STATE_HOME=str(state),
               HERDR_CONFIG_PATH=str(config / "herdr/config.toml"), HERDR_SOCKET_PATH=str(base / "api.sock"),
               HERDR_BIN_PATH=args.herdr, TERM="xterm-256color", PI_OFFLINE="1", PI_TELEMETRY="0",
               PI_CODING_AGENT_DIR=str(base / "agent"), NEO_PROXY_URL="http://127.0.0.1:9/v1",
               NEO_PROXY_API_KEY="synthetic", MUNINN_MCP_TOKEN="synthetic")

    def cli(*argv):
        result = subprocess.run([args.herdr, *argv], env=env, capture_output=True, text=True, timeout=15, check=True)
        return json.loads(result.stdout)["result"] if result.stdout.startswith("{") else result.stdout

    def api(method):
        with socket.socket(socket.AF_UNIX) as connection:
            connection.settimeout(4)
            connection.connect(env["HERDR_SOCKET_PATH"])
            connection.sendall((json.dumps({"id": method, "method": method, "params": {}}) + "\n").encode())
            data = b""
            while b"\n" not in data:
                chunk = connection.recv(65536)
                assert chunk, "Herdr closed API connection without a reply"
                data += chunk
            reply = json.loads(data.split(b"\n")[0])
            assert "error" not in reply, reply
            return reply["result"]

    def label(tab):
        return next(row["label"] for row in cli("tab", "list")["tabs"] if row["tab_id"] == tab)

    for plugin in (args.omni, args.rename):
        linked = cli("plugin", "link", plugin)["plugin"]
        assert not linked.get("warnings"), linked
        assert not any(event["on"] == "pane.updated" for event in linked.get("events", []))

    server = client = None
    master = None
    with (base / "server.log").open("w") as log:
        try:
            server = subprocess.Popen([args.herdr, "server"], env=env, cwd=home, stdout=log, stderr=log)
            until(lambda: (base / "api.sock").exists(), "isolated server readiness")
            created = cli("workspace", "create", "--label", "picker-proof", "--cwd", str(home))
            pane, tab = created["root_pane"]["pane_id"], created["tab"]["tab_id"]
            until(lambda: "zsh" in label(tab), "automatic shell title")
            until(lambda: (base / "shell-ready").exists(), "Zsh preexec hook loaded before sending a command")
            cli("pane", "run", pane, "sleep 60")
            until(lambda: "sleep" in label(tab), "automatic foreground-program title")
            cli("tab", "rename", tab, "Manual keeper")
            cli("pane", "send-keys", pane, "ctrl+c")
            time.sleep(1)
            assert label(tab) == "Manual keeper", "manual title overwritten on command exit"
            cli("plugin", "action", "invoke", "herdr-automatic-rename.reset")
            until(lambda: "zsh" in label(tab), "reset returns title ownership")

            # Real offline Pi through the managed launcher, never a live profile or model call.
            runtime = (ROOT / "configs/pi/runtime.mjs").as_uri()
            setup = f"""import {{prepareRuntime}} from {json.dumps(runtime)};
import {{readFile,writeFile}} from 'node:fs/promises';
const dir=process.env.PI_CODING_AGENT_DIR;
await prepareRuntime({{agentDir:dir,env:process.env}});
const s=JSON.parse(await readFile(dir+'/settings.json'));
Object.assign(s,{{extensions:[],packages:[],skills:[]}});
await writeFile(dir+'/settings.json',JSON.stringify(s));
await writeFile(dir+'/mcp.json','{{"mcpServers":{{}}}}');"""
            subprocess.run([node, "--input-type=module", "-e", setup], env=env, check=True, capture_output=True)
            fixture = base / "fixture.ts"
            fixture.write_text("""export default pi => {
  pi.on('session_start', () => pi.setSessionName('Initial integration'));
  pi.registerCommand('fixture-title', {handler: async () => pi.setSessionName('Renamed integration')});
};""")
            command = [node, str(ROOT / "configs/pi/launch.mjs"), "--offline", "--no-mcp", "--no-context-files",
                       "--approve", "--no-extensions", "-e", str(ROOT / "configs/pi/extensions/herdr-presentation.ts"), "-e", str(fixture)]
            cli("pane", "run", pane, shlex.join(command))
            until(lambda: "Initial integration" in label(tab), "initial Pi task tab title")
            cli("pane", "run", pane, "/fixture-title")
            until(lambda: any("Renamed integration" in row.get("terminal_title", "")
                              for row in api("session.snapshot")["snapshot"]["agents"]), "Pi terminal title rename")
            # Upstream has no title-change hook: switching tabs triggers supported reconciliation.
            cli("tab", "create", "--cwd", str(home), "--focus")
            cli("tab", "focus", tab)
            until(lambda: "Renamed integration" in label(tab), "Pi renamed tab after refocus")
            target = cli("workspace", "create", "--label", "jump-target", "--cwd", str(home))["workspace"]["workspace_id"]
            cli("workspace", "focus", created["workspace"]["workspace_id"])

            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 140, 0, 0))
            client = subprocess.Popen([args.herdr], env=env, cwd=home, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
            os.close(slave)
            transcript = bytearray()
            render = """const {Terminal}=require(process.argv[1]);const fs=require('fs');
const t=new Terminal({cols:140,rows:45,allowProposedApi:true});
t.write(fs.readFileSync(process.argv[2],'utf8'),()=>{
for(let i=0;i<t.buffer.active.length;i++)console.log(t.buffer.active.getLine(i).translateToString(true));});"""

            def screen():
                # Render the actual attached consumer's output; popup panes are absent from pane.list.
                end = time.monotonic() + 0.3
                while time.monotonic() < end:
                    if select.select([master], [], [], 0.05)[0]:
                        transcript.extend(os.read(master, 65536))
                path = base / "terminal.ansi"
                path.write_bytes(transcript)
                return subprocess.run([node, "-e", render, str(ROOT / "configs/pi/node_modules/@xterm/headless"), str(path)],
                                      capture_output=True, text=True, check=True).stdout

            until(lambda: "spaces" in screen(), "attached client ready")
            os.write(master, b"\x02g")
            until(lambda: "Herdr Omni" in screen() and "Renamed integration" in screen(), "picker shortcut and live Pi result")
            os.write(master, b"jump-target")
            until(lambda: "[All] (2)" in screen(), "fuzzy query filters workspace and its tab")
            before_selection = api("session.snapshot")["snapshot"]["focused_workspace_id"]
            assert before_selection != target, "selection target must differ from current workspace"
            os.write(master, b"\r")
            until(lambda: api("session.snapshot")["snapshot"]["focused_workspace_id"] == target, "selection focuses different workspace")
            until(lambda: "Herdr Omni" not in screen(), "popup closes after selection")
            snapshot = api("session.snapshot")["snapshot"]
            assert len(snapshot["panes"]) == 3 and len(snapshot["tabs"]) == 3, "picker changed tiled layout"
            print("PASS: pinned plugins, shell/program/Pi titles, manual preservation/reset, refocus refresh, prefix+g popup, live Pi search, filtered selection and layout preservation")
        finally:
            if client:
                client.terminate()
                client.wait(timeout=5)
            if master is not None:
                os.close(master)
            if server:
                try:
                    cli("server", "stop")
                finally:
                    server.wait(timeout=10)
