'use strict';
const path = require('path');
const {Worker} = require('worker_threads');
const {monitorEventLoopDelay} = require('perf_hooks');
const {planRequest} = require('./thumbnail-planner');
const PREFIX = '/api/ivr/v1/thumbnails';
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
class ThumbnailService {
  constructor({dbPath, root, videoDir, config, replayService, maxRings = 14, camerasPerRing = 3}) {
    Object.assign(this, {config, replayService, maxRings, camerasPerRing});
    this.pending = new Map(); this.clients = new Map(); this.nextId = 0; this.replays = 0;
    this.metrics = {enabled:config.enabled, ready:false};
    if (!config.enabled) return;
    this.worker = new Worker(path.join(__dirname, 'thumbnail-worker.js'), {workerData:{dbPath, root, videoDir, config}, resourceLimits:{maxOldGenerationSizeMb:128}});
    this.worker.on('message', message => {
      if (message.metrics) this.metrics = {...this.metrics, ...message.metrics, enabled:true, ready:this.ready};
      if (message.ready) { this.ready = true; this.metrics.ready = true; }
      if (message.startupError) console.warn(JSON.stringify({event:'thumbnail_startup_failed', message:'Check thumbnail cache permissions, SQLite and FFmpeg configuration; ingestion remains available.'}));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id); clearTimeout(pending.timer);
          const count = (this.clients.get(pending.client) || 1) - 1;
          if (count) this.clients.set(pending.client, count); else this.clients.delete(pending.client);
          if (message.error) pending.reject(Object.assign(new Error(message.error.message), message.error));
          else pending.resolve(message.result);
        }
      }
    });
    const failed = () => {
      this.ready = false; this.metrics.ready = false;
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(Object.assign(new Error('Thumbnail worker unavailable'), {code:'thumbnail_unavailable', status:503})); }
      this.pending.clear(); this.clients.clear();
    };
    this.worker.on('error', () => { console.warn(JSON.stringify({event:'thumbnail_worker_failed',message:'Thumbnail worker failed; verify the SQLite native module and thumbnail configuration. Ingest remains available.'})); failed(); }); this.worker.on('exit', () => { this.exited = true; failed(); });
    this.delay = monitorEventLoopDelay({resolution:20}); this.delay.enable();
    this.timer = setInterval(() => {
      this.metrics.ingestEventLoopP99Ms = this.delay.percentile(99) / 1e6;
      if (this.ready && this.metrics.ingestEventLoopP99Ms > 100) this.worker.postMessage({type:'priority', paused:this.replays > 0, deferMs:1000});
      this.delay.reset();
    }, 1000);
    this.timer.unref();
  }
  call(type, data, client) {
    if (!this.ready) return Promise.reject(Object.assign(new Error('Thumbnail service is disabled or starting'), {code:'thumbnail_unavailable', status:503}));
    if (this.pending.size >= this.config.maxPendingRequests || (this.clients.get(client) || 0) >= 2)
      return Promise.reject(Object.assign(new Error('Thumbnail request capacity reached; retry later'), {code:'thumbnail_busy', status:429}));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('Thumbnail request timed out'), {code:'thumbnail_busy', status:503})), this.config.requestTimeoutMs);
      this.pending.set(id, {resolve, reject, timer, client}); this.clients.set(client, (this.clients.get(client) || 0) + 1);
      this.worker.postMessage({id, type, ...data});
    });
  }
  prioritizeReplay(res) {
    if (!this.ready) return;
    this.replays++;
    this.worker.postMessage({type:'priority', paused:true});
    let done = false;
    const release = () => {
      if (done) return; done = true;
      this.replays--;
      if (this.ready) this.worker.postMessage({type:'priority', paused:this.replays > 0, deferMs:100});
    };
    res.once('close', release); res.once('finish', release);
  }
  async handle(req, res, url) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.end(); return; }
    try {
      if (req.method !== 'GET') throw Object.assign(new Error('Use GET for thumbnails'), {code:'method_not_allowed', status:405});
      const client = req.socket.remoteAddress || 'local';
      if (url.pathname === PREFIX) {
        const plan = planRequest(url.searchParams, this.config, this.maxRings, this.camerasPerRing);
        const result = await this.call('metadata', {plan}, client);
        if (res.destroyed) return;
        for (const sample of result.samples) {
          if (sample.key) {
            const token = this.replayService.registerToken({kind:'thumbnail', key:sample.key});
            sample.imageUrl = `${PREFIX}/${token}.jpg`;
            delete sample.key;
          }
        }
        sendJson(res, 200, result);
      } else {
        const match = url.pathname.match(/^\/api\/ivr\/v1\/thumbnails\/([A-Za-z0-9_-]+)\.jpg$/);
        this.replayService.cleanupTokens();
        const token = match && this.replayService.tokens.get(match[1]);
        if (!token || token.kind !== 'thumbnail') throw Object.assign(new Error('Thumbnail token expired or unavailable'), {code:'image_unavailable', status:404});
        const image = Buffer.from(await this.call('image', {key:token.key}, client));
        if (res.destroyed) return;
        res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Content-Length', image.length); res.end(image);
      }
    } catch (error) {
      if (!res.destroyed) sendJson(res, error.status || 503, {ok:false, error:{code:error.code || 'thumbnail_unavailable', message:error.status ? error.message : 'Thumbnail service unavailable'}});
    }
  }
  async close() {
    this.ready = false; this.metrics.ready = false;
    clearInterval(this.timer); this.delay?.disable();
    if (!this.worker || this.exited) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { void this.worker.terminate().then(resolve); }, this.config.timeoutMs + 1000);
      this.worker.once('exit', () => { clearTimeout(timer); resolve(); });
      this.worker.postMessage({type:'close'});
    });
  }
}
module.exports = {ThumbnailService, PREFIX};
