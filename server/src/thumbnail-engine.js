'use strict';
// Runs only in the thumbnail worker: SQLite, filesystem work, and decoding never run on ingest's event loop.
const fs = require('fs');
const path = require('path');
const os = require('os');
const {spawn} = require('child_process');
const Database = require('better-sqlite3');
const {initSegment} = require('./recorder');
const {sourceKey} = require('./thumbnail-planner');

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return null;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i++] !== 0xff) return null;
    const marker = bytes[i++];
    if (marker === 0xda || marker === 0xd9) return null;
    const length = bytes.readUInt16BE(i);
    if (length < 2 || i + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return {width:bytes.readUInt16BE(i + 5), height:bytes.readUInt16BE(i + 3)};
    i += length;
  }
  return null;
}

class ThumbnailEngine {
  constructor({dbPath, root, videoDir, config, onMetrics = () => {}}) {
    Object.assign(this, {config, root, videoDir, onMetrics});
    this.db = new Database(dbPath, {readonly:true, fileMustExist:true});
    this.db.defaultSafeIntegers(true);
    this.db.pragma('busy_timeout=100');
    fs.mkdirSync(config.cacheDir, {recursive:true});
    this.cache = new Database(path.join(config.cacheDir, 'index.sqlite'));
    this.cache.pragma('journal_mode=WAL');
    this.cache.exec('CREATE TABLE IF NOT EXISTS images (key TEXT PRIMARY KEY, gop_id TEXT NOT NULL, fingerprint TEXT NOT NULL, bytes INTEGER NOT NULL, used INTEGER NOT NULL)');
    this.queue = [];
    this.jobs = new Map();
    this.children = new Set();
    this.failures = new Map();
    this.running = 0;
    this.busyUntil = 0;
    this.closed = false;
    this.decoder = false;
    this.metrics = {hits:0, misses:0, completed:0, failed:0, skipped:0, queued:0, running:0, cacheBytes:0, cacheEntries:0, failures:{}, generationMs:0, queueWaitMs:0, decoderReady:false};
    const columns = `g.*, f.path, f.codec_config_version, f.complete AS file_complete, c.stream_id, COALESCE(s.width,c.width) AS width, COALESCE(s.height,c.height) AS height, CASE WHEN length(cc.avcc)<=65536 THEN cc.avcc ELSE NULL END AS avcc`;
    const joins = 'FROM gop_index g JOIN cameras c ON c.id=g.camera_id JOIN files f ON f.id=g.file_id JOIN sessions s ON s.id=g.session_id LEFT JOIN codec_configurations cc ON cc.session_id=g.session_id AND cc.version=f.codec_config_version';
    this.near = this.db.prepare(`SELECT ${columns} ${joins} WHERE c.stream_id=? AND g.start_time_epoch_us<=? AND g.end_time_epoch_us>=? ORDER BY g.start_time_epoch_us DESC,g.id DESC LIMIT 1`);
    this.byId = this.db.prepare(`SELECT ${columns} ${joins} WHERE g.id=?`);
    this.camera = this.db.prepare('SELECT id FROM cameras WHERE stream_id=?');
    this.latest = this.db.prepare(`SELECT start_time_epoch_us FROM gop_index WHERE camera_id=? ORDER BY start_time_epoch_us DESC LIMIT 1`);
  }
  async initialize() {
    // Clean only bounded batches in this worker, never scan the recording tree.
    await this.removeTemps();
    await this.reconcile();
    try {
      await this.process(['-version'], null, 65536);
      this.decoder = this.metrics.decoderReady = true;
    } catch (_) {
      console.warn(JSON.stringify({event:'thumbnail_decoder_unavailable', message:'Install FFmpeg with H.264/JPEG support or set THUMBNAIL_FFMPEG; thumbnails are unavailable, ingest is unaffected.'}));
    }
    this.timer = setInterval(() => { void this.reconcile().catch(() => {}); }, 30000);
    this.timer.unref();
    this.publish();
  }
  publish() {
    this.metrics.queued = this.queue.length;
    this.metrics.running = this.running;
    this.onMetrics({...this.metrics});
  }
  process(args, input, maxBytes = this.config.maxImageBytes) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], {stdio:['pipe', 'pipe', 'pipe'], shell:false});
      this.children.add(child);
      let output = [], count = 0, failure = null;
      const fail = code => { failure ||= Object.assign(new Error(code), {code}); child.kill('SIGKILL'); };
      const timer = setTimeout(() => fail('decoder_timeout'), this.config.timeoutMs);
      child.once('spawn', () => { try { os.setPriority(child.pid, 10); } catch (_) { /* Thread limits still apply where niceness is unavailable. */ } });
      child.stdout.on('data', bytes => { count += bytes.length; if (count > maxBytes) fail('image_too_large'); else output.push(bytes); });
      child.stderr.on('data', () => {}); // Drain, but never retain or expose decoder stderr.
      child.stdin.on('error', () => {});
      child.once('error', error => { failure = Object.assign(new Error('decoder_unavailable'), {code:error.code === 'ENOENT' ? 'decoder_unavailable' : 'decoder_failed'}); });
      child.once('close', code => {
        clearTimeout(timer); this.children.delete(child);
        if (failure || code !== 0) reject(failure || Object.assign(new Error('decode_failed'), {code:'decode_failed'}));
        else resolve(Buffer.concat(output));
      });
      child.stdin.end(input || undefined);
    });
  }
  async extent(row) {
    if (!row?.path || row.file_offset == null || row.file_length == null) throw Object.assign(new Error(), {code:'source_unavailable'});
    const filename = path.resolve(this.root, row.path);
    const base = await fs.promises.realpath(this.videoDir);
    const real = await fs.promises.realpath(filename);
    if (!real.startsWith(base + path.sep)) throw Object.assign(new Error(), {code:'source_unavailable'});
    const offset = Number(row.file_offset), length = Number(row.file_length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || length > this.config.maxInputBytes) throw Object.assign(new Error(), {code:'source_too_large'});
    const stat = await fs.promises.stat(real);
    if (!stat.isFile() || offset + length > stat.size) throw Object.assign(new Error(), {code:'source_pending'});
    return {real, offset, length, fingerprint:`${stat.dev}:${stat.ino}:${stat.birthtimeMs}${Number(row.file_complete) ? `:${stat.size}:${stat.mtimeMs}` : ""}`};
  }
  filename(key) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Object.assign(new Error(), {code:'image_unavailable'});
    return path.join(this.config.cacheDir, `${key}.jpg`);
  }
  async cached(key, row) {
    const record = this.cache.prepare('SELECT * FROM images WHERE key=?').get(key);
    if (!record) return null;
    try {
      const source = await this.extent(row);
      if (source.fingerprint !== record.fingerprint) throw new Error('changed');
      const stat = await fs.promises.lstat(this.filename(key));
      if (!stat.isFile() || stat.size !== record.bytes || stat.size > this.config.maxImageBytes) throw new Error('missing');
      this.cache.prepare('UPDATE images SET used=? WHERE key=?').run(Date.now(), key);
      return record;
    } catch (_) { await this.remove(key); return null; }
  }
  async metadata(plan, background = false) {
    const known = this.camera.get(plan.streamId);
    if (!known) throw Object.assign(new Error('Unknown camera'), {code:'unknown_camera', status:404});
    const samples = [];
    for (const time of plan.times) {
      const target = BigInt(time);
      const sample = {requestedEpochUs:time, actualEpochUs:null, sessionId:null, status:'unavailable', imageUrl:null};
      const row = this.near.get(plan.streamId, target, target);
      if (!row || target - row.start_time_epoch_us > BigInt(this.config.toleranceMs) * 1000n) { sample.reason = 'recording_gap'; samples.push(sample); continue; }
      sample.actualEpochUs = String(row.start_time_epoch_us);
      sample.sessionId = String(row.session_id);
      if (!row.avcc) sample.reason = 'codec_configuration_missing';
      else if (!Number(row.complete)) sample.reason = 'incomplete_gop';
      else if (String(row.start_pts_us) !== String(row.keyframe_pts_us)) sample.reason = 'keyframe_unavailable';
      else {
        const key = sourceKey(row, plan.width);
        if (await this.cached(key, row)) { this.metrics.hits++; sample.status = 'ready'; sample.key = key; }
        else if (!this.decoder) sample.reason = 'decoder_unavailable';
        else {
          this.metrics.misses++;
          const failed = this.failures.get(key);
          if (failed && failed.until > Date.now()) sample.reason = failed.reason;
          else if (this.jobs.has(key)) sample.status = 'pending';
          else if (this.queue.length >= this.config.queueMax || [...this.jobs.values()].filter(j => j.streamId === plan.streamId).length >= this.config.perCameraQueue) {
            sample.reason = 'queue_full'; this.metrics.skipped++;
          } else {
            this.failures.delete(key);
            const job = {key, row, width:plan.width, streamId:plan.streamId, added:Date.now(), background};
            this.jobs.set(key, job); this.queue.push(job); sample.status = 'pending';
          }
        }
      }
      samples.push(sample);
    }
    this.publish(); this.pump();
    const {times, ...request} = plan;
    return {ok:true, apiVersion:'1', ...request, samples};
  }
  pump() {
    if (this.closed || this.paused || Date.now() < this.busyUntil) return;
    while (this.running < this.config.workers && this.queue.length) {
      // Per-camera admission caps bound unfairness; on-demand jobs precede optional background work.
      const index = this.queue.findIndex(job => !job.background);
      const [job] = this.queue.splice(index < 0 ? 0 : index, 1);
      this.running++;
      void this.generate(job).finally(() => { this.jobs.delete(job.key); this.running--; this.publish(); this.pump(); });
    }
  }
  defer(ms = 100) {
    this.busyUntil = Math.max(this.busyUntil, Date.now() + ms);
    clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(() => this.pump(), ms + 1);
  }
  async generate(job) {
    const started = Date.now();
    this.metrics.queueWaitMs += started - job.added;
    try {
      const row = this.byId.get(job.row.id);
      if (!row || sourceKey(row, job.width) !== job.key) throw Object.assign(new Error(), {code:'source_unavailable'});
      const extent = await this.extent(row);
      const width = Number(row.width), height = Number(row.height);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > this.config.maxSourcePixels || height * job.width / width > this.config.maxWidth * 4)
        throw Object.assign(new Error(), {code:'source_dimensions_exceeded'});
      const initialization = initSegment(Number(row.width), Number(row.height), Buffer.from(row.avcc));
      const handle = await fs.promises.open(extent.real, 'r');
      const bytes = Buffer.alloc(extent.length);
      try {
        let read = 0;
        while (read < bytes.length) {
          const result = await handle.read(bytes, read, bytes.length - read, extent.offset + read);
          if (!result.bytesRead) throw Object.assign(new Error(), {code:'source_pending'});
          read += result.bytesRead;
        }
      } finally { await handle.close(); }
      if (this.closed) return;
      const image = await this.process(['-hwaccel', 'none', '-threads', '1', '-filter_threads', '1', '-f', 'mp4', '-i', 'pipe:0', '-map', '0:v:0', '-an', '-vf', `scale=${job.width}:-2`, '-frames:v', '1', '-map_metadata', '-1', '-c:v', 'mjpeg', '-threads', '1', '-f', 'image2pipe', 'pipe:1'], Buffer.concat([initialization, bytes]));
      if (image.length > this.config.cacheBytes) throw Object.assign(new Error(), {code:'cache_capacity'});
      const dimensions = jpegDimensions(image);
      if (!dimensions || dimensions.width !== job.width || dimensions.height > this.config.maxWidth * 4) throw Object.assign(new Error(), {code:'invalid_image'});
      if (this.closed) return;
      const current = await this.extent(row);
      if (current.fingerprint !== extent.fingerprint) throw Object.assign(new Error(), {code:'source_unavailable'});
      const temp = this.filename(job.key) + '.tmp';
      await fs.promises.writeFile(temp, image, {flag:'wx'});
      await fs.promises.rename(temp, this.filename(job.key));
      this.cache.prepare('INSERT OR REPLACE INTO images VALUES (?,?,?,?,?)').run(job.key, String(row.id), extent.fingerprint, image.length, Date.now());
      this.metrics.completed++;
      await this.evict();
    } catch (error) {
      const allowed = new Set(['source_unavailable', 'source_pending', 'source_too_large', 'source_dimensions_exceeded', 'decoder_timeout', 'decoder_unavailable', 'decode_failed', 'image_too_large', 'invalid_image', 'cache_capacity']);
      const reason = allowed.has(error.code) ? error.code : 'generation_failed';
      while (this.failures.size >= 1024) this.failures.delete(this.failures.keys().next().value);
      this.failures.set(job.key, {reason, until:Date.now() + (reason === 'source_pending' ? 1000 : 30000)});
      this.metrics.failed++; this.metrics.failures[reason] = (this.metrics.failures[reason] || 0) + 1;
      await fs.promises.unlink(this.filename(job.key) + '.tmp').catch(() => {});
    } finally { this.metrics.generationMs += Date.now() - started; }
  }
  async remove(key) {
    this.cache.prepare('DELETE FROM images WHERE key=?').run(key);
    await fs.promises.unlink(this.filename(key)).catch(() => {});
  }
  async evict() {
    let {bytes, count} = this.cache.prepare('SELECT COALESCE(SUM(bytes),0) bytes,COUNT(*) count FROM images').get();
    while (bytes > this.config.cacheBytes || count > this.config.cacheEntries) {
      const row = this.cache.prepare('SELECT key,bytes FROM images ORDER BY used,key LIMIT 1').get();
      if (!row) break;
      await this.remove(row.key); bytes -= row.bytes; count--;
    }
    this.metrics.cacheBytes = bytes; this.metrics.cacheEntries = count;
  }
  async reconcile() {
    if (this.reconciling || this.closed) return;
    this.reconciling = true;
    try {
      const rows = this.cache.prepare('SELECT key,gop_id FROM images WHERE key>? ORDER BY key LIMIT 64').all(this.reconcileCursor || '');
      for (const item of rows) await this.cached(item.key, this.byId.get(BigInt(item.gop_id)));
      this.reconcileCursor = rows.length === 64 ? rows.at(-1).key : '';
      await this.evict();
    } finally { this.reconciling = false; this.publish(); }
  }
  async removeTemps() {
    const dir = await fs.promises.opendir(this.config.cacheDir);
    for await (const entry of dir) {
      if (/^[a-f0-9]{64}\.jpg\.tmp$/.test(entry.name)) await fs.promises.unlink(path.join(this.config.cacheDir, entry.name)).catch(() => {});
      // Orphaned images from a crash between rename and index publication are removed too.
      if (/^[a-f0-9]{64}\.jpg$/.test(entry.name) && !this.cache.prepare('SELECT 1 FROM images WHERE key=?').get(entry.name.slice(0, 64)))
        await fs.promises.unlink(path.join(this.config.cacheDir, entry.name)).catch(() => {});
    }
  }
  async image(key) {
    const record = this.cache.prepare('SELECT * FROM images WHERE key=?').get(key);
    if (!record || !await this.cached(key, this.byId.get(BigInt(record.gop_id)))) throw Object.assign(new Error('Thumbnail unavailable'), {code:'image_unavailable', status:404});
    const image = await fs.promises.readFile(this.filename(key));
    if (!jpegDimensions(image)) {
      await this.remove(key);
      throw Object.assign(new Error('Thumbnail unavailable'), {code:'image_unavailable', status:404});
    }
    return image;
  }
  async background() {
    for (const camera of this.db.prepare('SELECT id,stream_id FROM cameras WHERE id>? ORDER BY id LIMIT 64').all(this.backgroundCursor || 0)) {
      this.backgroundCursor = camera.id;
      const row = this.latest.get(camera.id);
      if (!row) continue;
      const time = row.start_time_epoch_us;
      const previous = (this.lastBackground ||= new Map()).get(camera.stream_id);
      if (previous != null && time - previous < BigInt(this.config.intervalMs) * 1000n) continue;
      this.lastBackground.set(camera.stream_id, time);
      while (this.lastBackground.size > 256) this.lastBackground.delete(this.lastBackground.keys().next().value);
      await this.metadata({streamId:camera.stream_id, times:[String(time)], width:this.config.width}, true);
    }
    if (!this.db.prepare('SELECT 1 FROM cameras WHERE id>? LIMIT 1').get(this.backgroundCursor || 0)) this.backgroundCursor = 0;
  }
  async close() {
    this.closed = true; clearInterval(this.timer); clearTimeout(this.pumpTimer);
    this.queue = [];
    for (const child of this.children) child.kill('SIGKILL');
    while (this.running) await new Promise(resolve => setTimeout(resolve, 10));
    this.cache.close(); this.db.close();
  }
}
module.exports = {ThumbnailEngine, jpegDimensions};
