'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const urls = new Map();
function moduleUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const source = fs.readFileSync(path.resolve(__dirname, '../../public/review/assets/js', name),'utf8')
    .replace(/from "\.\/([^"\n]+)"/g, (_, relative) => `from "${moduleUrl(relative)}"`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  urls.set(name,url); return url;
}

test('TTP fixed-scale mapping retains sub-cell and ten-hour timestamp precision',async()=>{
  const {cellStart,timeX,xTime,CELL_US,secondsUs,usSeconds,visibleCells}=await import(moduleUrl('thumbnail-time.js'));
  const origin=9007199255000000n;
  assert.equal(timeX(origin+CELL_US,origin),128);
  assert.equal(xTime(64,origin),origin+2500000n);
  assert.equal(xTime(timeX(origin+36000000000n,origin),origin),origin+36000000000n);
  assert.equal(cellStart(origin+4999999n),origin);
  assert.equal(secondsUs(1790365100.123456),1790365100123456n);
  assert.equal(usSeconds(1790365100123456n),1790365100.123456);
  assert.ok(visibleCells(900000,2000,7200).end-visibleCells(900000,2000,7200).first<=32);
});

test('viewport synchronization translates time across independent scales and clamps edges',async()=>{
  const {anchorTime,scrollForTime}=await import(moduleUrl('thumbnail-time.js'));
  const origin=1790365100000000n;
  const ttp=anchorTime(256,600,0,origin,25.6);
  assert.equal(scrollForTime(ttp,origin,10,0,300,4000,600),Math.max(0,(556/25.6)*10-300));
  const old=anchorTime(1000,600,0,origin,10),zoomed=anchorTime(2000,600,0,origin,20);
  assert.notEqual(old,zoomed);
  assert.equal(scrollForTime(origin-1000000n,origin,25.6,0,300,4000,600),0);
  assert.equal(scrollForTime(origin+999999999999n,origin,25.6,0,300,4000,600),3400);
});

test('preview lifecycle shows on each review start, hides on committed AUR and respects manual overrides',async()=>{
  const {PreviewVisibility}=await import(moduleUrl('thumbnail-preview.js'));
  const visibility=new PreviewVisibility();
  const state={reviewHistory:[{id:'one',rst:100,aur:null,status:'active'}],activeReviewId:'one'};
  visibility.lifecycle(state);assert.equal(visibility.visible,true);
  visibility.visible=false;visibility.lifecycle(state);assert.equal(visibility.visible,false,'duplicate start cannot undo manual hide');
  state.reviewHistory[0].aur=90;visibility.lifecycle(state);assert.equal(visibility.visible,false);
  visibility.visible=true;visibility.lifecycle(state);assert.equal(visibility.visible,true,'duplicate AUR cannot undo manual show');
  state.reviewHistory[0].aurHistory=[{aur:90}];visibility.lifecycle(state);assert.equal(visibility.visible,false,'replacement at same timestamp is a real commit');
  state.reviewHistory.push({id:'two',rst:200,aur:null,status:'active'});state.activeReviewId='two';visibility.lifecycle(state);assert.equal(visibility.visible,true);
  state.activeReviewId=null;visibility.lifecycle(state);assert.equal(visibility.visible,false);
});

test('three-camera thumbnail requests use requested cell timestamps and tolerate independent gaps',async()=>{
  const {ThumbnailData}=await import(moduleUrl('thumbnail-data.js'));const calls=[];
  const api={thumbnailUrl:url=>'http://server'+url,thumbnails:async request=>{
    calls.push(request);
    if(request.camera===2)throw Object.assign(new Error(),{status:404});
    return {samples:[{requestedEpochUs:'5000000',status:'ready',actualEpochUs:'4900000',imageUrl:'/five.jpg'},{requestedEpochUs:'0',status:'ready',actualEpochUs:'0',imageUrl:'/zero.jpg'}]};
  }};
  const data=new ThumbnailData(api);await data.load(1,[0n,5000000n],()=>{});
  assert.deepEqual(calls.map(call=>call.camera),[1,2,3]);
  assert.ok(calls.every(call=>call.width===128&&call.intervalMs===5000&&call.endEpochUs==='10000000'));
  assert.equal(data.get(1,1,0n).url,'http://server/zero.jpg');
  assert.equal(data.get(1,1,5000000n).url,'http://server/five.jpg');
  assert.equal(data.get(1,2,0n).status,'unavailable');
  data.imageFailed(1,1,0n);assert.equal(data.get(1,1,0n).status,'unavailable');
});

test('pending retries and cache are bounded and stale ring responses are ignored',async()=>{
  const {ThumbnailData}=await import(moduleUrl('thumbnail-data.js'));let now=0,calls=0;
  const data=new ThumbnailData({thumbnailUrl:url=>url,thumbnails:async()=>{calls++;return {samples:[{requestedEpochUs:'0',status:'pending'}]};}},{attempts:3,now:()=>now});
  await data.load(1,[0n],()=>{});now=1000;await data.load(1,[0n],()=>{});now=3000;await data.load(1,[0n],()=>{});
  assert.equal(calls,9);assert.equal(data.nextRetry(),null);assert.equal(data.get(1,1,0n).status,'unavailable');
  const resolvers=[];
  const stale=new ThumbnailData({thumbnailUrl:url=>url,thumbnails:()=>new Promise(resolve=>{resolvers.push(resolve);})});
  const old=stale.load(1,[0n],()=>assert.fail('stale response rendered'));stale.cancel();
  resolvers.forEach(resolve=>resolve({samples:[{requestedEpochUs:'0',status:'ready',imageUrl:'/stale.jpg'}]}));
  await old;assert.equal(stale.entries.size,0);
  const bounded=new ThumbnailData({thumbnailUrl:url=>url,thumbnails:async()=>({samples:[]})});
  await bounded.load(1,Array.from({length:32},(_,i)=>BigInt(i)*5000000n),()=>{});
  assert.ok(bounded.entries.size<=192);
  await bounded.load(2,[0n],()=>{});assert.equal([...bounded.entries.keys()].some(key=>key.startsWith('1:')),false);
});

test('thumbnail adapter preserves decimal timestamps, uses the replay base, and rejects foreign images',async t=>{
  const {ReplayApi}=await import(moduleUrl('replay-api.js'));
  const api=new ReplayApi('http://server:9000/api/ivr/v1');
  let request;
  const previous=global.fetch;t.after(()=>{global.fetch=previous;});
  global.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({ok:true,samples:[]})};};
  await api.thumbnails({ring:1,camera:2,startEpochUs:'9007199254740993',endEpochUs:'9007199259740993',width:128});
  const url=new URL(request.url);
  assert.equal(url.pathname,'/api/ivr/v1/thumbnails');assert.equal(url.searchParams.get('startEpochUs'),'9007199254740993');
  assert.equal(url.searchParams.get('intervalMs'),'5000');assert.equal(request.options.cache,'no-store');
  assert.equal(api.thumbnailUrl('/api/ivr/v1/thumbnails/token.jpg'),'http://server:9000/api/ivr/v1/thumbnails/token.jpg');
  assert.throws(()=>api.thumbnailUrl('https://foreign.example/image.jpg'));
});
