'use strict';
const {result,stats,THRESHOLDS}=require('./test-utils');

function randomAccess(def,ctx,o){
  const cam=ctx.db.prepare('SELECT id,stream_id FROM cameras WHERE stream_id=?').get(o.streamId||'');
  if(!cam)return result(def,{status:'FAIL',recommendation:'Select a registered stream.'});
  const session=ctx.db.prepare('SELECT session_id,COUNT(*) gops,MIN(start_time_epoch_us) lo,MAX(end_time_epoch_us) hi FROM gop_index WHERE camera_id=? GROUP BY session_id ORDER BY MAX(id) DESC LIMIT 1').get(cam.id);
  if(!session?.gops)return result(def,{status:'FAIL',recommendation:'Record indexed GOPs before running replay validation.'});

  const first=ctx.db.prepare('SELECT * FROM gop_index WHERE camera_id=? AND session_id=? ORDER BY start_time_epoch_us LIMIT 1').get(cam.id,session.session_id);
  const last=ctx.db.prepare('SELECT * FROM gop_index WHERE camera_id=? AND session_id=? ORDER BY end_time_epoch_us DESC LIMIT 1').get(cam.id,session.session_id);
  const middle=ctx.db.prepare('SELECT * FROM gop_index WHERE camera_id=? AND session_id=? ORDER BY start_time_epoch_us LIMIT 1 OFFSET ?').get(cam.id,session.session_id,Math.floor(session.gops/2));
  const gopBoundary=ctx.db.prepare('SELECT * FROM gop_index WHERE camera_id=? AND session_id=? AND id<>? ORDER BY ABS(start_time_epoch_us-?) LIMIT 1').get(cam.id,session.session_id,middle.id,middle.start_time_epoch_us);
  const fileBoundary=ctx.db.prepare('SELECT g.* FROM gop_index g WHERE g.camera_id=? AND g.session_id=? AND g.file_id IS NOT NULL AND EXISTS(SELECT 1 FROM gop_index p WHERE p.camera_id=g.camera_id AND p.session_id=g.session_id AND p.file_id<>g.file_id AND p.start_time_epoch_us<g.start_time_epoch_us) ORDER BY g.start_time_epoch_us LIMIT 1').get(cam.id,session.session_id);
  const probes=[
    {name:'session_start',time:first.start_time_epoch_us,edge:true},
    {name:'middle_of_session',time:Math.floor((middle.start_time_epoch_us+middle.end_time_epoch_us)/2)},
    {name:'gop_boundary',time:(gopBoundary||middle).start_time_epoch_us},
    ...(fileBoundary?[{name:'file_boundary',time:fileBoundary.start_time_epoch_us}]:[]),
    {name:'session_end',time:last.end_time_epoch_us,edge:true}
  ];
  const lookup=ctx.db.prepare('SELECT g.*,f.path FROM gop_index g LEFT JOIN files f ON f.id=g.file_id WHERE g.camera_id=? AND g.session_id=? AND g.end_time_epoch_us>=? AND g.start_time_epoch_us<=? ORDER BY g.start_time_epoch_us');
  const coverageToleranceUs=100000,latencies=[],details=[],failures=[];
  for(const probe of probes){
    const requestedStart=probe.time-8000000,requestedEnd=probe.time+4000000,begin=process.hrtime.bigint();
    const rows=lookup.all(cam.id,session.session_id,requestedStart,requestedEnd);
    const latencyMs=Number(process.hrtime.bigint()-begin)/1e6;latencies.push(latencyMs);
    const overlap=rows.length>0,allCorrect=rows.every(x=>x.camera_id===cam.id&&x.session_id===session.session_id&&x.end_time_epoch_us>=requestedStart&&x.start_time_epoch_us<=requestedEnd);
    const diskRows=rows.filter(x=>x.file_id!==null&&x.path),decodableStart=rows.length>0&&rows[0].keyframe_pts_us!=null;
    const availableStart=rows.length?rows[0].start_time_epoch_us:null,availableEnd=rows.length?rows[rows.length-1].end_time_epoch_us:null;
    let largestInternalGapUs=0;for(let i=1;i<rows.length;i++)largestInternalGapUs=Math.max(largestInternalGapUs,rows[i].start_time_epoch_us-rows[i-1].end_time_epoch_us);
    const coveredStart=probe.edge||availableStart<=requestedStart+coverageToleranceUs,coveredEnd=probe.edge||availableEnd>=requestedEnd-coverageToleranceUs,continuous=largestInternalGapUs<=coverageToleranceUs;
    const ok=overlap&&allCorrect&&decodableStart&&diskRows.length>0&&coveredStart&&coveredEnd&&continuous;
    if(!ok)failures.push(probe.name);
    details.push({probe:probe.name,timeEpochUs:probe.time,rows:rows.length,diskRows:diskRows.length,latencyMs,availableStartEpochUs:availableStart,availableEndEpochUs:availableEnd,requestedStartEpochUs:requestedStart,requestedEndEpochUs:requestedEnd,decodableStart,coverageWithinTolerance:coveredStart&&coveredEnd,largestInternalGapMs:largestInternalGapUs/1000,coverageToleranceMs:coverageToleranceUs/1000,edgeClippingAllowed:!!probe.edge,passed:ok});
  }
  const latency=stats(latencies),state=failures.length?'FAIL':latency.max>THRESHOLDS.replayLookupFailMs?'FAIL':latency.max>THRESHOLDS.replayLookupWarnMs?'WARN':'PASS';
  return result(def,{status:state,expected:{latestContiguousSession:true,overlapForEveryQuery:true,correctCameraAndSession:true,decodableGopStart:true,diskFileAssociation:true,coverageToleranceMs:coverageToleranceUs/1000,warnMs:THRESHOLDS.replayLookupWarnMs,failMs:THRESHOLDS.replayLookupFailMs},actual:{streamId:cam.stream_id,sessionId:session.session_id,sessionGops:session.gops,latency,probes:details,coverageFailures:failures},metrics:{queriesRun:probes.length,queriesSuccessful:probes.length-failures.length,averageLookupLatencyMs:latency.average,maxLookupLatencyMs:latency.max,largestInternalGapMs:Math.max(...details.map(x=>x.largestInternalGapMs))},observations:[fileBoundary?'A physical file boundary was tested.':'Only one physical file was available; no file-boundary probe was possible.','Coverage allows up to 100 ms for frame/GOP receive-time granularity.','Session-edge probes permit expected pre-roll or post-roll clipping outside the recorded session.'],recommendation:state==='PASS'?null:`Replay lookup failed at: ${failures.join(', ')}. Inspect the per-probe measurement for missing coverage, file association, keyframe metadata, or a gap over 100 ms.`});
}

module.exports=[
 {id:'replay.random-access',category:'Replay / Cache',name:'Random-Access Replay Lookup',description:'Queries real indexed GOP points within the latest recorded session, including GOP, file, and session boundaries.',severity:'critical',testType:'automatic',run(ctx,o){return randomAccess(this,ctx,o);}},
 {id:'replay.ram-cache',category:'Replay / Cache',name:'RAM Replay Cache',description:'Checks bounded recent replay state and disk fallback availability.',severity:'critical',testType:'observational',locks:o=>[`stream:${o.streamId}`],evaluate(ctx,o){const s=ctx.liveStreams.get(o.streamId),c=s?.cache.getStats(),disk=ctx.db.prepare('SELECT COUNT(*) n FROM gop_index g JOIN cameras c ON c.id=g.camera_id WHERE c.stream_id=?').get(o.streamId)?.n||0;const bounded=!!c&&c.seconds<=ctx.config.ramSeconds+5&&c.bytes<=ctx.config.ramBytes;const recent=!!c&&c.seconds>=Math.min(15,ctx.config.ramSeconds*.8);return result(this,{status:bounded&&recent&&disk?'PASS':bounded?'WARN':'FAIL',expected:{bounded:true,recentSeconds:Math.min(15,ctx.config.ramSeconds),diskFallback:true},actual:{cache:c||null,diskGops:disk},metrics:{ramCacheSeconds:c?.seconds||0,ramCacheBytes:c?.bytes||0,diskIndexedGops:disk},recommendation:bounded&&recent&&disk?null:'Stream longer, or inspect cache bounds and disk indexing.'});}}
];
