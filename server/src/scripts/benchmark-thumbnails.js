#!/usr/bin/env node
'use strict';
// Run against an already-recording deployment; this does not start cameras or alter source recordings.
const {performance} = require('perf_hooks');
const args = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/,'').split('=')));
if (!args.start || !args.end) {
  console.error('Usage: node scripts/benchmark-thumbnails.js --base=http://SERVER:9000 --ring=1 --camera=1 --start=EPOCH_US --end=EPOCH_US [--interval=5000 --width=240 --timeout=60000]');
  process.exit(1);
}
const base=args.base||'http://127.0.0.1:9000';
const params=new URLSearchParams({ring:args.ring||'1',camera:args.camera||'1',startEpochUs:args.start,endEpochUs:args.end,intervalMs:args.interval||'5000',width:args.width||'240'});
const timings=[],health=[],images=[];
const timeout=Number(args.timeout||60000);
if(!Number.isFinite(timeout)||timeout<1||timeout>3600000)throw new Error('timeout must be 1..3600000 ms');
const started=performance.now();
async function get(url){const t=performance.now();const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||response.status);return {body,ms:performance.now()-t};}
(async()=>{
  let result;
  do {
    const [metadata,h]=await Promise.all([get(`${base}/api/ivr/v1/thumbnails?${params}`),get(`${base}/health`)]);
    timings.push(metadata.ms);health.push(h.body);result=metadata.body;
    if(!result.samples.some(s=>s.status==='pending'||s.reason==='queue_full'||s.reason==='source_pending'))break;
    await new Promise(resolve=>setTimeout(resolve,250));
  } while(performance.now()-started<timeout);
  for(const sample of result.samples.filter(s=>s.status==='ready')){
    const t=performance.now();const response=await fetch(new URL(sample.imageUrl,base),{signal:AbortSignal.timeout(15000)});const bytes=(await response.arrayBuffer()).byteLength;
    images.push({ms:performance.now()-t,bytes,status:response.status});
  }
  const cached=await get(`${base}/api/ivr/v1/thumbnails?${params}`);
  const last=health.at(-1),first=health[0];
  console.log(JSON.stringify({elapsedMs:performance.now()-started,metadataMs:timings,cachedMetadataMs:cached.ms,images,
    samples:result.samples.map(({status,reason})=>({status,reason})),
    ingestCounters:{bytesDuringRun:last.totalBytesReceived-first.totalBytesReceived,protocolErrorsDuringRun:last.protocolErrors-first.protocolErrors,writerErrorsDuringRun:last.writerErrors-first.writerErrors},
    thumbnails:last.thumbnails,platform:process.platform,arch:process.arch,
    note:'Run with simultaneous camera ingest/replay. Zero observed protocol errors is not proof of zero ingest drops; compare baseline GOP/sequence telemetry and run endurance tests.'},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
