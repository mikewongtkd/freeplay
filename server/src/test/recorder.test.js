'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractConfig,CodecConfigTracker,codecNals}=require('../recorder');
const sps=Buffer.from([0x67,0x42,0x00,0x1f,0xaa]),pps=Buffer.from([0x68,0xce,0x06,0xe2]);
const prefix=n=>Buffer.concat([Buffer.from([0,0,0,n.length]),n]);
test('extracts SPS/PPS from Annex-B codec configuration',()=>{const c=extractConfig(Buffer.concat([Buffer.from([0,0,0,1]),sps,Buffer.from([0,0,0,1]),pps]));assert.deepEqual(c.sps,sps);assert.deepEqual(c.pps,pps);assert.equal(c.avcC[0],1);});
test('extracts SPS/PPS from AVCC length-prefixed configuration',()=>{const c=extractConfig(Buffer.concat([prefix(sps),prefix(pps)]));assert.deepEqual(c.sps,sps);assert.deepEqual(c.pps,pps);});
test('extracts AVCDecoderConfigurationRecord',()=>{const avcc=Buffer.concat([Buffer.from([1,sps[1],sps[2],sps[3],0xff,0xe1,0, sps.length]),sps,Buffer.from([1,0,pps.length]),pps]);const nals=codecNals(avcc);assert.equal(nals.length,2);assert.deepEqual(extractConfig(avcc).pps,pps);});
test('accumulates separately delivered SPS and PPS',()=>{const tracker=new CodecConfigTracker();assert.equal(tracker.add(sps),null);const c=tracker.add(pps);assert.deepEqual(c.sps,sps);assert.deepEqual(c.pps,pps);});
