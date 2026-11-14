'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const {once} = require('events');
const {spawnSync} = require('child_process');
const {thumbnailConfig} = require('../thumbnail-config');
const {planRequest, sourceKey} = require('../thumbnail-planner');
const {extractConfig, FragmentedMp4Recorder} = require('../recorder');

const config = overrides => ({...thumbnailConfig({videoDir:os.tmpdir(), env:{}}), ...overrides});
const query = overrides => new URLSearchParams({ring:'1', camera:'1', startEpochUs:'1000000', endEpochUs:'3000000', ...overrides});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('thumbnail planner keeps integer timestamp precision and enforces bounds', () => {
  const c = config();
  const p = planRequest(query({startEpochUs:'9007199254740993', endEpochUs:'9007199259740994'}), c);
  assert.deepEqual(p.times, ['9007199254740993', '9007199259740993']);
  for (const overrides of [{ring:'0'}, {camera:'4'}, {startEpochUs:'1.5'}, {width:'10000'}, {intervalMs:'0'}, {endEpochUs:'1'}, {endEpochUs:'9223372036854775808'}, {endEpochUs:'9999999999999999999999999'}, {endEpochUs:'99999999999999'}])
    assert.throws(() => planRequest(query(overrides), c), error => error.status === 400);
  assert.throws(() => thumbnailConfig({videoDir:os.tmpdir(), env:{THUMBNAIL_WORKERS:'999'}}));
});

test('cache identity separates camera, session, codec, frame and width', () => {
  const row = {camera_id:1, session_id:1, file_id:1, codec_config_version:1, id:1, start_time_epoch_us:1000000n, start_pts_us:'0', path:'one.mp4', file_offset:100, file_length:100};
  const key = sourceKey(row, 240);
  for (const field of ['camera_id','session_id','file_id','codec_config_version','id','start_time_epoch_us'])
    assert.notEqual(sourceKey({...row, [field]:2}, 240), key);
  assert.notEqual(sourceKey(row, 320), key);
});

function fixture(t) {
  const Database = require('better-sqlite3');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freeplay-thumbnails-'));
  const videoDir = path.join(root, 'video'); fs.mkdirSync(videoDir);
  const dbPath = path.join(root, 'source.sqlite');
  const db = new Database(dbPath);
  db.exec(fs.readFileSync(path.resolve(__dirname, '../../deploy/db/schema.sql'), 'utf8'));
  const ffmpeg = process.env.THUMBNAIL_FFMPEG || 'ffmpeg';
  const encoded = spawnSync(ffmpeg, ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x180:r=1','-frames:v','1','-c:v','libx264','-threads','1','-profile:v','baseline','-pix_fmt','yuv420p','-f','h264','pipe:1'], {maxBuffer:1024*1024});
  assert.equal(encoded.status, 0, 'FFmpeg/libx264 fixture prerequisite: ' + String(encoded.stderr));
  const codecConfig = extractConfig(encoded.stdout);
  assert.ok(codecConfig);
  db.prepare("INSERT INTO cameras(id,stream_id,ring,camera,width,height,fps) VALUES (1,'ring1_cam1',1,1,320,180,1),(2,'ring1_cam2',1,2,320,180,1)").run();
  let fileId = 0;
  const add = (session, start, version = 1, opts = {}) => {
    db.prepare('INSERT OR IGNORE INTO sessions(id,camera_id,codec_config_version) VALUES (?,1,?)').run(session,version);
    db.prepare("INSERT OR IGNORE INTO codec_configurations(camera_id,session_id,version,received_at,pts_us,sps,pps,avcc) VALUES (1,?,?,'now','0',?,?,?)").run(session,version,codecConfig.sps,codecConfig.pps,codecConfig.avcC);
    const gop = {startServerEpochUs:BigInt(start), endServerEpochUs:BigInt(start)+900000n, startPtsUs:0n, endPtsUs:0n, buffers:[{ptsUs:0n,flags:1,payload:encoded.stdout}]};
    let file, offset, length;
    const recorder = new FragmentedMp4Recorder({videoDir,hello:{ring:1,camera:1,width:320,height:180},fileSeconds:60,
      onOpen:(filename) => {file=filename;return ++fileId;},onFragment:(_,g,o,l)=>{offset=o;length=l;},onClose:()=>{}});
    recorder.codecConfig=codecConfig; recorder.write(gop);recorder.close();
    db.prepare('INSERT INTO files(id,camera_id,session_id,path,started_at,codec_config_version,complete) VALUES (?,1,?,?,?, ?,?)').run(fileId,session,file,'now',version,opts.open?0:1);
    const id = db.prepare("INSERT INTO gop_index(camera_id,session_id,file_id,start_time_epoch_us,end_time_epoch_us,start_pts_us,end_pts_us,keyframe_pts_us,byte_size,buffer_count,file_offset,file_length,complete) VALUES (1,?,?,?,?, '0','0','0',?,1,?,?,?)").run(session,fileId,start,BigInt(start)+900000n,length,offset,opts.partial?length+100000:length,opts.incomplete?0:1).lastInsertRowid;
    return {id,file,offset,length};
  };
  const first = add(1,1000000), second = add(2,3000000,2);
  const c = config({cacheDir:path.join(videoDir,'thumbnails'), ffmpeg, intervalMs:60000, perCameraQueue:4, queueMax:4});
  t.after(() => { db.close(); fs.rmSync(root,{recursive:true,force:true}); });
  return {db,dbPath,root,videoDir,config:c,first,second,add};
}
async function ready(engine, plan) {
  let result;
  for (let i=0;i<150;i++) {
    result=await engine.metadata(plan);
    if (result.samples.every(s=>s.status!=='pending')) return result;
    await sleep(30);
  }
  assert.fail(JSON.stringify(result));
}

test('real FFmpeg worker engine decodes indexed keyframes, preserves gaps and reuses cache after restart', async t => {
  const {ThumbnailEngine,jpegDimensions} = require('../thumbnail-engine');
  const f=fixture(t);
  let engine=new ThumbnailEngine(f); await engine.initialize();
  t.after(async()=>{if(!engine.closed) await engine.close();});
  const plan=planRequest(query({endEpochUs:'4000000',intervalMs:'1000'}),f.config);
  const initial=await engine.metadata(plan);
  assert.equal(initial.samples[0].status,'pending');
  assert.equal(initial.samples[1].reason,'recording_gap');
  const result=await ready(engine,plan);
  assert.deepEqual(result.samples.map(s=>s.status),['ready','unavailable','ready']);
  assert.deepEqual(result.samples.filter(s=>s.status==='ready').map(s=>s.sessionId),['1','2']);
  assert.equal(result.samples[0].actualEpochUs,'1000000');
  const key=result.samples[0].key;
  assert.deepEqual(jpegDimensions(await engine.image(key)),{width:240,height:136});
  const completed=engine.metrics.completed;
  await Promise.all([engine.metadata(plan),engine.metadata(plan)]);
  assert.equal(engine.metrics.completed,completed);
  const before=planRequest(query({startEpochUs:'999999',endEpochUs:'1000000'}),f.config);
  assert.equal((await engine.metadata(before)).samples[0].status,'unavailable');
  const tolerance=planRequest(query({startEpochUs:'1800000',endEpochUs:'1800001'}),{...f.config,toleranceMs:100});
  engine.config.toleranceMs=100;
  assert.equal((await engine.metadata(tolerance)).samples[0].reason,'recording_gap');
  engine.config.toleranceMs=1500;
  f.add(3,5000000,1,{partial:true});
  const partial=planRequest(query({startEpochUs:'5000000',endEpochUs:'5000001'}),f.config);
  assert.equal((await ready(engine,partial)).samples[0].reason,'source_pending');
  await engine.close();
  engine=new ThumbnailEngine(f);await engine.initialize();
  assert.equal((await engine.metadata(plan)).samples[0].status,'ready');
  assert.equal(engine.metrics.completed,0);
  fs.unlinkSync(f.first.file);
  await assert.rejects(engine.image(key),error=>error.status===404);
});

test('missing decoder and bounded queue failures stay isolated', async t => {
  const {ThumbnailEngine}=require('../thumbnail-engine');
  const f=fixture(t);
  const engine=new ThumbnailEngine({...f,config:{...f.config,ffmpeg:'/missing/freeplay-ffmpeg'}});
  await engine.initialize();t.after(()=>engine.close());
  const plan=planRequest(query(),f.config);
  assert.equal((await engine.metadata(plan)).samples[0].reason,'decoder_unavailable');
  await assert.rejects(engine.metadata({...plan,streamId:'ring14_cam3'}),error=>error.status===404);
  engine.decoder=true;engine.paused=true;engine.config.perCameraQueue=1;
  const two=planRequest(query({endEpochUs:'4000000',intervalMs:'1000'}),f.config);
  const result=await engine.metadata(two);
  assert.equal(result.samples[0].status,'pending');
  assert.equal(result.samples[2].reason,'queue_full');
  assert.equal(engine.queue.length,1);
});

test('HTTP thumbnail routes share replay tokens, CORS, cache bounds and feature disable behavior', async t => {
  const {ThumbnailService}=require('../thumbnail-service');
  const {ReplayService}=require('../replay-service');
  const f=fixture(t);
  const replayService=new ReplayService({...f,liveStreams:new Map()});
  const service=new ThumbnailService({...f,replayService});
  const server=http.createServer((req,res)=>{void service.handle(req,res,new URL(req.url,'http://localhost'));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(let i=0;i<100&&!service.ready;i++) await sleep(30);
  assert.ok(service.ready);
  const url=base+'/api/ivr/v1/thumbnails?'+query().toString();
  let payload;
  for(let i=0;i<100;i++) {const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');payload=await response.json();if(payload.samples[0].status==='ready')break;await sleep(30);}
  assert.equal(payload.ok,true);assert.equal(payload.apiVersion,'1');
  assert.equal(payload.samples[0].status,'ready');
  assert.doesNotMatch(JSON.stringify(payload),new RegExp(f.root));
  const imageUrl=payload.samples[0].imageUrl;
  const image=await fetch(base+imageUrl);
  assert.equal(image.headers.get('content-type'),'image/jpeg');assert.equal(image.headers.get('cache-control'),'no-store');assert.ok((await image.arrayBuffer()).byteLength>100);
  const option=await fetch(url,{method:'OPTIONS'});assert.equal(option.status,204);
  assert.equal((await fetch(base+'/api/ivr/v1/thumbnails?'+query({width:'999999'}))).status,400);
  const token=imageUrl.split('/').at(-1).slice(0,-4);replayService.tokens.get(token).expiresAt=0;
  assert.equal((await fetch(base+imageUrl)).status,404);
  const disabled=new ThumbnailService({...f,config:{...f.config,enabled:false},replayService});
  assert.equal(disabled.worker,undefined);
  await assert.rejects(disabled.call('metadata',{},'local'),error=>error.status===503);
});

test('partial/corrupt sources, missing codec, path escape and cache eviction are controlled', async t => {
  const {ThumbnailEngine}=require('../thumbnail-engine');
  const f=fixture(t);const engine=new ThumbnailEngine(f);await engine.initialize();t.after(()=>engine.close());
  const one=planRequest(query({endEpochUs:'1000001'}),f.config);
  let result=await ready(engine,one);assert.equal(result.samples[0].status,'ready');
  const key=result.samples[0].key;
  fs.writeFileSync(engine.filename(key),Buffer.from('corrupt'));
  await assert.rejects(engine.image(key),error=>error.status===404);
  f.db.prepare('UPDATE files SET path=? WHERE id=1').run('../outside.mp4');
  result=await ready(engine,one);assert.equal(result.samples[0].reason,'generation_failed');
  const missing=f.add(3,5000000);f.db.prepare('DELETE FROM codec_configurations WHERE session_id=3').run();
  const plan=planRequest(query({startEpochUs:'5000000',endEpochUs:'5000001'}),f.config);
  assert.equal((await engine.metadata(plan)).samples[0].reason,'codec_configuration_missing');
  f.add(4,7000000,1,{incomplete:true});
  assert.equal((await engine.metadata({...plan,times:['7000000']})).samples[0].reason,'incomplete_gop');
  const second=planRequest(query({startEpochUs:'3000000',endEpochUs:'3000001'}),f.config);
  result=await ready(engine,second);assert.equal(result.samples[0].status,'ready');
  engine.config.cacheBytes=1;await engine.evict();
  assert.equal(engine.metrics.cacheBytes,0);assert.equal(engine.cache.prepare('SELECT count(*) n FROM images').get().n,0);
  assert.ok(fs.existsSync(f.second.file),'thumbnail eviction never removes recordings');
  assert.equal((await ready(engine,second)).samples[0].reason,'cache_capacity');
});

test('decoder timeouts kill bounded subprocesses and do not publish corrupt cache entries', async t => {
  const {ThumbnailEngine}=require('../thumbnail-engine');
  const f=fixture(t);
  const fake=path.join(f.root,'slow-ffmpeg');
  fs.writeFileSync(fake,`#!${process.execPath}\nif (process.argv.includes('-version')) process.exit(0); setInterval(()=>{},1000);\n`,{mode:0o700});
  const engine=new ThumbnailEngine({...f,config:{...f.config,ffmpeg:fake}});await engine.initialize();t.after(()=>engine.close());engine.config.timeoutMs=100;
  const result=await ready(engine,planRequest(query(),f.config));
  assert.equal(result.samples[0].reason,'decoder_timeout');
  assert.equal(engine.children.size,0);
  assert.equal(engine.cache.prepare('SELECT count(*) n FROM images').get().n,0);
});

test('production Node routing serves thumbnails while FPV1 ingestion and replay continue', async t => {
  const {spawn}=require('child_process');
  const WebSocket=require('ws');
  const f=fixture(t);
  const boot=`const config=require(${JSON.stringify(path.resolve(__dirname,'../runtime-config.js'))});const load=config.loadConfig;config.loadConfig=()=>load(${JSON.stringify(f.root)});const app=require(${JSON.stringify(path.resolve(__dirname,'../freeplay.js'))});app.server.on('listening',()=>process.send({port:app.server.address().port}));`;
  const configPath=path.join(f.root,'config.json');
  fs.writeFileSync(configPath,JSON.stringify({fpConf:{port:0,db:f.dbPath,videoDir:f.videoDir,dataDir:f.root,schemaPath:path.resolve(__dirname,'../../deploy/db/schema.sql')}}));
  const child=spawn(process.execPath,['-e',boot],{stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,THUMBNAILS_ENABLED:'true',THUMBNAIL_DEFAULT_INTERVAL_MS:'5000'}});
  let diagnostics='';child.stdout.on('data',()=>{});child.stderr.on('data',data=>{diagnostics=(diagnostics+data).slice(-4000);});
  t.after(async()=>{if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),6000);await exited;clearTimeout(timer);}});
  const [message]=await once(child,'message',{signal:AbortSignal.timeout(10000)});
  const base=`http://127.0.0.1:${message.port}`;
  const url=base+'/api/ivr/v1/thumbnails?'+query();
  let response;
  for(let i=0;i<100;i++){response=await fetch(url);if(response.status===200)break;await sleep(30);}
  assert.equal(response.status,200,diagnostics);
  const ws=new WebSocket(`ws://127.0.0.1:${message.port}`);await once(ws,'open');
  t.after(()=>ws.terminate());
  ws.send(JSON.stringify({type:'hello',protocol:'freeplay-ingest',version:1,streamId:'ring1_cam2',ring:1,camera:2,codec:'h264',width:320,height:180,fps:1,bitrate:100000,keyframeInterval:1}));
  const [ack]=await once(ws,'message');assert.equal(JSON.parse(ack).accepted,true);
  const source=f.db.prepare('SELECT avcc FROM codec_configurations LIMIT 1').get();
  // Use the same redistributable synthetic encoding as the fixture, extracted from its fMP4 fragment via FFmpeg.
  const encoded=spawnSync(f.config.ffmpeg,['-loglevel','error','-i',f.first.file,'-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264','pipe:1'],{maxBuffer:1024*1024});
  assert.equal(encoded.status,0);assert.ok(source.avcc.length);
  for(let i=0;i<3;i++){
    const header=Buffer.alloc(32);header.write('FPV1');header.writeBigInt64BE(BigInt(i)*1000000n,4);header.writeUInt32BE(i,12);header.writeUInt32BE(1,16);header.writeUInt32BE(encoded.stdout.length,20);header.writeBigUInt64BE(BigInt(i)*1000000000n,24);
    ws.send(Buffer.concat([header,encoded.stdout]));
  }
  let payload;
  for(let i=0;i<100;i++){
    const [thumb,health,replay]=await Promise.all([fetch(url).then(r=>r.json()),fetch(base+'/health').then(r=>r.json()),fetch(base+'/api/ivr/v1/replay?ring=1&camera=1&timeEpochUs=1000000&beforeSeconds=0&afterSeconds=1').then(r=>r.json())]);
    assert.equal(replay.ok,true);
    payload=thumb;
    if(payload.samples?.[0].status==='ready'&&health.finalizedGops>=2)break;
    await sleep(30);
  }
  assert.equal(payload.samples[0].status,'ready',diagnostics);
  assert.ok(f.db.prepare('SELECT COUNT(*) n FROM gop_index WHERE camera_id=2').get().n>=2,'ingestion finalizes GOPs during thumbnail/replay requests');
  const image=await fetch(base+payload.samples[0].imageUrl);assert.equal(image.status,200);
  assert.equal(image.headers.get('content-type'),'image/jpeg');
});

test('SQLite sampling preserves epoch microseconds above Number safe precision', async t => {
  const {ThumbnailEngine}=require('../thumbnail-engine');const f=fixture(t);
  const timestamp=9007199254740993n;f.add(4,timestamp);
  const engine=new ThumbnailEngine(f);await engine.initialize();t.after(()=>engine.close());
  const plan=planRequest(query({startEpochUs:String(timestamp),endEpochUs:String(timestamp+1n)}),f.config);
  const result=await ready(engine,plan);
  assert.equal(result.samples[0].actualEpochUs,String(timestamp));
  assert.equal(result.samples[0].status,'ready');
});

test('optional background generation coalesces indexed work and shutdown drops its queue', async t => {
  const {ThumbnailEngine}=require('../thumbnail-engine');const f=fixture(t);
  const engine=new ThumbnailEngine(f);await engine.initialize();engine.paused=true;
  await engine.background();assert.equal(engine.queue.length,1);
  await engine.background();assert.equal(engine.queue.length,1);
  const first=await engine.metadata({streamId:'ring1_cam1',times:['3000000'],width:240});
  assert.equal(first.samples[0].status,'pending');assert.equal(engine.queue.length,1);
  await engine.close();assert.equal(engine.queue.length,0);assert.equal(engine.children.size,0);
});

test('shutdown during the startup probe kills the decoder child', async t => {
  const {ThumbnailService}=require('../thumbnail-service');const {ReplayService}=require('../replay-service');
  const f=fixture(t);const pidfile=path.join(f.root,'decoder.pid'),fake=path.join(f.root,'startup-ffmpeg');
  fs.writeFileSync(fake,`#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(pidfile)},String(process.pid));setInterval(()=>{},1000);\n`,{mode:0o700});
  const service=new ThumbnailService({...f,config:{...f.config,ffmpeg:fake},replayService:new ReplayService({...f,liveStreams:new Map()})});
  for(let i=0;i<100&&!fs.existsSync(pidfile);i++)await sleep(20);
  assert.ok(fs.existsSync(pidfile));const pid=Number(fs.readFileSync(pidfile,'utf8'));
  await service.close();
  assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
});
