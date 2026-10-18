import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createAgentSession,SessionManager} from '@earendil-works/pi-coding-agent';
import {prepareRuntime} from './runtime.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'pi-role-transport-'));const requests=[];
const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const payload=JSON.parse(body);requests.push({model:payload.model,messages:payload.messages});res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(`data: ${JSON.stringify({id:'role-proof',object:'chat.completion.chunk',created:1,model:payload.model,choices:[{index:0,delta:{role:'assistant',content:'ROLE_PROPOSAL'},finish_reason:null}]})}\n\n`);res.end(`data: ${JSON.stringify({id:'role-proof',object:'chat.completion.chunk',created:1,model:payload.model,choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let session;
try{
process.env.PI_CODING_AGENT_DIR=dir;process.env.NEO_PROXY_API_KEY='synthetic';
await prepareRuntime({agentDir:dir,env:{...process.env,NEO_PROXY_URL:`http://127.0.0.1:${server.address().port}/v1`},ompDir:path.join(dir,'absent')});
const settings=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));settings.extensions=settings.extensions.filter(p=>p.endsWith('workflow.ts')||p.endsWith('models.ts'));settings.packages=[];settings.skills=[];await writeFile(path.join(dir,'settings.json'),JSON.stringify(settings));await writeFile(path.join(dir,'mcp.json'),'{"mcpServers":{}}');
const created=await createAgentSession({cwd:dir,agentDir:dir,sessionManager:SessionManager.inMemory()});session=created.session;assert.deepEqual(created.extensionsResult.errors,[]);await session.bindExtensions({mode:'print'});
const initial=session.model.id;const thinking=session.thinkingLevel;
for(const [command,model,marker] of [['plan','claude-opus-5-5','PLAN_INPUT_CANARY'],['commit','gpt-6-luna','COMMIT_INPUT_CANARY']]){
const count=requests.length;await session.prompt(`/${command} ${marker}`);await session.waitForIdle();
assert.equal(requests.length,count+1);assert.equal(requests[count].model,model);assert.ok(JSON.stringify(requests[count].messages).includes(marker));assert.equal(session.model.id,initial);assert.equal(session.thinkingLevel,thinking);
}
console.log(JSON.stringify({requests:requests.map(r=>({model:r.model,inputCanaries:JSON.stringify(r.messages).match(/(?:PLAN|COMMIT)_INPUT_CANARY/g)})),restoredModel:session.model.id,restoredThinking:session.thinkingLevel,toolCalls:session.messages.flatMap(m=>m.role==='assistant'?m.content.filter(p=>p.type==='toolCall'):[]).length},null,2));
}finally{session?.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true,maxRetries:3});}
