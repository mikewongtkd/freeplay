'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {ReplayService, codecString} = require('../replay-service');
const {initSegment, fragment} = require('../recorder');

const sps = Buffer.from([0x67, 0x42, 0x00, 0x1f, 0xaa]);
const pps = Buffer.from([0x68, 0xce, 0x06, 0xe2]);
const avcC = Buffer.concat([Buffer.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1, 0, sps.length]), sps, Buffer.from([1, 0, pps.length]), pps]);

function gop(startEpochUs, endEpochUs, startPtsUs = 0n) {
  return {
    startServerEpochUs: BigInt(startEpochUs), endServerEpochUs: BigInt(endEpochUs),
    startPtsUs, endPtsUs: startPtsUs + BigInt(endEpochUs - startEpochUs), keyframePtsUs:startPtsUs,
    codecConfigVersion:1, complete:true, sequenceGapCount:0, estimatedMissingBuffers:0,
    byteLength:4, encodedBufferCount:1,
    buffers:[{ptsUs:startPtsUs, flags:1, payload:Buffer.from([0, 0, 0, 1, 0x65, 0x88]), sequence:1}]
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freeplay-replay-'));
  const videoDir = path.join(root, 'video'); fs.mkdirSync(videoDir);
  const diskGop = gop(1000000, 2000000);
  const initialization = initSegment(1280, 720, avcC), media = fragment(diskGop, 1);
  const recording = path.join(videoDir, 'recording.mp4'); fs.writeFileSync(recording, Buffer.concat([initialization, media]));
  const row = {id:1, session_id:1, path:path.relative(root, recording), file_complete:1, codec_config_version:1,
    stream_id:'ring1_cam1', width:1280, height:720, fps:30, camera:1, avcc:avcC,
    start_time_epoch_us:1000000, end_time_epoch_us:2000000, start_pts_us:'0', end_pts_us:'1000000',
    file_offset:initialization.length, file_length:media.length, complete:1, sequence_gap_count:0, estimated_missing_buffers:0};
  const db = {prepare(sql) {
    if (sql.includes('MIN(g.start_time_epoch_us)')) return {get:() => ({start_epoch_us:row.start_time_epoch_us, end_epoch_us:row.end_time_epoch_us})};
    return {all:() => [row]};
  }};
  return {root, videoDir, db, row, media, cleanup(){ fs.rmSync(root, {recursive:true, force:true}); }};
}

test('codec MIME string is derived from AVCDecoderConfigurationRecord', () => {
  assert.equal(codecString(avcC), 'avc1.42001f');
});

test('manifest merges indexed disk and RAM GOPs behind opaque media URLs', t => {
  const f = fixture(); t.after(f.cleanup);
  const ramGop = gop(2000000, 3000000, 1000000n);
  const liveStreams = new Map([['ring1_cam1', {
    sessionId:2, hello:{width:1280, height:720, fps:30}, codecConfigs:new Map([[1, {avcC}]]),
    cache:{gops:[ramGop], query:(start, end) => ramGop.endServerEpochUs >= start && ramGop.startServerEpochUs <= end ? [ramGop] : []}
  }]]);
  const service = new ReplayService({db:f.db, liveStreams, root:f.root, videoDir:f.videoDir, camerasPerRing:3});
  const result = service.manifest({ring:1, camera:1, timeEpochUs:'2000000', beforeSeconds:2, afterSeconds:2});
  assert.equal(result.camera.mimeType, 'video/mp4; codecs="avc1.42001f"');
  assert.deepEqual(result.camera.fragments.map(item => item.source), ['disk', 'ram']);
  assert.ok(result.camera.initializations.every(item => item.key));
  assert.ok(result.camera.fragments.every(item => item.initializationKey));
  assert.ok(result.camera.fragments.every(item => /^\/api\/ivr\/v1\/media\/[A-Za-z0-9_-]+$/.test(item.url)));
  assert.ok(!JSON.stringify(result).includes(f.root));
  assert.equal(result.camera.quality.complete, true);
});

test('unsafe recording paths and invalid requests are rejected', t => {
  const f = fixture(); t.after(f.cleanup);
  f.row.path = '../outside.mp4';
  const service = new ReplayService({db:f.db, liveStreams:new Map(), root:f.root, videoDir:f.videoDir, camerasPerRing:3});
  const result = service.manifest({ring:1, camera:1, timeEpochUs:'1500000', beforeSeconds:1, afterSeconds:1});
  assert.equal(result.camera.available, false);
  assert.throws(() => service.manifest({ring:0, camera:1, timeEpochUs:'1500000', beforeSeconds:1, afterSeconds:1}), error => error.code === 'invalid_ring');
  assert.throws(() => service.manifest({ring:1, camera:1, timeEpochUs:'bad', beforeSeconds:1, afterSeconds:1}), error => error.code === 'invalid_time');
});
