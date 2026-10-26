"""Select only bridge-created tabs; never infer ownership from Chrome list order."""

import re
import hashlib
import threading
from urllib.parse import parse_qsl, urlsplit


def app_origin(value):
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        raise ValueError("Expected an HTTPS app URL without credentials")
    if re.search(r"(?:^|[./_-])(login|signin|sign-in|challenge|verification|two-factor)(?:$|[./_-])", url.hostname + url.path, re.I):
        raise ValueError("Login or verification must be handled by Lucas")
    if any(re.search(r"token|secret|password|credential|code|sso|session", key, re.I) for key, _ in parse_qsl(url.query)):
        raise ValueError("Credential-bearing navigation URL refused")
    return "https://" + url.netloc.lower()


class OwnedTabs:
    def __init__(self, port, create, list_tabs):
        if port != 9444:
            raise ValueError("Only the dedicated Gimle endpoint on 9444 is permitted")
        self.port = port
        self.create = create
        self.list_tabs = list_tabs
        self.owned = {}
        self.current = None
        self.lock = threading.RLock()

    def workspace(self, name=None, url=None):
        with self.lock:
            if name is not None:
                self._name(name)
                return name
            if url is not None:
                origin = app_origin(url)
                name = "auto-" + hashlib.sha256(origin.encode()).hexdigest()[:20]
                self.current = name
                return name
            if self.current is None:
                raise ValueError("Run browser_navigate with the desired website first")
            return self.current

    def _name(self, name):
        if not isinstance(name, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", name):
            raise ValueError("Expected a tab name of 1-80 letters, digits, hyphens or underscores")

    def _websocket(self, tab, target_id):
        ws = urlsplit(tab.get("webSocketDebuggerUrl", ""))
        if ws.scheme != "ws" or ws.hostname not in ("127.0.0.1", "localhost") or ws.port != self.port or ws.username or ws.password or ws.path != "/devtools/page/" + target_id or ws.query or ws.fragment:
            raise ValueError("Unexpected owned-tab CDP endpoint")
        return f"ws://127.0.0.1:{self.port}{ws.path}"

    def navigate(self, name, url):
        self._name(name)
        origin = app_origin(url)  # Validate before opening a tab.
        with self.lock:
            if name not in self.owned:
                tab = self.create()
                target_id = tab.get("id")
                if not isinstance(target_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]+", target_id):
                    raise ValueError("Unexpected created target identifier")
                ws = self._websocket(tab, target_id)
                self.owned[name] = {"id": target_id, "origin": origin}
                return ws
            previous = self.owned[name]
            if origin != previous["origin"]:
                raise ValueError("Use a new tab name for a different app origin")
            return self.resolve(name)

    def resolve(self, name):
        self._name(name)
        with self.lock:
            if name not in self.owned:
                raise ValueError("Run browser_navigate first to create a bridge-owned tab")
            saved = self.owned[name]
            tab = next((tab for tab in self.list_tabs() if tab.get("id") == saved["id"] and tab.get("type") == "page"), None)
            if tab is None:
                raise ValueError("Owned tab was closed; use a new tab name with browser_navigate")
            try:
                origin = app_origin(tab.get("url", ""))
            except ValueError:
                raise ValueError("Unexpected app redirect or authentication; Lucas must handle it") from None
            if origin != saved["origin"]:
                raise ValueError("Unexpected app redirect; Lucas must handle authentication")
            return self._websocket(tab, saved["id"])
