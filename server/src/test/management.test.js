'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {inspect,datePreview,mediaPath,timestampUs,storageProbe} = require('../management/inspection');
const {configuration,store,acquire,executeNext} = require('../management/worker');
// Dependency injection allows fixtures on development hosts without a compatible
// better-sqlite3 binary. Production continues to use the repository's driver.
let sqlite;
try { sqlite = require('node:sqlite'); } catch { /* Older supported Node: use native driver below. */ }
class NativeAdapter {
  constructor(file, options = {}) { this.db = new sqlite.DatabaseSync(file,{readOnly:options.readonly || false}); }
  prepare(sql) { return this.db.prepare(sql); }
  exec(sql) { return this.db.exec(sql); }
  pragma(sql) { return this.db.prepare('PRAGMA ' + sql).all(); }
  close() { this.db.close(); }
  backup(file, options = {}) { return sqlite.backup(this.db,file,options); }
  transaction(fn) {
    const run = () => { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } };
    run.immediate = run; return run;
  }
}
function driver(t) {
  if (sqlite) return NativeAdapter;
  try { const Driver = require('better-sqlite3'); const db = new Driver(':memory:'); db.close(); return Driver; }
  catch { t.skip('No usable SQLite driver'); return null; }
}
function fixture(t) {
  const Driver = driver(t); if (!Driver) return null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-management-'));
  const videoDir = path.join(root,'video'); fs.mkdirSync(videoDir);
  const dbFile = path.join(root,'source.sqlite'); const db = new Driver(dbFile);
  db.exec(fs.readFileSync(path.join(__dirname,'../../deploy/db/schema.sql'),'utf8'));
  db.exec("INSERT INTO cameras(id,stream_id,ring,camera) VALUES (1,'ring1_cam1',1,1),(2,'ring2_cam1',2,1)");
  db.exec("INSERT INTO sessions(id,camera_id,started_at,ended_at) VALUES (1,1,'2026-11-26T23:00:00Z','2026-11-28T12:00:00Z'),(2,2,'2026-11-20T10:00:00Z','2026-11-20T11:00:00Z')");
  const start = Date.parse('2026-11-27T08:00:00Z')*1000;
  const end = Date.parse('2026-11-28T08:00:00Z')*1000;
  fs.writeFileSync(path.join(videoDir,'selected.mp4'),Buffer.alloc(100));
  fs.writeFileSync(path.join(videoDir,'unrelated.mp4'),Buffer.alloc(100));
  db.prepare("INSERT INTO files(id,camera_id,session_id,path,started_at,ended_at,byte_size,gop_count,complete) VALUES (1,1,1,'video/selected.mp4','2026-11-27T07:59:00Z','2026-11-27T08:01:00Z',100,1,1),(2,2,2,'video/unrelated.mp4','2026-11-20T10:00:00Z','2026-11-20T10:01:00Z',100,1,1)").run();
  db.prepare('INSERT INTO gop_index(id,camera_id,session_id,file_id,start_time_epoch_us,end_time_epoch_us,start_pts_us,end_pts_us,keyframe_pts_us,byte_size,buffer_count,file_offset,file_length) VALUES (1,1,1,1,?,?,0,100,0,10,1,10,10)').run(start-60000000,start+60000000);
  db.prepare('INSERT INTO events(id,event_time_epoch_us) VALUES (1,?),(2,?),(3,NULL)').run(start+1,end);
  t.after(() => { db.close(); fs.rmSync(root,{recursive:true,force:true}); });
  return {root,videoDir,dbFile,db,Driver,interval:{startUs:start,endUs:end}};
}

test('date preview keeps complete boundary files and excludes unrelated full-session media', t => {
  const f=fixture(t); if(!f)return;
  const before=f.db.prepare('SELECT count(*) AS n FROM files').get().n;
  const result=datePreview(f.db,f.interval);
  assert.deepEqual(result.selectedIds.files,[1]);
  assert.deepEqual(result.selectedIds.cameras,[1]);
  assert.deepEqual(result.selectedIds.events,[1]);
  assert.equal(result.counts.test_runs,0);
  assert.equal(result.boundaryDependencies.length,1);
  assert.ok(result.ambiguous.some(r=>r.table==='events'&&r.id===3));
  assert.equal(result.archiveEligible,false);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM files').get().n,before);
});

test('IVR preview closes linked review parents, nullable match links, and review children',t=>{
  const f=fixture(t);if(!f)return;
  f.db.exec("INSERT INTO ivr_tournaments(id,name) VALUES (1,'Selected'),(2,'Other'); INSERT INTO ivr_rings(id,tournament_id,ring_number) VALUES (1,1,1),(2,2,2)");
  f.db.prepare("INSERT INTO ivr_review_requests(id,public_id,ring_id,match_id,side,origin,request_mark_epoch_us,linked_review_id) VALUES (1,'R001',1,NULL,'chung','coach',?,NULL),(2,'R002',1,NULL,'hong','referee',?,1)").run(f.interval.startUs-1,f.interval.startUs+1);
  f.db.prepare("INSERT INTO ivr_review_audit_events(review_request_id,occurred_at_epoch_us,event_type) VALUES (1,?,'requested')").run(f.interval.startUs-1);
  const result=datePreview(f.db,f.interval);
  assert.deepEqual(result.selectedIds.ivr_review_requests.sort(),[1,2]);
  assert.deepEqual(result.selectedIds.ivr_tournaments,[1]);
  assert.equal(result.counts.ivr_review_audit_events,1);
});

test('quality differentiates nullable RAM GOPs from invalid disk extents',t=>{
  const f=fixture(t);if(!f)return;
  f.db.exec('UPDATE gop_index SET file_offset=95,file_length=10 WHERE id=1');
  f.db.prepare('INSERT INTO gop_index(camera_id,session_id,file_id,start_time_epoch_us,end_time_epoch_us,start_pts_us,end_pts_us,keyframe_pts_us,byte_size,buffer_count,complete) VALUES (1,1,NULL,?,?,0,1,0,1,1,0)').run(f.interval.startUs,f.interval.startUs+1);
  const result=inspect(f.db,f);
  assert.ok(result.findings.some(r=>r.code==='invalid_byte_range'&&r.severity==='error'));
  assert.ok(result.findings.some(r=>r.code==='incomplete_or_ram_gop'&&r.severity==='info'));
  assert.deepEqual(result.repairs,[]);
});

test('media paths reject traversal, symlinks and missing files',t=>{
  const f=fixture(t);if(!f)return;
  fs.symlinkSync(f.root,path.join(f.videoDir,'escape'));
  assert.throws(()=>mediaPath(f.root,f.videoDir,'../outside.mp4'));
  assert.throws(()=>mediaPath(f.root,f.videoDir,'video/escape/source.sqlite'),/symlink/);
  assert.throws(()=>mediaPath(f.root,f.videoDir,'video/missing.mp4'));
  assert.equal(mediaPath(f.root,f.videoDir,'video/selected.mp4'),fs.realpathSync(path.join(f.videoDir,'selected.mp4')));
  assert.equal(timestampUs('2026-11-27 12:00:00'),null);
  assert.equal(timestampUs('1000000'),null);
});

test('admin lock and operation constraint reject concurrency; WAL snapshot includes committed data',async t=>{
  const f=fixture(t);if(!f)return;
  const cfg={...f,db:f.dbFile,managementDb:path.join(f.root,'management.sqlite')};
  const admin=store(f.Driver,cfg,path.join(__dirname,'../../deploy/db/management.sql'));
  t.after(()=>admin.close());
  acquire(admin,'first');
  assert.throws(()=>acquire(admin,'second'),/lock exists/);
  const id='a'.repeat(32), time=new Date().toISOString();
  admin.prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,'inspect','queued','{}',?,?)").run(id,time,time);
  assert.throws(()=>admin.prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,'inspect','queued','{}',?,?)").run('b'.repeat(32),time,time));
  f.db.pragma('journal_mode=WAL');f.db.pragma('wal_autocheckpoint=0');
  f.db.exec("INSERT INTO configuration(key,value) VALUES ('management-test','committed-in-wal')");
  await executeNext(admin,f.Driver,cfg);
  const op=admin.prepare('SELECT * FROM operations WHERE id=?').get(id);
  assert.equal(op.state,'completed',op.error);
  const result=JSON.parse(op.result);
  const copy=new f.Driver(result.snapshot,{readonly:true});
  assert.equal(copy.prepare("SELECT value FROM configuration WHERE key='management-test'").get().value,'committed-in-wal');copy.close();
  assert.equal(result.counts.files,2);
  assert.ok(admin.prepare("SELECT * FROM operation_steps WHERE operation_id=? AND phase='intent'").all(id).length>=3);
});

test('failed snapshot preserves live database and reports failure',async t=>{
  const f=fixture(t);if(!f)return;
  const cfg={...f,db:path.join(f.root,'missing.sqlite'),managementDb:path.join(f.root,'management.sqlite')};
  const admin=store(f.Driver,cfg,path.join(__dirname,'../../deploy/db/management.sql'));t.after(()=>admin.close());
  const id='c'.repeat(32),time=new Date().toISOString();
  admin.prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,'inspect','queued','{}',?,?)").run(id,time,time);
  await executeNext(admin,f.Driver,cfg);
  assert.equal(admin.prepare('SELECT state FROM operations WHERE id=?').get(id).state,'failed');
  assert.equal(fs.existsSync(cfg.db),false);
});

test('storage form paths fail closed without creating directories',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-mount-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assert.throws(()=>storageProbe('/'));
  assert.throws(()=>storageProbe(root+'/../escape'));
  assert.throws(()=>storageProbe(root+'/missing'));
  assert.equal(fs.existsSync(root+'/missing'),false);
  fs.symlinkSync(root,path.join(root,'link'));
  assert.throws(()=>storageProbe(path.join(root,'link')),/symlink/);
});

test('configuration rejects tournament/admin aliases',t=>{
  const f=fixture(t);if(!f)return;
  const file=path.join(f.root,'config.json');
  fs.writeFileSync(file,JSON.stringify({fpConf:{db:f.dbFile,managementDb:f.dbFile}}));
  assert.throws(()=>configuration(file),/separate/);
});

test('PHP date arithmetic covers DST, inclusive multi-day ranges, invalid input and password validation',t=>{
  const php=process.env.FREEPLAY_PHP || (fs.existsSync('/opt/homebrew/bin/php')?'/opt/homebrew/bin/php':'php');
  const common=path.join(__dirname,'../../public/admin/data/common.php');
  const result=spawnSync(php,['-r',`require ${JSON.stringify(common)};
    $spring=management_interval('2026-03-08','','America/Los_Angeles');
    $fall=management_interval('2026-11-01','','America/Los_Angeles');
    $multi=management_interval('2026-03-07','2026-03-09','America/Los_Angeles');
    if (($spring['endUs']-$spring['startUs'])!==23*3600000000) exit(1);
    if (($fall['endUs']-$fall['startUs'])!==25*3600000000) exit(2);
    if (($multi['endUs']-$multi['startUs'])!==71*3600000000) exit(3);
    foreach ([['2026-02-30','','UTC'],['2026-01-02','2026-01-01','UTC'],['2026-01-01','','invalid']] as $args) {
      try { management_interval(...$args); exit(4); } catch (InvalidArgumentException $e) {}
    }
    $_SESSION=['csrf'=>'token']; $_SERVER['HTTP_X_CSRF_TOKEN']='wrong';
    if (management_csrf()) exit(5);
    $_SERVER['HTTP_X_CSRF_TOKEN']='token';if (!management_csrf()) exit(6);
    $hash=password_hash('secret',PASSWORD_DEFAULT);
    if(management_authorized(['adminPass'=>$hash]))exit(7);
    $_SESSION['admin_hash']=hash('sha256',$hash);if(!management_authorized(['adminPass'=>$hash]))exit(8);
    if(management_authorized(['adminPass'=>password_hash('changed',PASSWORD_DEFAULT)]))exit(9);
    if(!management_authorized([])||!management_authorized(['adminPass'=>'']))exit(10);
  `],{encoding:'utf8'});
  if(result.error?.code==='ENOENT'){t.skip('PHP not installed');return;}
  assert.equal(result.status,0,result.stderr);
});

test('HTTP console enforces password, CSRF, operation allowlist and queue exclusion',async t=>{
  const php=process.env.FREEPLAY_PHP || (fs.existsSync('/opt/homebrew/bin/php')?'/opt/homebrew/bin/php':'php');
  const hash=spawnSync(php,['-r',"echo password_hash('test-secret',PASSWORD_DEFAULT);"],{encoding:'utf8'});
  if(hash.error?.code==='ENOENT'){t.skip('PHP not installed');return;}
  assert.equal(hash.status,0,hash.stderr);
  const net=require('node:net');
  const listener=net.createServer();
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const port=listener.address().port; await new Promise(resolve=>listener.close(resolve));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-admin-http-'));
  const configFile=path.join(root,'config.json');
  const config={fpConf:{adminPass:hash.stdout,dataDir:root,db:path.join(root,'source.sqlite')}};
  config.fpConf.videoDir=path.join(root,'video');fs.mkdirSync(config.fpConf.videoDir);
  for (const day of ['2026-11-03','2026-11-01','2026-02-30','unrelated']) fs.mkdirSync(path.join(config.fpConf.videoDir,day));
  fs.writeFileSync(path.join(config.fpConf.videoDir,'2026-11-02'),'not a directory');
  fs.symlinkSync(root,path.join(config.fpConf.videoDir,'2026-11-04'));
  fs.writeFileSync(configFile,JSON.stringify(config));
  const {spawn}=require('node:child_process');
  const server=spawn(php,['-d','session.save_path='+root,'-S','127.0.0.1:'+port,'-t',path.join(__dirname,'../../public')],{env:{...process.env,FREEPLAY_CONFIG:configFile},stdio:['ignore','ignore','pipe']});
  let logs='';server.stderr.on('data',chunk=>{logs+=chunk;});
  t.after(async()=>{server.kill('SIGTERM');if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));fs.rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}/admin/data/`;
  let response;
  for(let attempt=0;attempt<60;attempt++) {
    try { response=await fetch(base); break; } catch { await new Promise(resolve=>setTimeout(resolve,50)); }
  }
  assert.ok(response,'PHP server failed: '+logs);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const page=await response.text();
  const token=page.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  assert.equal((await fetch(base+'api.php')).status,401);
  let login=await fetch(base,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:token,password:'test-secret'})});
  const loggedCookie=login.headers.get('set-cookie').split(';')[0];
  const logged=await login.text();const csrf=logged.match(/data-csrf="([a-f0-9]+)"/)[1];
  const post=(body,provided=csrf)=>fetch(base+'api.php',{method:'POST',headers:{Cookie:loggedCookie,'Content-Type':'application/json','X-CSRF-Token':provided},body:JSON.stringify(body)});
  assert.equal((await post({action:'inspect'},'bad')).status,403);
  assert.equal((await post({action:'archive'})).status,409);
  assert.equal((await post({action:'date-preview',startDate:'2026-02-30',timezone:'UTC'})).status,400);
  const queued=await post({action:'date-preview',startDate:'2026-11-01',timezone:'America/Los_Angeles'});
  assert.equal(queued.status,202);const {data:{id}}=await queued.json();
  assert.equal((await post({action:'inspect'})).status,409);
  assert.equal((await post({action:'cancel',id})).status,200);
  const listed=await fetch(base+'api.php?action=video-dates',{headers:{Cookie:loggedCookie}});
  assert.deepEqual((await listed.json()).data.dates,['2026-11-01','2026-11-03']);
  assert.equal((await post({action:'date-preview',dates:[]})).status,400);
  assert.equal((await post({action:'date-preview',dates:['2026-11-02']})).status,400);
  const days=await post({action:'date-preview',dates:['2026-11-03','2026-11-01']});
  assert.equal(days.status,202);
  const dayId=(await days.json()).data.id;
  const dayDetail=await fetch(base+'api.php?id='+dayId,{headers:{Cookie:loggedCookie}});
  const params=JSON.parse((await dayDetail.json()).data.operation.parameters);
  assert.deepEqual(params.dates,['2026-11-01','2026-11-03']);
  assert.equal(params.intervals.length,2);
  assert.ok(params.intervals.every(interval=>interval.timezone==='UTC'&&interval.endUs-interval.startUs===86400000000));
  assert.equal((await post({action:'cancel',id:dayId})).status,200);
  const status=await fetch(base+'api.php',{headers:{Cookie:loggedCookie}});
  assert.equal((await status.json()).data.mode.mode,'INSPECTION_ONLY');
  config.fpConf.adminPass='';fs.writeFileSync(configFile,JSON.stringify(config));
  assert.equal((await fetch(base+'api.php')).status,200);
  config.fpConf.adminPass='not-a-password-hash';fs.writeFileSync(configFile,JSON.stringify(config));
  assert.equal((await fetch(base+'api.php')).status,503);
  assert.equal(fs.existsSync(config.fpConf.db),false,'Console created the tournament database');
});

test('snapshot capacity failure creates no owned snapshot and preserves source',async t=>{
  const f=fixture(t);if(!f)return;
  const cfg={...f,db:f.dbFile,managementDb:path.join(f.root,'management.sqlite')};
  const admin=store(f.Driver,cfg,path.join(__dirname,'../../deploy/db/management.sql'));t.after(()=>admin.close());
  const id='d'.repeat(32),time=new Date().toISOString();
  admin.prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,'inspect','queued','{}',?,?)").run(id,time,time);
  t.mock.method(fs,'statfsSync',()=>({bavail:0,bsize:4096}));
  await executeNext(admin,f.Driver,cfg);
  const op=admin.prepare('SELECT * FROM operations WHERE id=?').get(id);
  assert.equal(op.state,'failed');assert.match(op.error,/Insufficient local space/);
  assert.equal(fs.existsSync(path.join(f.root,'management-work')),false);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM files').get().n,2);
});

test('inspection reports ordered check stages and measured file progress',t=>{
  const f=fixture(t);if(!f)return;
  const updates=[];
  const result=inspect(f.db,{...f,onProgress:update=>updates.push(update)});
  assert.deepEqual([...new Set(updates.map(update=>update.phase))],['tables','integrity','foreign-keys','records','media']);
  const media=updates.filter(update=>update.phase==='media');
  assert.equal(media[0].current,0);assert.equal(media[0].total,2);
  assert.equal(media.at(-1).current,2);assert.equal(media.at(-1).total,2);
  assert.ok(updates.find(update=>update.phase==='integrity').message.includes('does not provide a reliable percentage'));
  assert.equal(result.counts.files,2);
});

test('progress persists stage-local estimates, throttles updates and resets unknown stages',t=>{
  const f=fixture(t);if(!f)return;
  const {progressReporter}=require('../management/progress');
  const cfg={managementDb:path.join(f.root,'management.sqlite')};
  const admin=store(f.Driver,cfg,path.join(__dirname,'../../deploy/db/management.sql'));t.after(()=>admin.close());
  const id='e'.repeat(32),time=new Date().toISOString();
  admin.prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,'inspect','running','{}',?,?)").run(id,time,time);
  let clock=100000;
  const report=progressReporter(admin,id,()=>clock);
  const read=()=>JSON.parse(admin.prepare('SELECT progress FROM operations WHERE id=?').get(id).progress);
  report({phase:'media',message:'Checking media',current:0,total:100});
  assert.equal(read().etaSeconds,null);
  clock+=5000;report({phase:'media',message:'10 checked',current:10,total:100});
  assert.equal(read().percent,10);assert.equal(read().etaSeconds,45);
  clock+=100;report({phase:'media',message:'11 checked',current:11,total:100});
  assert.equal(read().current,10);
  report({phase:'integrity',message:'Checking integrity'});
  assert.equal(read().percent,null);assert.equal(read().etaSeconds,null);
  report({phase:'complete',message:'Finished',current:1,total:1},true);
  assert.equal(read().percent,100);assert.equal(read().etaSeconds,null);
  assert.equal(admin.prepare("SELECT count(*) AS n FROM operation_steps WHERE step='inspection-progress'").get().n,3);
});

test('selected-date worker previews preserve gaps between UTC directory dates',async t=>{
  const f=fixture(t);if(!f)return;
  const cfg={...f,db:f.dbFile,managementDb:path.join(f.root,'management.sqlite')};
  const admin=store(f.Driver,cfg,path.join(__dirname,'../../deploy/db/management.sql'));t.after(()=>admin.close());
  const dates=['2026-11-27','2026-11-29'];
  const intervals=dates.map(day=>({startUs:Date.parse(day+'T00:00:00Z')*1000,endUs:Date.parse(day+'T00:00:00Z')*1000+86400000000}));
  const id='f'.repeat(32),time=new Date().toISOString();
  admin.prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,'date-preview','queued',?,?,?)").run(id,JSON.stringify({dates,intervals}),time,time);
  await executeNext(admin,f.Driver,cfg);
  const operation=admin.prepare('SELECT * FROM operations WHERE id=?').get(id);
  assert.equal(operation.state,'completed',operation.error);
  const result=JSON.parse(operation.result);
  assert.deepEqual(result.selectedDates,dates);
  assert.deepEqual(result.previews.map(preview=>preview.interval),intervals);
  assert.ok(result.previews.every(preview=>!preview.selectedIds.events.includes(2)));
});
