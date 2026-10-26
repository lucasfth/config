"""Offline web-component fixture: no browser, network, cookies or stored login data."""
import ast
import json
from pathlib import Path
import shutil
import subprocess
import unittest


def expressions():
    tree = ast.parse(Path(__file__).with_name('server.py').read_text())
    nodes = [node for node in tree.body if
             isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('CREDENTIAL', 'DOM_ROOTS', 'PAGE_STATE') for t in node.targets)
             or isinstance(node, ast.FunctionDef) and node.name == 'text_expression']
    namespace = {'json': json}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'server.py', 'exec'), namespace)
    return namespace


class ShadowTextTests(unittest.TestCase):
    def run_fixture(self, expression, login=False):
        node = shutil.which('node')
        if not node:
            self.fail('Node is required for the offline DOM fixture')
        fixture = r'''
const vm = require('node:vm');
const hiddenSecret = {shadowRoot:null,getClientRects:()=>[],querySelectorAll:()=>[]};
const password = {type:'password',getClientRects:()=>[{}]};
const shadow = {
  textContent:'WRONG: do not read raw hidden contents SECRET',
  querySelectorAll(selector) {
    if (selector === '*') return [];
    if (selector.startsWith('input')) return LOGIN ? [password] : [];
    return [avatar, messages];
  },
  children:[]
};
const item = text => ({tagName:'A', innerText:text, children:[], shadowRoot:null,
  getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>false});
const avatar=item('Min DBA'), messages=item('Beskeder');
shadow.children=[avatar,messages];
const host={shadowRoot:shadow,getClientRects:()=>[{}],matches:()=>false};
const body={innerText:'Popular listings',matches:()=>false,getAttribute:()=>null,
  querySelectorAll:()=>[host,hiddenSecret]};
const document={body,title:'DBA',readyState:'complete',querySelector:()=>body,
  querySelectorAll:s=>s==='*'?[host,hiddenSecret]:[]};
const result = vm.runInNewContext(EXPR,{document,location:{origin:'https://www.dba.dk',pathname:'/'},Array,Set});
process.stdout.write(JSON.stringify(result));
'''.replace('LOGIN', json.dumps(login)).replace('EXPR', json.dumps(expression))
        result = subprocess.run([node, '-e', fixture], text=True, capture_output=True, check=True)
        return json.loads(result.stdout)

    def test_visible_shadow_header_precedes_large_page_body(self):
        text = self.run_fixture(expressions()['text_expression'](None))
        self.assertIn('Min DBA', text)
        self.assertIn('Beskeder', text)
        self.assertIn('Popular listings', text)
        self.assertNotIn('SECRET', text)
        self.assertLess(text.index('Min DBA'), text.index('Popular listings'))

    def test_shadow_password_still_blocks_page(self):
        state = self.run_fixture(expressions()['PAGE_STATE'], login=True)
        self.assertTrue(state['blocked'])


if __name__ == '__main__':
    unittest.main()
