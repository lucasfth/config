import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { spawn as spawnPty } from 'zigpty';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { prepareRuntime, sourceDir, repoDir } from './runtime.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'pi-adversarial-'));
const agentDir = path.join(root, 'agent');
const ompDir = path.join(root, 'absent-omp');
const requests = [];
const server = http.createServer(async (request, response) => {
  let body = ''; for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body); requests.push(payload.model);
  const chunk = { id:'local',object:'chat.completion.chunk',created:1,model:payload.model,choices:[{index:0,delta:{role:'assistant',content:'LOCAL_RESPONSE'},finish_reason:null}] };
  response.writeHead(200, {'Content-Type':'text/event-stream'});
  response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.write(`data: ${JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\n`);
  response.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const env = Object.fromEntries(['PATH','HOME','USER','SHELL','TMPDIR','LANG'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
Object.assign(env,{PI_CODING_AGENT_DIR:agentDir,NEO_PROXY_URL:endpoint,NEO_PROXY_API_KEY:'synthetic-only',PI_OFFLINE:'1',PI_TELEMETRY:'0',HUGINN_OMP_AGENT_DIR:ompDir,TERM:'xterm-256color',TERM_PROGRAM:'ghostty'});
const ids = ['gpt-6.1-sol','gpt-6-luna','claude-opus-5-5','claude-haiku-5-5','adversarial-fifth','adversarial-sixth'];
let child, pty;
let raw='';
try {
  await mkdir(ompDir,{recursive:true});
  const db = new DatabaseSync(path.join(ompDir,'models.db'));
  db.exec('CREATE TABLE model_cache(provider_id TEXT, models TEXT, updated_at INTEGER)');
  db.prepare('INSERT INTO model_cache VALUES(?,?,?)').run('neo-proxy:test',JSON.stringify(ids.map(id=>({id,name:id,reasoning:true,input:['text','image'],contextWindow:128000,maxTokens:8192}))),1);
  db.close();
  await prepareRuntime({agentDir,env,ompDir});
  await writeFile(path.join(agentDir,'mcp.json'),JSON.stringify({mcpServers:{}}));
  const commands = [];
  const pending = new Map();
  const menus = [];
  const errors=[];
  let phase='idle', buffer='', stderr='', sequence=0;
  const cli=path.join(sourceDir,'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
  async function start() {
    child=spawn(process.execPath,[cli,'--offline','--mode','rpc','--no-session','--no-context-files','--no-mcp','--approve'],{cwd:repoDir,env,stdio:['pipe','pipe','pipe']});
    child.stderr.on('data',data=>stderr+=data);
    child.stdout.on('data',data=>{
      buffer+=data;
      for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let row;try{row=JSON.parse(line)}catch{continue}
        if(row.type==='response')pending.get(row.id)?.(row);
        if(row.type==='extension_error')errors.push(row);
        if(row.type==='extension_ui_request'&&['select','input'].includes(row.method)){
          menus.push(row.title);
          let value;
          if(phase==='roles'){
            if(row.title==='Configure model roles')value=row.options.find(option=>option.startsWith('task '));
            else if(row.method==='input')value='adversarial-fifth';
            else if(row.title.startsWith('Thinking for task'))value='low';
            else value=row.options.find(option=>option.startsWith('neo-proxy/adversarial-fifth'));
          }
          child.stdin.write(JSON.stringify({type:'extension_ui_response',id:row.id,...(value?{value}:{cancelled:true})})+'\n');
        }
      }
    });
    await send('get_state');
  }
  function send(type,fields={}){const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`RPC deadline ${type}: ${stderr}`))},15000);pending.set(id,row=>{clearTimeout(timer);pending.delete(id);row.success?resolve(row):reject(new Error(row.error))});child.stdin.write(JSON.stringify({id,type,...fields})+'\n')})}
  async function stop(){const processExit=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();await processExit;child=undefined;}
  await start();
  const catalogue=(await send('get_available_models')).data.models.filter(model=>model.provider==='neo-proxy');
  assert.equal(catalogue.length,6,'Full catalogue must exceed four');
  const before=(await send('get_state')).data.model.id;
  await send('prompt',{message:'/switch missing/model'});
  const afterInvalidSwitch = (await send('get_state')).data.model.id;
  assert.equal(afterInvalidSwitch,before);
  phase='cancel';await send('prompt',{message:'/switch'});
  const afterCancelledSwitch = (await send('get_state')).data.model.id;
  assert.equal(afterCancelledSwitch,before);
  phase='roles';await send('prompt',{message:'/models'});
  const roles=JSON.parse(await readFile(path.join(agentDir,'roles.json'),'utf8'));
  assert.equal(roles.task.modelId,'adversarial-fifth');assert.equal(roles.task.thinkingLevel,'low');
  const afterRoleSetup = (await send('get_state')).data.model.id;
  assert.equal(afterRoleSetup,before,'Role setup must not switch active session');
  assert.equal(JSON.parse(await readFile(path.join(agentDir,'settings.json'),'utf8')).defaultModel,before);
  await stop();await start();
  const restartedRole = JSON.parse(await readFile(path.join(agentDir,'roles.json'),'utf8')).task;
  assert.deepEqual(restartedRole,roles.task);
  const restartedModel = (await send('get_state')).data.model.id;
  assert.equal(restartedModel,before);
  const availableCommands=(await send('get_commands')).data.commands.map(command=>command.name);
  assert.equal(availableCommands.filter(name=>name==='skill:typesafe-ai').length,1);
  assert.equal(availableCommands.filter(name=>name==='skill:using-gimle-browser').length,1);
  assert.ok(availableCommands.includes('skill:herdr-config'));
  assert.ok(availableCommands.includes('skill:sudo-ssh-freyr'));
  assert.ok(availableCommands.includes('skill:sudo-ssh-mimer'));
  assert.ok(!/Skill conflicts|collision|description is required|skill path does not exist/i.test(stderr),stderr);
  await stop();
  const probe = path.join(root, 'acceptance-state.ts');
  await writeFile(probe, `export default function(pi) { pi.registerCommand('acceptance-state', { handler: async (args, ctx) => ctx.ui.notify('ACCEPTANCE_STATE ' + args + ' ' + ctx.model.provider + '/' + ctx.model.id, 'info') }); }`);
  pty=spawnPty(process.execPath,[path.join(sourceDir,'launch.mjs'),'--offline','--no-mcp','--no-session','--no-context-files','--approve','--extension',probe],{cwd:repoDir,env,cols:120,rows:42});
  const fresh = (pattern, action) => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Fresh PTY deadline: ' + pattern)); }, 10000);
    const subscription = pty.onData(data => { output += String(data); if (output.includes(pattern)) { clearTimeout(timer); subscription.dispose(); resolve(output); } });
    action();
  });
  const terminalState = async label => {
    const output = await fresh('ACCEPTANCE_STATE ' + label + ' neo-proxy/', () => pty.write('/acceptance-state ' + label + '\r'));
    const model = output.slice(output.indexOf('ACCEPTANCE_STATE ' + label + ' ') + ('ACCEPTANCE_STATE ' + label + ' ').length).match(/^neo-proxy\/[a-z0-9.-]+/)?.[0];
    assert.ok(model, output);
    return model;
  };
  pty.onData(data=>{const text=String(data);raw+=text;if(text.includes('\x1b[c'))pty.write('\x1b[?62;c');if(text.includes('\x1b[6n'))pty.write('\x1b[1;1R');if(text.includes('\x1b[16t'))pty.write('\x1b[6;20;16t')});
  await pty.waitFor('Huginn · Pi',{timeout:20000});
  const terminalBefore = await terminalState('before');
  pty.write('/model\r');await pty.waitFor('Configure model roles',{timeout:10000});
  assert.ok(raw.slice(raw.lastIndexOf('Configure model roles')).includes('task'));
  pty.write('\x1b[B'); pty.write('\x1b[B'); pty.write('\r');
  await pty.waitFor('Assign model for task', { timeout: 10000 });
  pty.write('adversarial-fifth'); pty.write('\r');
  await pty.waitFor('Thinking for task', { timeout: 10000 });
  pty.write('\x1b[B'); pty.write('\x1b[B'); pty.write('\r');
  await pty.waitFor('Saved task', { timeout: 10000 });
  const terminalAfterRole = await terminalState('after-role');
  assert.equal(terminalAfterRole, terminalBefore, 'PTY role setup preserves active model');
  pty.write('/switch\r'); await pty.waitFor('Switch model for this session', { timeout: 10000 });
  pty.write('adversarial-sixth'); pty.write('\r');
  await pty.waitFor('Session model: neo-proxy/adversarial-sixth',{timeout:10000});
  const terminalBeforeCancel = await terminalState('before-cancel');
  assert.equal(terminalBeforeCancel, 'neo-proxy/adversarial-sixth');
  await fresh('Switch model for this session', () => pty.write('/switch\r'));
  pty.write('\x1b');
  // A lone ESC needs the terminal parser's ambiguity window before another byte.
  await new Promise(resolve => setTimeout(resolve, 100));
  const terminalAfterCancel = await terminalState('after-cancel');
  assert.equal(terminalAfterCancel, terminalBeforeCancel, 'Literal Escape preserves active model');
  assert.ok(!/Skill conflicts|description is required|\[Extension issues\]/i.test(raw));
  const exit=new Promise(resolve=>pty.onExit(resolve));const deadline=setTimeout(()=>pty.kill(),5000);pty.write('/quit\r');const result=await exit;clearTimeout(deadline);assert.equal(result.exitCode,0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert.equal(requests.length,0,'Configuration/cancellation must not make model calls');
  console.log(JSON.stringify({scenario:'adversarial-real-sessions',sourceDir,repoDir,catalogueModels:catalogue.map(model=>model.id),menus,taskRole:roles.task,restartPreservesRole:JSON.stringify(restartedRole)===JSON.stringify(roles.task),sessionUnchangedByRoleSetup:afterRoleSetup===before&&terminalAfterRole===terminalBefore,invalidAndCancelledSwitchPreserveModel:afterInvalidSwitch===before&&afterCancelledSwitch===before&&terminalAfterCancel===terminalBeforeCancel,stateEvidence:{before,afterInvalidSwitch,afterCancelledSwitch,afterRoleSetup,restartedModel,restartedRole,terminalBefore,terminalAfterRole,terminalBeforeCancel,terminalAfterCancel},fullSkillsStartupErrors:stderr,modelRequests:requests.length,exitCode:result.exitCode},null,2));
} catch(error) {console.error(JSON.stringify({rawTail:raw.slice(-5000)}));throw error;}
finally {
  if (child && child.exitCode === null) { const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit; }
  if (pty && pty.exitCode === null) { const exit = new Promise(resolve => pty.onExit(resolve)); pty.kill(); await exit; }
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});
}
