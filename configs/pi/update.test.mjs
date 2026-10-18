import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveHostUpdate, updateProfile } from './update.mjs';

const names = ['@earendil-works/pi-coding-agent','@earendil-works/pi-ai','@earendil-works/pi-agent-core','@earendil-works/pi-tui'];

test('host updates require a synchronized release and preserve exact version pins', () => {
  const dependencies = Object.fromEntries(names.map(name => [name, '1.3.0']));
  const latest = Object.fromEntries(names.map(name => [name, '1.4.0']));
  assert.equal(resolveHostUpdate(dependencies, latest).changed, true);
  assert.deepEqual(resolveHostUpdate(dependencies, latest).install, names.map(name => `${name}@1.4.0`));
  assert.equal(resolveHostUpdate(dependencies, dependencies).changed, false);
  assert.throws(() => resolveHostUpdate(dependencies, {...latest,'@earendil-works/pi-ai':'1.3.0'}), /do not agree/);
  assert.throws(() => resolveHostUpdate(dependencies, {...latest,'@earendil-works/pi-coding-agent':'garbage'}), /invalid/);
});

test('failed update verification restores original pins and does not report success', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-update-rollback-'));
  try {
    const bin = path.join(root,'bin'); await mkdir(bin);
    const manifest = JSON.stringify({dependencies:Object.fromEntries(names.map(name=>[name,'1.3.0']))});
    const lock = '{"lockfileVersion":3}';
    await writeFile(path.join(root,'package.json'),manifest);
    await writeFile(path.join(root,'package-lock.json'),lock);
    // This finite subprocess fixture models an actual npm install mutating pins,
    // followed by a failed check. It never invokes the real package manager.
    await writeFile(path.join(bin,'npm'),`#!${process.execPath}\nimport fs from 'node:fs';\nconst a=process.argv.slice(2);if(a[0]==='view'){console.log('1.4.0');process.exit(0)}if(a[0]==='install'){fs.writeFileSync('package.json','{}');fs.writeFileSync('package-lock.json','{}')}if(a[0]==='run'&&a[1]==='typecheck')process.exit(9);\n`);
    await writeFile(path.join(bin,'package.json'),'{"type":"module"}');
    await chmod(path.join(bin,'npm'),0o755);
    const output=[];
    const result=await updateProfile({sourceDir:root,cacheDir:path.join(root,'cache'),env:{...process.env,PATH:`${bin}:${process.env.PATH}`},stdout:text=>output.push(text),stderr:text=>output.push(text)});
    assert.equal(result.code,1);
    assert.equal(await readFile(path.join(root,'package.json'),'utf8'),manifest);
    assert.equal(await readFile(path.join(root,'package-lock.json'),'utf8'),lock);
    assert.match(output.join(''),/Restored the previous locked profile/);
    assert.doesNotMatch(output.join(''),/verification succeeded/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
