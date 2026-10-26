"""Real FastAPI transport tests with fake Chrome; no socket or browser actions."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import server


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def post(self, method, params=None):
        return self.client.post('/mcp', json={'jsonrpc':'2.0','id':1,'method':method,'params':params or {}})

    def test_handshake_and_tools(self):
        response = self.post('initialize', {'protocolVersion':'2025-03-26'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['result']['serverInfo']['version'], '1.2.1')
        self.assertEqual(self.post('notifications/initialized').status_code, 202)
        tools = self.post('tools/list').json()['result']['tools']
        self.assertEqual(len(tools), 5)
        self.assertTrue(all('tab' not in tool['inputSchema']['required'] for tool in tools))

    def test_owned_tab_error_never_calls_chrome(self):
        with patch.object(server, 'chrome_json', side_effect=AssertionError('browser access forbidden')):
            response = self.post('tools/call', {'name':'browser_get_text','arguments':{'tab':'not-created'}})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['result']['isError'])
        self.assertIn('browser_navigate', response.text)

    def test_image_and_error_contract(self):
        with patch.object(server, 'call_tool', return_value={'image':'IMAGE_FIXTURE'}):
            response = self.post('tools/call', {'name':'browser_screenshot','arguments':{'tab':'fixture'}})
        self.assertEqual(response.json()['result']['content'][0]['type'], 'image')
        with patch.object(server, 'call_tool', side_effect=RuntimeError('SECRET')):
            response = self.post('tools/call', {'name':'browser_get_text','arguments':{'tab':'fixture'}})
        self.assertNotIn('SECRET', response.text)
        self.assertTrue(response.json()['result']['isError'])


if __name__ == '__main__': unittest.main()
