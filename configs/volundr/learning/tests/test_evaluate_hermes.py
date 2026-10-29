"""Exercise transport/isolation with stub native engine and loopback provider only."""
import http.server
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest

RUNNER = Path(__file__).parents[1] / 'evaluate_hermes.py'
BOOTSTRAP = '''import sys,types,json,os,urllib.request,urllib.error
from pathlib import Path
sys.modules['yaml']=types.SimpleNamespace(safe_load=json.loads,safe_dump=json.dumps)
sys.modules['dotenv']=types.SimpleNamespace(dotenv_values=lambda p: json.loads(p.read_text()))
class AIAgent:
 def __init__(self,**kw):
  self.kw=kw;self.tools=[];self.valid_tool_names=set();self.client=self
  assert kw['enabled_toolsets']==[] and kw['skip_memory'] and kw['skip_background_review']
  assert not (Path(os.environ['HERMES_HOME'])/'.env').exists()
  assert kw['reasoning_config']['effort']=='low'
 def with_options(self,**kw): return self
 def close(self): pass
 def run_conversation(self,prompt,system_message=None):
  url=self.kw['base_url']+'/chat/completions'
  body=json.dumps({'stream':True,'messages':[{'role':'user','content':prompt}]}).encode()
  if 'FORCE_RETRY' in prompt:
   for attempt in range(2):
    try: urllib.request.urlopen(urllib.request.Request(url,body,headers={'Content-Type':'application/json'})).read()
    except urllib.error.HTTPError: pass
   return {'failed':True,'completed':False,'error':'fixture rejection','final_response':'Not an answer'}
  response=urllib.request.urlopen(urllib.request.Request(url,body,headers={'Content-Type':'application/json'}))
  assert response.headers['Content-Type']=='text/event-stream'
  assert response.read().startswith(b'data: ')
  return {'completed':True,'failed':False,'final_response':json.dumps({'claims':{'answer':4}}),'messages':[]}
sys.modules['run_agent']=types.SimpleNamespace(AIAgent=AIAgent)
'''


class RunnerTests(unittest.TestCase):
    def run_fixture(self, retry=False):
        requests = []
        class Provider(http.server.BaseHTTPRequestHandler):
            def log_message(self, *unused): pass
            def do_POST(self):
                requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                if retry:
                    self.send_response(400); self.send_header('Content-Type', 'application/json')
                    self.end_headers(); self.wfile.write(b'{"error":"fixture"}')
                else:
                    self.send_response(200); self.send_header('Content-Type', 'text/event-stream')
                    self.end_headers(); self.wfile.write(b'data: {"fixture":true}\n\ndata: [DONE]\n\n')
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); source = root/'source'; source.mkdir()
                (source/'hermes_bootstrap.py').write_text(BOOTSTRAP)
                (source/'run_agent.py').write_text('# Stub engine for transport tests\n')
                home=root/'live-home';home.mkdir()
                config={'model':{'default':'fixture','provider':'fixture','context_length':262144},
                    'providers':{'fixture':{'base_url':f'http://127.0.0.1:{server.server_port}/v1','api_key_env':'AAR_FIXTURE_ONLY'}}}
                (home/'config.yaml').write_text(json.dumps(config));(home/'.env').write_text('{"AAR_FIXTURE_ONLY":"synthetic"}')
                before={p.name:p.read_bytes() for p in home.iterdir()}
                for name in ('baseline','candidate'): (root/name).write_text('# '+name+'\n')
                (root/'suite').write_text(json.dumps({'trials':1,'cases':[{'id':'fixture','prompt':'FORCE_RETRY' if retry else 'What is 2+2?','expected':{'answer':4}}]}))
                command=[sys.executable,'-I',str(RUNNER)]
                for name,value in [('source',source),('live-home',home),('suite',root/'suite'),('baseline',root/'baseline'),('candidate',root/'candidate'),('output',root/'output')]:command += ['--'+name,str(value)]
                result=subprocess.run(command,text=True,capture_output=True,timeout=15)
                self.assertEqual({p.name:p.read_bytes() for p in home.iterdir()},before)
                if retry:
                    self.assertNotEqual(result.returncode,0)
                    self.assertTrue((root/'output/native-failure.json').exists())
                    self.assertFalse((root/'output/traces-loki.json').exists())
                    self.assertEqual(len(requests),1, result.stdout+result.stderr)
                else:
                    self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                    self.assertEqual(len(requests),2)
                    self.assertTrue(all(request['stream'] is True for request in requests))
                    self.assertEqual(len(json.loads((root/'output/traces-loki.json').read_text())),2)
        finally:
            server.shutdown();server.server_close()

    def test_preserves_sse_and_scratch_profile(self): self.run_fixture()
    def test_native_outer_retry_never_reaches_provider_twice(self): self.run_fixture(retry=True)


if __name__ == '__main__': unittest.main()
