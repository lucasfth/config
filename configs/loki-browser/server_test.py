"""Exercise bridge request routing with fake CDP; never connect to a browser."""
import ast
import asyncio
import json
import unittest
from pathlib import Path
from types import SimpleNamespace

from tabs import OwnedTabs


def load_functions(**namespace):
    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in ('call_tool', 'mcp_endpoint', 'evaluate', 'definition', 'require_page')]
    for node in nodes:
        node.decorator_list = []  # Route decorators are exercised in the staged ASGI test.
    namespace.update(json=json, asyncio=asyncio, MCPRequest=object)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), namespace)
    return namespace


class BridgeTests(unittest.TestCase):
    def test_tools_call_without_owned_tab_is_error_not_first_tab(self):
        owner = OwnedTabs(9444, lambda: self.fail('must not create'), lambda: self.fail('must not list'))
        ns = load_functions(owned=owner, TOOLS=[{'name': 'browser_get_text'}])
        request = SimpleNamespace(id=4, method='tools/call', params={'name':'browser_get_text','arguments':{'tab':'dba'}})
        reply = asyncio.run(ns['mcp_endpoint'](request))
        self.assertTrue(reply['result']['isError'])
        self.assertIn('browser_navigate', reply['result']['content'][0]['text'])

    def test_result_shape_and_errors(self):
        ns = load_functions(run_cdp_command=lambda *a: {'result': {'value': 'visible text'}})
        self.assertEqual(ns['evaluate']('fixture', 'fixture'), 'visible text')
        ns['run_cdp_command'] = lambda *a: {'exceptionDetails': {'text': 'SECRET'}}
        with self.assertRaisesRegex(ValueError, '^Page interaction refused or failed$'):
            ns['evaluate']('fixture', 'fixture')

    def test_login_blocks_actions(self):
        ns = load_functions()
        ns['evaluate'] = lambda *a: {'origin': 'https://www.dba.dk', 'blocked': True}
        ns['PAGE_STATE'] = 'fixture'
        with self.assertRaisesRegex(ValueError, 'Login or verification'):
            ns['require_page']('fixture', 'https://www.dba.dk')

    def test_screenshot_returns_mcp_image(self):
        ns = load_functions()
        ns['call_tool'] = lambda *a: {'image': 'IMAGE_FIXTURE'}
        request = SimpleNamespace(id=4, method='tools/call', params={'name':'browser_screenshot','arguments':{'tab':'dba'}})
        content = asyncio.run(ns['mcp_endpoint'](request))['result']['content']
        self.assertEqual(content, [{'type':'image','mimeType':'image/png','data':'IMAGE_FIXTURE'}])

    def test_unknown_errors_do_not_leak(self):
        ns = load_functions()
        def fail(*a): raise RuntimeError('ws://localhost:9444/SECRET')
        ns['call_tool'] = fail
        request = SimpleNamespace(id=4, method='tools/call', params={'name':'browser_get_text'})
        result = asyncio.run(ns['mcp_endpoint'](request))
        self.assertTrue(result['result']['isError'])
        self.assertNotIn('SECRET', json.dumps(result))


if __name__ == '__main__': unittest.main()
