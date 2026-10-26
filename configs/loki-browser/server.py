#!/usr/bin/env python3
"""Ratatosk MCP bridge: explicit owned tabs on Gimle's existing Chrome :9444.

Does not start Chrome, enumerate user tabs as tools, adopt tabs, or read credentials.
The deployment retains its existing loopback + tailnet-forward access boundary.
"""
import asyncio
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import uvicorn
import websocket
import yaml
from fastapi import FastAPI, Response
from pydantic import BaseModel

from tabs import OwnedTabs

CONFIG_PATH = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))) / "mcp-browser-server/config.yaml"
CONFIG = yaml.safe_load(CONFIG_PATH.read_text())
CDP_PORT = CONFIG["browser"]["cdp_local_port"]
CDP_HTTP_URL = f"http://127.0.0.1:{CDP_PORT}"


def chrome_json(path, method="GET"):
    try:
        request = urllib.request.Request(CDP_HTTP_URL + path, method=method)
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.load(response)
    except Exception:
        raise ValueError("Chrome unavailable; no browser was started or reconnected") from None


owned = OwnedTabs(CDP_PORT, lambda: chrome_json("/json/new?about:blank", "PUT"), lambda: chrome_json("/json/list"))
app = FastAPI(title="Loki browser bridge (Gimle)", version="1.2.1")


class MCPRequest(BaseModel):
    jsonrpc: str
    id: Any = None
    method: str
    params: dict | None = None


def run_cdp_command(ws_url, method, params=None):
    # Endpoint validation happens in OwnedTabs; ignore ambient proxy settings.
    ws = None
    try:
        ws = websocket.create_connection(ws_url, timeout=12, suppress_origin=True, http_no_proxy=["127.0.0.1", "localhost"])
        ws.send(json.dumps({"id": 1, "method": method, "params": params or {}}))
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            ws.settimeout(max(0.1, deadline - time.monotonic()))
            reply = json.loads(ws.recv())
            if reply.get("id") == 1:
                if "error" in reply:
                    raise ValueError("Browser command failed")
                return reply.get("result", {})
        raise ValueError("Browser command timed out")
    except Exception:
        # Never echo transport errors containing WebSocket/session URLs.
        raise ValueError("Browser command failed or timed out") from None
    finally:
        if ws is not None:
            ws.close()


def evaluate(ws, expression):
    result = run_cdp_command(ws, "Runtime.evaluate", {"expression": expression, "returnByValue": True})
    if "exceptionDetails" in result:
        raise ValueError("Page interaction refused or failed")
    return result.get("result", {}).get("value")


# Open web components are part of the current page, not other tabs or storage.
DOM_ROOTS = r"""const roots=[document];
for(let i=0;i<roots.length;i++){
  if(roots.length>128)throw Error('Page component limit exceeded');
  for(const e of roots[i].querySelectorAll('*'))
    if(e.shadowRoot&&e.getClientRects().length)roots.push(e.shadowRoot);
}"""

PAGE_STATE = r"""(()=>{""" + DOM_ROOTS + r"""
const visible=s=>roots.some(root=>Array.from(root.querySelectorAll(s)).some(e=>e.getClientRects().length>0));
return {origin:location.origin,ready:document.readyState==='complete',blocked:
visible('input[type="password"],input[autocomplete="one-time-code"],input[name="otp"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]') ||
/(?:^|[\s/_-])(login|signin|sign-in|two-factor|verification|challenge)(?:$|[\s/_.-])/i.test(document.title+' '+location.pathname)};
})()"""

# Values/hrefs are never included. The token pattern deliberately errs on refusal.
CREDENTIAL = r"/password|passwd|token|secret|credential|one-time|otp|username|email/i"


def require_page(ws, origin):
    state = evaluate(ws, PAGE_STATE)
    if not isinstance(state, dict) or state.get("origin") != origin:
        raise ValueError("Unexpected app redirect; Lucas must handle authentication")
    if state.get("blocked"):
        raise ValueError("Login or verification required; Lucas must handle it through Screen Sharing")
    return state


def text_expression(selector):
    target = "document.body" if not selector else f"document.querySelector({json.dumps(selector)})"
    return f"""(()=>{{{DOM_ROOTS}const e={target};if(!e)return 'NOT_FOUND';
if(e.matches('input,textarea,[contenteditable]')||{CREDENTIAL}.test([e.id,e.getAttribute('aria-label')].join(' ')))throw Error('Credential field');
const parts=[];
if(e===document.body){{
  for(const root of roots.slice(1))for(const child of root.children){{
    if(!child.getClientRects().length||child.matches('input,textarea,script,style,[contenteditable]'))continue;
    if({CREDENTIAL}.test([child.id,child.getAttribute('aria-label')].join(' ')))continue;
    if(child.innerText)parts.push(child.innerText);
  }}
}}
parts.push(e.innerText||'');
return parts.join('\\n').replace(/\\/cpsess[^/\\s]*/g,'/[session]').replace(/https?:\\/\\/[^\\s<>]+/g,'[link]').slice(0,12000);}})()"""


def control_expression(selector, value=None):
    head = f"""const matches=document.querySelectorAll({json.dumps(selector)});
if(matches.length!==1)throw Error('Select exactly one control');const e=matches[0];
if({CREDENTIAL}.test([e.type,e.name,e.id,e.autocomplete,e.getAttribute('aria-label'),e.placeholder].join(' ')))throw Error('Credential field');
e.scrollIntoView({{block:'center'}});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
if(!r.width||!r.height||x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y)))throw Error('Hidden or covered');"""
    if value is None:
        body = """const a=e.closest('a');const target=a?.target||e.formTarget||e.target||e.form?.target||'';
if((target&&target!=='_self')||a?.hasAttribute('download'))throw Error('Popup/download');
if(a){const u=new URL(a.href);if(u.origin!==location.origin||u.protocol!=='https:')throw Error('Cross-origin link');}
return {x,y};"""
    else:
        body = f"""if(!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement))throw Error('Not text input');
const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(proto,'value').set.call(e,{json.dumps(value)});
e.dispatchEvent(new Event('input',{{bubbles:true}}));e.dispatchEvent(new Event('change',{{bubbles:true}}));return 'ok';"""
    return "(()=>{" + head + body + "})()"


def definition(name, description, properties, required=()):
    return {"name": name, "description": description, "inputSchema": {"type": "object", "additionalProperties": False,
        "properties": {"tab": {"type": "string", "description": "Optional advanced workspace name. Omit for automatic website selection; never ask the user for a tab name.", "pattern": "^[a-zA-Z0-9_-]{1,80}$"}, **properties},
        "required": list(required)}}


TOOLS = [
    definition("browser_navigate", "Open an HTTPS website using the existing logged-in profile. Automatically creates/reuses a bridge-owned tab; no tab name required. Never selects personal/other-agent tabs. Use this first. Login/2FA requires Lucas.", {"url": {"type": "string"}}, ["url"]),
    definition("browser_get_text", "Read the current bridge-owned website. No tab name required. Stops at login/challenge pages.", {"selector": {"type": "string", "maxLength": 1000}}),
    definition("browser_click", "Click one visible noncredential control on the current website. No tab name required. No popups, downloads or cross-origin handoffs.", {"selector": {"type": "string", "maxLength": 1000}}, ["selector"]),
    definition("browser_fill_form", "Fill noncredential text fields on the current website; never submits. No tab name required. Passwords and login fields are refused.", {"fields": {"type": "object", "maxProperties": 20, "additionalProperties": {"type": "string", "maxLength": 10000}}}, ["fields"]),
    definition("browser_screenshot", "Screenshot the current owned website; no tab name required. Returns an MCP image, not a remote file path.", {}),
]


def call_tool(name, args):
    if name not in {tool["name"] for tool in TOOLS}:
        raise ValueError("Unknown browser tool")
    tab = args.get("tab")
    # Serialize selection + operation: no other request can navigate our tab mid-call.
    with owned.lock:
        if name == "browser_navigate":
            url = args.get("url")
            if not isinstance(url, str) or len(url) > 4096:
                raise ValueError("Expected HTTPS app URL")
            tab = owned.workspace(tab, url)
            ws = owned.navigate(tab, url)
            run_cdp_command(ws, "Page.enable")
            result = run_cdp_command(ws, "Page.navigate", {"url": url})
            if result.get("errorText"):
                raise ValueError("Page navigation failed")
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                time.sleep(0.2)
                state = require_page(ws, owned.owned[tab]["origin"])
                if state.get("ready"):
                    return {"status": "ready", "tab": tab, "origin": state["origin"]}
            raise ValueError("Page load timed out; no other tab was used")
        tab = owned.workspace(tab)
        ws = owned.resolve(tab)
        require_page(ws, owned.owned[tab]["origin"])
        selector = args.get("selector")
        if selector is not None and (not isinstance(selector, str) or not 0 < len(selector) <= 1000):
            raise ValueError("Invalid selector")
        if name == "browser_get_text":
            return {"text": evaluate(ws, text_expression(selector)), "tab": tab}
        if name == "browser_click":
            if not selector:
                raise ValueError("Selector required")
            point = evaluate(ws, control_expression(selector))
            if not isinstance(point, dict) or not all(isinstance(point.get(key), (int, float)) for key in ("x", "y")):
                raise ValueError("Click refused")
            for event in ("mouseMoved", "mousePressed", "mouseReleased"):
                params = {"type": event, "x": point["x"], "y": point["y"]}
                if event != "mouseMoved": params.update(button="left", clickCount=1)
                run_cdp_command(ws, "Input.dispatchMouseEvent", params)
            return {"status": "click sent; read page again", "tab": tab}
        if name == "browser_fill_form":
            fields = args.get("fields")
            if not isinstance(fields, dict) or not 1 <= len(fields) <= 20 or any(not isinstance(k, str) or not 0 < len(k) <= 1000 or not isinstance(v, str) or len(v) > 10000 for k, v in fields.items()):
                raise ValueError("Invalid text fields")
            for selector, value in fields.items():
                evaluate(ws, control_expression(selector, value))
            return {"status": "filled, not submitted", "tab": tab}
        return {"image": run_cdp_command(ws, "Page.captureScreenshot", {"format": "png"})["data"]}


@app.post("/")
@app.post("/mcp")
async def mcp_endpoint(request: MCPRequest):
    params = request.params or {}
    reply = {"jsonrpc": "2.0", "id": request.id}
    if request.method.startswith("notifications/"):
        return Response(status_code=202)
    if request.method in ("initialize", "server/discover"):
        protocol = params.get("protocolVersion", "2024-11-05")
        if protocol not in {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}: protocol = "2024-11-05"
        reply["result"] = {"protocolVersion": protocol, "serverInfo": {"name": "mcp-browser-server", "version": "1.2.1"}, "capabilities": {"tools": {}}}
    elif request.method == "ping": reply["result"] = {}
    elif request.method == "tools/list": reply["result"] = {"tools": TOOLS}
    elif request.method == "tools/call":
        try:
            args = params.get("arguments", {})
            if not isinstance(args, dict): raise ValueError("Expected tool arguments object")
            result = await asyncio.to_thread(call_tool, params.get("name"), args)
            content = [{"type": "image", "mimeType": "image/png", "data": result["image"]}] if "image" in result else [{"type": "text", "text": json.dumps(result)}]
            reply["result"] = {"content": content}
        except ValueError as error:
            reply["result"] = {"isError": True, "content": [{"type": "text", "text": str(error)}]}
        except Exception:
            reply["result"] = {"isError": True, "content": [{"type": "text", "text": "Browser operation failed; no other tab was used"}]}
    else: reply["error"] = {"code": -32601, "message": "Method not found"}
    return reply


@app.get("/health")
async def health_check():
    try:
        await asyncio.to_thread(chrome_json, "/json/version")
        return {"status": "healthy", "cdp_port": CDP_PORT, "owned_tabs": len(owned.owned)}
    except ValueError:
        return {"status": "unhealthy", "cdp_port": CDP_PORT}


if __name__ == "__main__":
    if CONFIG["server"]["host"] != "127.0.0.1":
        raise SystemExit("Bridge must retain loopback binding with the approved tailnet forward")
    sys.path.insert(0, str(Path.home() / ".hermes/scripts"))
    try:
        import accept_spin_guard
        accept_spin_guard.install()
    except ImportError:
        pass
    uvicorn.run(app, host="127.0.0.1", port=CONFIG["server"]["port"], log_level="info")
