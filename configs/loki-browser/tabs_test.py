import unittest
from tabs import OwnedTabs


class FakeChrome:
    def __init__(self):
        self.tabs = [{"id": "unrelated", "type": "page", "url": "https://unrelated.invalid/", "webSocketDebuggerUrl": "ws://127.0.0.1:9444/devtools/page/unrelated"}]
        self.created = []

    def create(self):
        tab = {"id": "owned", "type": "page", "url": "about:blank", "webSocketDebuggerUrl": "ws://localhost:9444/devtools/page/owned"}
        self.tabs.append(tab)
        self.created.append(tab)
        return tab


class TabTests(unittest.TestCase):
    def setUp(self):
        self.chrome = FakeChrome()
        self.owner = OwnedTabs(9444, self.chrome.create, lambda: self.chrome.tabs)

    def test_navigation_creates_own_tab_not_first_page(self):
        self.assertIn("/owned", self.owner.navigate("ratatosk", "https://www.dba.dk/"))
        self.assertEqual(len(self.chrome.created), 1)
        self.chrome.tabs.reverse()
        self.chrome.created[0]["url"] = "https://www.dba.dk/"
        self.assertIn("/owned", self.owner.resolve("ratatosk"))
        self.assertEqual(self.chrome.tabs[-1]["id"], "unrelated")

    def test_read_before_navigate_refuses_instead_of_first_page(self):
        with self.assertRaisesRegex(ValueError, "browser_navigate"):
            self.owner.resolve("ratatosk")

    def test_lost_tab_never_falls_back(self):
        self.owner.navigate("ratatosk", "https://www.dba.dk/")
        self.chrome.tabs = self.chrome.tabs[:1]
        with self.assertRaisesRegex(ValueError, "closed"):
            self.owner.resolve("ratatosk")

    def test_unknown_redirect_refuses_without_leaking_url(self):
        self.owner.navigate("ratatosk", "https://www.dba.dk/")
        self.chrome.created[0]["url"] = "https://id.dba.dk/login?token=SECRET"
        with self.assertRaisesRegex(ValueError, "redirect") as error:
            self.owner.resolve("ratatosk")
        self.assertNotIn("SECRET", str(error.exception))

    def test_invalid_url_fails_before_browser_call(self):
        for value in ["file:///etc/passwd", "http://www.dba.dk/", "https://u:p@www.dba.dk/", "https://id.dba.dk/login", "https://www.dba.dk/?token=secret"]:
            with self.assertRaises(ValueError):
                self.owner.navigate("ratatosk", value)
        self.assertEqual(self.chrome.created, [])

    def test_websocket_is_loopback_configured_port_owned_target(self):
        self.owner.navigate("ratatosk", "https://www.dba.dk/")
        self.chrome.created[0]["url"] = "https://www.dba.dk/"
        for ws in ["ws://evil.invalid:9444/devtools/page/owned", "ws://127.0.0.1:9377/devtools/page/owned", "ws://127.0.0.1:9444/devtools/page/unrelated"]:
            self.chrome.created[0]["webSocketDebuggerUrl"] = ws
            with self.assertRaisesRegex(ValueError, "endpoint"):
                self.owner.resolve("ratatosk")


    def test_automatic_workspace_requires_no_caller_tab(self):
        with self.assertRaisesRegex(ValueError, "browser_navigate"):
            self.owner.workspace(None)
        first = self.owner.workspace(None, "https://www.dba.dk/")
        self.assertEqual(self.owner.workspace(None), first)
        self.assertEqual(self.owner.workspace(None, "https://www.dba.dk/search?q=desk"), first)
        second = self.owner.workspace(None, "https://learnit.itu.dk/my/")
        self.assertNotEqual(first, second)
        self.assertEqual(self.owner.workspace(None), second)


if __name__ == "__main__":
    unittest.main()
