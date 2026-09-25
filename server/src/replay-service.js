'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {initSegment, fragment} = require('./recorder');

const API_PREFIX = '/api/ivr/v1';
const TOKEN_TTL_MS = 2 * 60 * 1000;
const MAX_MEDIA_TOKENS = 10000;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function apiError(res, status, code, message) {
  json(res, status, {ok:false, error:{code, message}});
}

function codecString(avcc) {
  if (!avcc || avcc.length < 4) return 'avc1';
  return `avc1.${[avcc[1], avcc[2], avcc[3]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function asBigInt(value, fallback = 0n) {
  try { return BigInt(value); } catch (_) { return fallback; }
}

class ReplayService {
  constructor({db, liveStreams, root, videoDir, camerasPerRing = 3}) {
    this.db = db;
    this.liveStreams = liveStreams;
    this.root = path.resolve(root);
    this.videoDir = path.resolve(videoDir);
    this.camerasPerRing = camerasPerRing;
    this.tokens = new Map();
    this.diskQuery = db.prepare(`
      SELECT g.*, f.path, f.complete AS file_complete,
             f.codec_config_version AS codec_config_version,
             c.stream_id, c.width, c.height, c.fps, c.camera,
             cc.avcc
        FROM gop_index g
        JOIN cameras c ON c.id = g.camera_id
        LEFT JOIN files f ON f.id = g.file_id
        LEFT JOIN codec_configurations cc
          ON cc.session_id = g.session_id AND cc.version = f.codec_config_version
       WHERE c.stream_id = ?
         AND g.end_time_epoch_us >= ?
         AND g.start_time_epoch_us <= ?
       ORDER BY g.start_time_epoch_us
       LIMIT 2048
    `);
    this.retainedQuery = db.prepare(`
      SELECT MIN(g.start_time_epoch_us) AS start_epoch_us,
             MAX(g.end_time_epoch_us) AS end_epoch_us
        FROM gop_index g JOIN cameras c ON c.id = g.camera_id
       WHERE c.stream_id = ?
    `);
  }

  cleanupTokens() {
    const now = Date.now();
    for (const [id, token] of this.tokens) if (token.expiresAt <= now) this.tokens.delete(id);
  }

  registerToken(resource) {
    this.cleanupTokens();
    while (this.tokens.size >= MAX_MEDIA_TOKENS) this.tokens.delete(this.tokens.keys().next().value);
    const id = crypto.randomBytes(18).toString('base64url');
    this.tokens.set(id, {...resource, expiresAt: Date.now() + TOKEN_TTL_MS});
    return id;
  }

  safeDiskExtent(row) {
    if (!row.path || row.file_offset == null || row.file_length == null) return null;
    const absolute = path.resolve(this.root, row.path);
    if (absolute !== this.videoDir && !absolute.startsWith(`${this.videoDir}${path.sep}`)) return null;
    const offset = Number(row.file_offset), length = Number(row.file_length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1) return null;
    return {kind:'disk', path:absolute, offset, length, immutable:Boolean(row.file_complete)};
  }

  initializationFor({stream, row, version, width, height, avcc, key}) {
    const config = avcc ? {avcC:Buffer.from(avcc)} : stream?.codecConfigs?.get(Number(version));
    if (!config?.avcC) return null;
    const bytes = initSegment(Number(width), Number(height), config.avcC);
    const id = this.registerToken({kind:'bytes', bytes, immutable:true, contentType:'video/mp4'});
    return {id, key, url:`${API_PREFIX}/media/${id}`, codec:codecString(config.avcC)};
  }

  manifest({ring, camera, timeEpochUs, beforeSeconds, afterSeconds}) {
    this.cleanupTokens();
    if (!Number.isInteger(ring) || ring < 1 || ring > 14) throw Object.assign(new Error('Ring must be between 1 and 14.'), {code:'invalid_ring', status:400});
    if (!Number.isInteger(camera) || camera < 1 || camera > this.camerasPerRing) throw Object.assign(new Error('Camera is outside the configured ring camera range.'), {code:'invalid_camera', status:400});
    if (!/^\d+$/.test(String(timeEpochUs))) throw Object.assign(new Error('timeEpochUs must be an epoch-microsecond decimal string.'), {code:'invalid_time', status:400});
    if (![beforeSeconds, afterSeconds].every(value => Number.isFinite(value) && value >= 0 && value <= 30) || beforeSeconds + afterSeconds > 60) throw Object.assign(new Error('Requested replay duration exceeds the 60-second limit.'), {code:'invalid_duration', status:400});

    const target = BigInt(timeEpochUs), start = target - BigInt(Math.round(beforeSeconds * 1e6)), end = target + BigInt(Math.round(afterSeconds * 1e6));
    const streamId = `ring${ring}_cam${camera}`, stream = this.liveStreams.get(streamId);
    const diskRows = this.diskQuery.all(streamId, Number(start), Number(end));
    const records = new Map();

    for (const row of diskRows) {
      const extent = this.safeDiskExtent(row);
      if (!extent) continue;
      const key = `${row.start_time_epoch_us}:${row.end_time_epoch_us}`;
      records.set(key, {source:'disk', row, extent, startEpochUs:asBigInt(row.start_time_epoch_us), endEpochUs:asBigInt(row.end_time_epoch_us), startPtsUs:asBigInt(row.start_pts_us), endPtsUs:asBigInt(row.end_pts_us), codecConfigVersion:Number(row.codec_config_version), complete:Boolean(row.complete), sequenceGapCount:Number(row.sequence_gap_count || 0), estimatedMissingBuffers:Number(row.estimated_missing_buffers || 0)});
    }
    for (const gop of stream?.cache.query(start, end) || []) {
      const key = `${gop.startServerEpochUs}:${gop.endServerEpochUs}`;
      records.set(key, {source:'ram', gop, startEpochUs:gop.startServerEpochUs, endEpochUs:gop.endServerEpochUs, startPtsUs:gop.startPtsUs, endPtsUs:gop.endPtsUs, codecConfigVersion:Number(gop.codecConfigVersion), complete:Boolean(gop.complete), sequenceGapCount:Number(gop.sequenceGapCount || 0), estimatedMissingBuffers:Number(gop.estimatedMissingBuffers || 0)});
    }

    const ordered = [...records.values()].sort((a, b) => a.startEpochUs < b.startEpochUs ? -1 : a.startEpochUs > b.startEpochUs ? 1 : 0);
    const initializations = new Map();
    const fragments = [];
    let sequence = 1;
    for (const item of ordered) {
      const row = item.row;
      const width = item.source === 'ram' ? stream?.hello.width : row?.width;
      const height = item.source === 'ram' ? stream?.hello.height : row?.height;
      const configKey = `${row?.session_id || stream?.sessionId}:${item.codecConfigVersion}`;
      let initialization = initializations.get(configKey);
      if (!initialization) {
        const initializationKey = `init-${crypto.createHash('sha256').update(configKey).digest('base64url').slice(0, 16)}`;
        initialization = this.initializationFor({stream, row, version:item.codecConfigVersion, width, height, avcc:row?.avcc, key:initializationKey});
        if (initialization) initializations.set(configKey, initialization);
      }
      if (!initialization) continue;
      const media = item.source === 'ram'
        ? {kind:'bytes', bytes:fragment(item.gop, sequence++), immutable:false, contentType:'video/mp4'}
        : {...item.extent, contentType:'video/mp4'};
      const id = this.registerToken(media);
      fragments.push({id, url:`${API_PREFIX}/media/${id}`, initializationId:initialization.id, initializationKey:initialization.key, source:item.source, startEpochUs:String(item.startEpochUs), endEpochUs:String(item.endEpochUs), startPtsUs:String(item.startPtsUs), endPtsUs:String(item.endPtsUs), complete:item.complete, sequenceGapCount:item.sequenceGapCount, estimatedMissingBuffers:item.estimatedMissingBuffers});
    }

    const gaps = [];
    for (let index = 1; index < fragments.length; index++) {
      const previous = BigInt(fragments[index - 1].endEpochUs), next = BigInt(fragments[index].startEpochUs);
      if (next - previous > 100000n) gaps.push({startEpochUs:String(previous), endEpochUs:String(next)});
    }
    const retained = this.retainedQuery.get(streamId) || {};
    const initList = [...initializations.values()];
    const available = fragments.length > 0;
    return {ok:true, apiVersion:'1', ring, requested:{camera, timeEpochUs:String(target), logicalStartEpochUs:String(start), logicalEndEpochUs:String(end)}, retainedRange:{startEpochUs:retained.start_epoch_us == null ? fragments[0]?.startEpochUs || null : String(retained.start_epoch_us), liveEdgeEpochUs:stream?.cache.gops.at(-1)?.endServerEpochUs ? String(stream.cache.gops.at(-1).endServerEpochUs) : retained.end_epoch_us == null ? null : String(retained.end_epoch_us)}, camera:{camera, streamId, available, codec:initList[0]?.codec || null, mimeType:initList[0] ? `video/mp4; codecs="${initList[0].codec}"` : null, width:Number(stream?.hello.width || diskRows[0]?.width || 0), height:Number(stream?.hello.height || diskRows[0]?.height || 0), fps:Number(stream?.hello.fps || diskRows[0]?.fps || 30), decodableStartEpochUs:fragments[0]?.startEpochUs || null, initialization:initList[0] || null, initializations:initList, fragments, gaps, quality:{complete:available && fragments.every(item => item.complete), sequenceGapCount:fragments.reduce((sum, item) => sum + item.sequenceGapCount, 0), estimatedMissingBuffers:fragments.reduce((sum, item) => sum + item.estimatedMissingBuffers, 0)}}, adjacent:{previous:String(start), next:String(end)}};
  }

  async handle(req, res, url) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS' && url.pathname.startsWith(API_PREFIX)) {
      res.statusCode = 204; res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.end(); return true;
    }
    if (req.method === 'GET' && url.pathname === `${API_PREFIX}/capabilities`) {
      json(res, 200, {ok:true, apiVersion:'1', serverTimeEpochUs:String(BigInt(Date.now()) * 1000n), features:{multiCameraReplay:false, adjacentRanges:false, reviewPersistence:false, pssel:false}, media:{container:'video/mp4', codec:'avc1', transport:'http-fmp4-mse'}, limits:{maximumRangeSeconds:60}});
      return true;
    }
    if (req.method === 'GET' && url.pathname === `${API_PREFIX}/replay`) {
      try {
        const payload = this.manifest({ring:Number(url.searchParams.get('ring')), camera:Number(url.searchParams.get('camera') || 1), timeEpochUs:url.searchParams.get('timeEpochUs') || '', beforeSeconds:Number(url.searchParams.get('beforeSeconds') || 5), afterSeconds:Number(url.searchParams.get('afterSeconds') || 5)});
        json(res, 200, payload);
      } catch (error) {
        const status = error.status || 500;
        apiError(res, status, error.code || 'replay_lookup_failed', status >= 500 ? 'Replay lookup failed.' : error.message);
      }
      return true;
    }
    const match = req.method === 'GET' && url.pathname.match(new RegExp(`^${API_PREFIX}/media/([A-Za-z0-9_-]+)$`));
    if (!match) { apiError(res, 404, 'not_found', 'Unknown IVR API resource.'); return true; }
    this.cleanupTokens();
    const token = this.tokens.get(match[1]);
    if (!token) { apiError(res, 404, 'media_token_expired', 'The media resource is unavailable or its token has expired.'); return true; }
    res.setHeader('Content-Type', token.contentType || 'video/mp4');
    res.setHeader('Cache-Control', token.immutable ? 'public, max-age=31536000, immutable' : 'no-store');
    if (token.kind === 'bytes') { res.setHeader('Content-Length', token.bytes.length); res.end(token.bytes); return true; }
    try {
      const stat = await fs.promises.stat(token.path);
      if (token.offset + token.length > stat.size) { apiError(res, 409, 'fragment_incomplete', 'The indexed fragment has not been fully written.'); return true; }
      res.setHeader('Content-Length', token.length);
      const input = fs.createReadStream(token.path, {start:token.offset, end:token.offset + token.length - 1});
      input.on('error', () => { if (!res.headersSent) apiError(res, 500, 'media_read_failed', 'The media fragment could not be read.'); else res.destroy(); });
      res.on('close', () => { if (!res.writableEnded && !input.destroyed) input.destroy(); });
      input.pipe(res);
    } catch (_) { apiError(res, 404, 'media_unavailable', 'The requested media file is unavailable.'); }
    return true;
  }
}

module.exports = {ReplayService, codecString, API_PREFIX};
