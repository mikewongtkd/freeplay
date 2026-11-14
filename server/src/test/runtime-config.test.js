'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {loadConfig} = require('../runtime-config');

test('runtime JSON configuration resolves paths relative to its file', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'config.json');
  fs.writeFileSync(file,JSON.stringify({fp_conf:{video_dir:'video',db:'freeplay.sqlite',port:9010}}));
  assert.deepEqual(loadConfig(file),{video_dir:path.join(dir,'video'),db:path.join(dir,'freeplay.sqlite'),port:9010});
});
test('missing local configuration uses defaults; explicit missing files fail', () => {
  assert.equal(loadConfig('/nonexistent/freeplay/config.json').port,9000);
  assert.throws(()=>loadConfig('/nonexistent/freeplay/config.json',{fallback:false}),error=>error.code==='ENOENT');
});
test('malformed or incomplete configuration fails clearly instead of silently using defaults', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'config.json');
  for(const value of ['{','{}','null',JSON.stringify({fp_conf:{video_dir:'',db:'x',port:9000}}),JSON.stringify({fp_conf:{video_dir:'x',db:'x',port:'9000'}}),JSON.stringify({fp_conf:{video_dir:'x',db:'x',port:65536}})]) {
    fs.writeFileSync(file,value);assert.throws(()=>loadConfig(file));
  }
});
