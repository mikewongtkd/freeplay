#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const ROOT = __dirname;
const DATA_DIR = '/data';
const VIDEO_DIR = path.join(DATA_DIR, 'video');
const DB_PATH = path.join(DATA_DIR, 'freeplay.sqlite');
const SCHEMA_PATH = path.join(DATA_DIR, 'sql', 'schema.sql');
const PORT = Number(process.env.FREEPLAY_WS_PORT || 9000);

fs.mkdirSync(VIDEO_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const upsertCamera = db.prepare(`
INSERT INTO cameras(stream_id, ring_no, camera_no, device_model, resolution, fps_target, codec, bitrate_target, updated_at)
VALUES (@stream_id, @ring_no, @camera_no, @device_model, @resolution, @fps_target, @codec, @bitrate_target, CURRENT_TIMESTAMP)
ON CONFLICT(stream_id) DO UPDATE SET
 ring_no=excluded.ring_no,
 camera_no=excluded.camera_no,
 device_model=excluded.device_model,
 resolution=excluded.resolution,
 fps_target=excluded.fps_target,
 codec=excluded.codec,
 bitrate_target=excluded.bitrate_target,
 updated_at=CURRENT_TIMESTAMP
`);
const getCamera = db.prepare('SELECT * FROM cameras WHERE stream_id = ?');
const insertSession = db.prepare(`INSERT INTO sessions(camera_id,start_time,recording_path) VALUES (?,?,?)`);
const closeSession = db.prepare(`UPDATE sessions SET end_time=?, bytes_total=?, frames_total=?, dropped_total=?, keyframes_total=? WHERE id=?`);
const insertStats = db.prepare(`INSERT INTO statistics(camera_id,ts,fps,bitrate,frames,dropped,bytes,keyframes,reconnects) VALUES (?,?,?,?,?,?,?,?,?)`);
const insertEvent = db.prepare(`INSERT INTO events(camera_id,event_type,message) VALUES (?,?,?)`);
const getConfig = db.prepare('SELECT value FROM configuration WHERE key=?');

const live = new Map();

function nowIso() { return new Date().toISOString(); }
function sanitizeStreamId(v) { return String(v || '').replace(/[^A-Za-z0-9_.-]/g, '_'); }
function boolConfig(key, defaultValue=false) {
  const row = getConfig.get(key);
  return row ? ['1','true','yes','on'].includes(String(row.value).toLowerCase()) : defaultValue;
}

function createRawFile(streamId) {
  if (!boolConfig('record_raw_h264', false)) return { file: null, path: null };
  const dir = path.join(VIDEO_DIR, sanitizeStreamId(streamId));
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const full = path.join(dir, `${stamp}.h264`);
  return { file: fs.createWriteStream(full, { flags: 'a' }), path: path.relative(ROOT, full) };
}

function parseHello(msg) {
  const o = JSON.parse(msg.toString());
  if (o.type !== 'hello') throw new Error('First message must be JSON hello');
  if (!o.streamId) throw new Error('hello.streamId is required');
  return {
    stream_id: String(o.streamId),
    ring_no: Number(o.ring ?? o.ringNumber ?? 0) || null,
    camera_no: Number(o.camera ?? o.cameraNumber ?? 0) || null,
    device_model: String(o.device ?? o.deviceModel ?? 'Unknown'),
    resolution: String(o.resolution ?? `${o.width || 0}x${o.height || 0}`),
    fps_target: Number(o.fps ?? 0),
    codec: String(o.codec ?? 'h264'),
    bitrate_target: Number(o.bitrate ?? 0)
  };
}

// Prototype binary format expected from Android per message:
// bytes 0..7   : int64 BE presentation timestamp (microseconds)
// bytes 8..11  : uint32 BE sequence
// bytes 12..15 : uint32 BE MediaCodec flags
// bytes 16..19 : uint32 BE payload length
// bytes 20..   : H.264 payload
function parseBinary(buf) {
  if (buf.length < 20) throw new Error('Binary message shorter than 20-byte frame header');
  const ptsUs = Number(buf.readBigInt64BE(0));
  const sequence = buf.readUInt32BE(8);
  const flags = buf.readUInt32BE(12);
  const payloadLength = buf.readUInt32BE(16);
  if (payloadLength > buf.length - 20) throw new Error('Invalid payload length');
  return { ptsUs, sequence, flags, payload: buf.subarray(20, 20 + payloadLength) };
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true, cameras:live.size, time:nowIso()}));
  }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocket.Server({ server, maxPayload: 16 * 1024 * 1024 });

wss.on('connection', (ws, req) => {
  let state = null;
  let helloReceived = false;

  ws.on('message', (data, isBinary) => {
    try {
      if (!helloReceived) {
        if (isBinary) throw new Error('Expected hello JSON before binary video');
        const hello = parseHello(data);
        upsertCamera.run(hello);
        const camera = getCamera.get(hello.stream_id);
        const raw = createRawFile(hello.stream_id);
        const sessionInfo = insertSession.run(camera.id, nowIso(), raw.path);

        state = {
          streamId: hello.stream_id, cameraId: camera.id, sessionId: Number(sessionInfo.lastInsertRowid),
          hello, connectedAt: Date.now(), frames:0, bytes:0, dropped:0, keyframes:0, reconnects:0,
          lastSeq:null, lastFrameAt:null, prevSampleAt:Date.now(), prevFrames:0, prevBytes:0,
          fps:0, bitrate:0, rawFile: raw.file, peer:req.socket.remoteAddress
        };
        live.set(state.streamId, state);
        helloReceived = true;
        insertEvent.run(camera.id, 'connect', `Connected from ${state.peer || 'unknown'}`);
        console.log(`[connect] ${state.streamId} ${state.peer || ''}`);
        ws.send(JSON.stringify({type:'hello_ack', streamId:state.streamId, serverTime:nowIso()}));
        return;
      }

      if (!isBinary) return; // ignore non-binary control messages for prototype
      const frame = parseBinary(Buffer.from(data));
      state.frames++;
      state.bytes += frame.payload.length;
      state.lastFrameAt = Date.now();
      if (state.lastSeq !== null && frame.sequence > state.lastSeq + 1) state.dropped += (frame.sequence - state.lastSeq - 1);
      state.lastSeq = frame.sequence;
      if ((frame.flags & 1) !== 0) state.keyframes++; // MediaCodec BUFFER_FLAG_KEY_FRAME = 1
      if (state.rawFile && frame.payload.length) state.rawFile.write(frame.payload);
    } catch (e) {
      console.error('[ingest error]', e.message);
      try { ws.send(JSON.stringify({type:'error', message:e.message})); } catch (_) {}
    }
  });

  ws.on('close', () => {
    if (!state) return;
    try { if (state.rawFile) state.rawFile.end(); } catch (_) {}
    closeSession.run(nowIso(), state.bytes, state.frames, state.dropped, state.keyframes, state.sessionId);
    insertEvent.run(state.cameraId, 'disconnect', `Disconnected after ${Math.round((Date.now()-state.connectedAt)/1000)}s`);
    live.delete(state.streamId);
    console.log(`[disconnect] ${state.streamId}`);
  });
});

setInterval(() => {
  const t = Date.now();
  for (const state of live.values()) {
    const seconds = Math.max((t - state.prevSampleAt) / 1000, 0.001);
    const df = state.frames - state.prevFrames;
    const dbt = state.bytes - state.prevBytes;
    state.fps = df / seconds;
    state.bitrate = Math.round((dbt * 8) / seconds);
    state.prevSampleAt = t; state.prevFrames = state.frames; state.prevBytes = state.bytes;
    insertStats.run(state.cameraId, nowIso(), state.fps, state.bitrate, state.frames, state.dropped, state.bytes, state.keyframes, state.reconnects);
  }
  const snapshot = {};
  for (const [id,s] of live.entries()) snapshot[id] = {
    stream_id:id, connected:true, device_model:s.hello.device_model, resolution:s.hello.resolution,
    fps_target:s.hello.fps_target, fps:s.fps, bitrate_target:s.hello.bitrate_target, bitrate:s.bitrate,
    codec:s.hello.codec, frames:s.frames, dropped:s.dropped, bytes:s.bytes, keyframes:s.keyframes,
    uptime_seconds:Math.floor((Date.now()-s.connectedAt)/1000), last_frame_ms:s.lastFrameAt ? Date.now()-s.lastFrameAt : null,
    peer:s.peer
  };
  fs.writeFileSync(path.join(DATA_DIR, 'live-status.json'), JSON.stringify({updated_at:nowIso(), cameras:snapshot}, null, 2));
}, 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FreePlay ingest listening on ws://0.0.0.0:${PORT}`);
  console.log(`Health endpoint: http://127.0.0.1:${PORT}/health`);
});
