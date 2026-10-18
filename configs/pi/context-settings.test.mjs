import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {prepareRuntime} from './runtime.mjs';

test('regeneration migrates eager tools and compaction while preserving named role choices',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'pi-policy-migration-'));
  try{
    await writeFile(path.join(dir,'settings.json'),JSON.stringify({defaultTools:['+codemode'],compaction:{enabled:true,reserveTokens:16384,keepRecentTokens:20000},contextPrune:{enabled:false}}));
    await writeFile(path.join(dir,'roles.json'),JSON.stringify({summary:{provider:'neo-proxy',modelId:'gpt-6-luna',thinkingLevel:'low'}}));
    await prepareRuntime({agentDir:dir,env:{NEO_PROXY_URL:'http://127.0.0.1:9/v1'},ompDir:path.join(dir,'absent')});
    const settings=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
    assert.ok(settings.defaultTools.includes('+tool_search'));
    assert.equal(settings.codemode.inlineBudget,0);
    assert.equal(settings.contextPrune.enabled,true);
    assert.equal(settings.contextPrune.summarizerModel,'neo-proxy/gpt-6-luna');
    assert.equal(settings.contextPrune.purgeErrors.enabled,false);
    assert.equal(settings.compaction.keepRecentTokens,30000);
    assert.ok(settings.packages.every(pkg=>pkg.extensions.length===0));
    assert.ok(settings.extensions.some(file=>file.endsWith('managed-tools.ts')));
  }finally{await rm(dir,{recursive:true,force:true,maxRetries:3});}
});
