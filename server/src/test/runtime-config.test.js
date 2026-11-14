'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {loadConfig} = require('../runtime-config');
const defaultRoot = path.resolve(__dirname, '../..');
const defaultPaths = {root:defaultRoot,dataDir:'/data',schemaPath:path.join(defaultRoot,'share/freeplay/db/schema.sql')};

test('runtime JSON configuration resolves paths relative to its file', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'config.json');
  fs.writeFileSync(file,JSON.stringify({fpConf:{videoDir:'video',db:'freeplay.sqlite',port:9010}}));
  assert.deepEqual(loadConfig(dir),{...defaultPaths,videoDir:path.join(dir,'video'),db:path.join(dir,'freeplay.sqlite'),port:9010});
});
test('missing local configuration is copied from config-default.json and loaded', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const content=JSON.stringify({fpConf:{videoDir:'video',db:'test.sqlite',port:9123}});
  fs.writeFileSync(path.join(dir,'config-default.json'),content);
  assert.equal(loadConfig(dir).port,9123);
  assert.equal(fs.readFileSync(path.join(dir,'config.json'),'utf8'),content);
  fs.writeFileSync(path.join(dir,'config-default.json'),'{}');
  assert.equal(loadConfig(dir).port,9123,'existing local config is never overwritten');
});
test('missing default file uses the original hardcoded settings', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  assert.deepEqual(loadConfig(dir),{...defaultPaths,videoDir:'/data/video',db:'/data/freeplay.sqlite',port:9000});
  assert.equal(fs.existsSync(path.join(dir,'config.json')),false);
});
test('copy failure uses hardcoded settings', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  t.mock.method(fs,'copyFileSync',()=>{throw Object.assign(new Error('permission denied'),{code:'EACCES'});});
  assert.deepEqual(loadConfig(dir),{...defaultPaths,videoDir:'/data/video',db:'/data/freeplay.sqlite',port:9000});
});
test('malformed or incomplete configuration fails clearly instead of silently using defaults', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'config.json');
  for(const value of ['{','{}','null',JSON.stringify({fpConf:{videoDir:'',db:'x',port:9000}}),JSON.stringify({fpConf:{videoDir:'x',db:'x',port:'9000'}}),JSON.stringify({fpConf:{videoDir:'x',db:'x',port:65536}})]) {
    fs.writeFileSync(file,value);assert.throws(()=>loadConfig(dir));
  }
});

test('root, dataDir and schemaPath can be configured independently', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-config-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const fpConf={root:'app',dataDir:'data',schemaPath:'db/custom.sql',videoDir:'recordings',db:'database.sqlite',port:9011};
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({fpConf}));
  const config=loadConfig(dir);
  assert.equal(config.root,path.join(dir,'app'));
  assert.equal(config.dataDir,path.join(dir,'data'));
  assert.equal(config.schemaPath,path.join(dir,'app/db/custom.sql'));
  delete fpConf.schemaPath;
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({fpConf}));
  assert.equal(loadConfig(dir).schemaPath,path.join(dir,'app/share/freeplay/db/schema.sql'));
});
