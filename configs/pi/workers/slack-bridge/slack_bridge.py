#!/usr/bin/env python3
"""Slack MCP bridge over the Nous connector gateway (stdio, JSON-RPC), read and write.

Runs on Gimle with HERMES_HOME=~/.hermes-pi-bridge, a Nous session separate from
Loki's. Tokens are read only through Hermes's own read_nous_access_token; this
file never refreshes or stores credentials. Only the slack connector is reachable,
and only tool names matching SLACK_*. Writes act as Lucas's Slack identity.
"""
import json
import os
import re
import sys

HERMES_SRC = os.environ.get(
    "HERMES_SRC",
    "/Users/gimle/loki-data/live/update-staging-20261118-v0.23.2/hermes-loki-v0.23.2",
)
sys.path.insert(0, HERMES_SRC)

import requests  # noqa: E402
from tools.managed_tool_gateway import build_vendor_gateway_url, read_nous_access_token  # noqa: E402

TOOL_RE = re.compile(r"^SLACK_[A-Z_]+$")

# name: (slack tool or None, description, properties, required)
TOOLS = {
    "slack_list_channels": ("SLACK_LIST_ALL_CHANNELS", "List Slack channels the account can see.",
                            {"limit": {"type": "integer"}, "cursor": {"type": "string"}}, []),
    "slack_channel_history": ("SLACK_FETCH_CONVERSATION_HISTORY", "Read recent messages in a channel.",
                              {"channel": {"type": "string", "description": "Channel ID"},
                               "limit": {"type": "integer"}, "oldest": {"type": "string"},
                               "latest": {"type": "string"}}, ["channel"]),
    "slack_search_messages": ("SLACK_SEARCH_MESSAGES", "Search Slack messages.",
                              {"query": {"type": "string"}, "count": {"type": "integer"}}, ["query"]),
    "slack_send_message": ("SLACK_SEND_MESSAGE",
                           "Post a message to a channel or DM as Lucas. Visible to others immediately.",
                           {"channel": {"type": "string", "description": "Channel or DM ID"},
                            "text": {"type": "string"},
                            "thread_ts": {"type": "string", "description": "Reply in this thread"}},
                           ["channel", "text"]),
    "slack_call": (None,
                   "Run any Slack connector tool by name (SLACK_*), for example SLACK_UPDATES_A_SLACK_MESSAGE, "
                   "SLACK_ADD_REACTION_TO_AN_ITEM, SLACK_CREATE_CHANNEL, SLACK_OPEN_DM, SLACK_FIND_USERS, "
                   "SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK. Use slack_search_tools to see argument schemas. "
                   "Write tools act as Lucas.",
                   {"tool": {"type": "string", "description": "Exact SLACK_* tool name"},
                    "arguments": {"type": "object"}}, ["tool"]),
    "slack_search_tools": (None,
                           "Find Slack connector tools and their argument schemas for a plain-language use case.",
                           {"use_case": {"type": "string"}}, ["use_case"]),
}


def _headers(token):
    return {"Authorization": "Bearer " + token, "User-Agent": "hermes-agent/pi-slack-bridge"}


def _post(path, payload):
    token = read_nous_access_token()
    if not token:
        return {"error": "no Nous token; re-run hermes auth add nous with the bridge HERMES_HOME"}, True
    r = requests.post(build_vendor_gateway_url("connector") + path, json=payload,
                      headers=_headers(token), timeout=60)
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:2000]}
    return body, r.status_code >= 400


def execute(tool, arguments):
    body, is_error = _post("/v1/connectors/execute",
                           {"tools": [{"connector": "slack", "tool": tool, "arguments": arguments}]})
    # The gateway can return HTTP 200 with a failed provider call inside.
    try:
        for res in body.get("results", []):
            data = res.get("data") or {}
            if res.get("error") or data.get("successful") is False:
                is_error = True
    except AttributeError:
        pass
    return body, is_error


def call_tool(name, args):
    if name == "slack_send_message":
        args = dict(args)
        if "text" in args:
            args["markdown_text"] = args.pop("text")
    if name == "slack_search_tools":
        return _post("/v1/connectors/search", {"queries": [{"useCase": args.get("use_case", "")}]})
    if name == "slack_call":
        tool = args.get("tool", "")
        if not TOOL_RE.match(tool):
            return {"error": "tool must match SLACK_*"}, True
        return execute(tool, args.get("arguments") or {})
    return execute(TOOLS[name][0], args)


def reply(msg_id, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": msg_id}
    msg.update({"error": error} if error else {"result": result})
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def handle(req):
    method, msg_id, params = req.get("method"), req.get("id"), req.get("params") or {}
    if method == "initialize":
        reply(msg_id, {"protocolVersion": params.get("protocolVersion", "2024-11-05"),
                       "capabilities": {"tools": {}},
                       "serverInfo": {"name": "slack-bridge", "version": "0.2.0"}})
    elif method == "tools/list":
        reply(msg_id, {"tools": [
            {"name": n, "description": d,
             "inputSchema": {"type": "object", "properties": p, "required": r}}
            for n, (_, d, p, r) in TOOLS.items()]})
    elif method == "tools/call":
        name = params.get("name")
        if name not in TOOLS:
            reply(msg_id, error={"code": -32602, "message": "unknown tool " + str(name)})
            return
        body, is_error = call_tool(name, params.get("arguments") or {})
        reply(msg_id, {"content": [{"type": "text", "text": json.dumps(body)[:60000]}], "isError": is_error})
    elif msg_id is not None:
        reply(msg_id, error={"code": -32601, "message": "method not found"})


for line in sys.stdin:
    line = line.strip()
    if line:
        try:
            handle(json.loads(line))
        except Exception as exc:  # keep the stdio loop alive
            sys.stderr.write("bridge error: %s\n" % exc)
