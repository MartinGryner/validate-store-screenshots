import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { inspectBuffer, validateDirectory } from '../src/validate.mjs';

function png(width=1260,height=2736,alpha=false) {
  return PNG.sync.write({width,height,data:Buffer.alloc(width*height*4,255)},{colorType:alpha?6:2});
}
test('decode real PNG/JPEG; detect even fully opaque alpha; reject corrupt or oversized headers',()=>{
  assert.equal(inspectBuffer(png(),'ok.png').hasAlpha,false);
  assert.equal(inspectBuffer(png(20,20,true),'alpha.png').hasAlpha,true);
  const jpg=jpeg.encode({width:1280,height:800,data:Buffer.alloc(1280*800*4,255)},70).data;
  assert.equal(inspectBuffer(jpg,'wrong-extension.png').mime,'image/jpeg');
  assert.throws(()=>inspectBuffer(Buffer.from('not an image'),'fake.png'),/signature/);
  assert.throws(()=>inspectBuffer(png().subarray(0,50),'truncated.png'),/Truncated|end marker/);
  const huge=Buffer.from(png(2,2)); huge.writeUInt32BE(100000,16);
  huge.writeUInt32BE(100000,20);
  assert.throws(()=>inspectBuffer(huge,'bomb.png'),/safety limit/);
  const corrupt=Buffer.from(png(2,2)); corrupt[29]^=255;
  assert.throws(()=>inspectBuffer(corrupt,'crc.png'));
});

test('directory validation and bundled workflow exit behavior',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'screenshot-action-'));
  try {
    await mkdir(path.join(root,'set')); await mkdir(path.join(root,'empty'));
    await writeFile(path.join(root,'set','valid.png'),png());
    assert.equal((await validateDirectory('set','apple-iphone-69',root)).failures,0);
    await writeFile(path.join(root,'set','wrong-size.png'),png(320,640));
    assert.equal((await validateDirectory('set','apple-iphone-69',root)).failures,1);
    await writeFile(path.join(root,'set','broken.png'),Buffer.from('broken'));
    const result=await validateDirectory('set','apple-iphone-69',root);
    assert.equal(result.failures,2); assert.match(result.errors[0].name,/broken.png/);
    await assert.rejects(validateDirectory('empty','google-phone',root),/No files/);
    await assert.rejects(validateDirectory('set','invented',root),/Unsupported/);
    await assert.rejects(validateDirectory('..','apple-mac',root),/inside/);
    await symlink(path.join(root,'set','valid.png'),path.join(root,'set','link.png'));
    assert.equal((await validateDirectory('set','apple-iphone-69',root)).errors.length,2);
    const cli=new URL('../dist/index.cjs',import.meta.url);
    const env={...process.env,GITHUB_WORKSPACE:root,INPUT_DIRECTORY:'set',INPUT_TARGET:'apple-iphone-69',GITHUB_OUTPUT:path.join(root,'output'),GITHUB_STEP_SUMMARY:path.join(root,'summary')};
    const run=extra=>spawnSync(process.execPath,[cli.pathname],{env:{...env,...extra},encoding:'utf8'});
    assert.equal(run().status,1);
    assert.match(run().stdout,/::error file=set\/wrong-size.png::Dimensions/);
    assert.equal(run({'INPUT_FAIL-ON-ERROR':'false'}).status,0);
    assert.equal(run({'INPUT_FAIL-ON-ERROR':'nonsense'}).status,1);
    assert.equal(run({INPUT_DIRECTORY:'empty','INPUT_FAIL-ON-ERROR':'false'}).status,1);
    assert.match(await readFile(env.GITHUB_OUTPUT,'utf8'),/failures=3/);
    await mkdir(path.join(root,'google'));
    await writeFile(path.join(root,'google','small.png'),png(320,640));
    assert.equal(run({INPUT_DIRECTORY:'google',INPUT_TARGET:'google-phone'}).status,0);
    assert.equal(run({INPUT_DIRECTORY:'google',INPUT_TARGET:'google-phone','INPUT_FAIL-ON-REVIEW':'true'}).status,1);
  } finally {await rm(root,{recursive:true,force:true});}
});
