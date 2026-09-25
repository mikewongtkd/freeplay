import {ReplayApi} from './replay-api.js';

const LIVE_POLL_MS = 400;
const LIVE_BUFFER_SECONDS = 30;
const LIVE_TARGET_DELAY_SECONDS = .25;

function waitFor(target, event, signal) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(`Media ${event} operation failed.`)); };
    const aborted = () => { cleanup(); reject(new DOMException('Replay request cancelled.', 'AbortError')); };
    const cleanup = () => { target.removeEventListener(event, done); target.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); };
    target.addEventListener(event, done, {once:true}); target.addEventListener('error', failed, {once:true}); signal?.addEventListener('abort', aborted, {once:true});
  });
}

async function appendBuffer(sourceBuffer, bytes, signal) {
  if (signal?.aborted) throw new DOMException('Replay request cancelled.', 'AbortError');
  sourceBuffer.appendBuffer(bytes);
  await waitFor(sourceBuffer, 'updateend', signal);
}

export class MediaController {
  constructor({video, scene, onTime, onState, api = new ReplayApi()}) {
    this.video = video; this.scene = scene; this.onTime = onTime; this.onState = onState; this.api = api;
    this.abortController = null; this.objectUrl = null; this.manifest = null; this.rangeStartEpoch = 0; this.loading = null; this.resetting = false;
    this.mediaSource = null; this.sourceBuffer = null; this.mimeType = null; this.currentInitializationKey = null;
    this.loadedFragments = new Set(); this.lastEndEpochUs = null; this.live = false; this.liveTimer = null; this.liveOptions = null;
    video.addEventListener('timeupdate', () => { if (this.manifest) this.onTime?.(this.rangeStartEpoch + video.currentTime); });
    video.addEventListener('playing', () => this.onState?.('playing'));
    video.addEventListener('pause', () => this.onState?.('paused'));
    video.addEventListener('error', () => { if (!this.resetting && video.getAttribute('src')) this.fail(new Error('Chrome could not decode the replay media.')); });
  }

  get active() { return !!this.manifest && this.scene.classList.contains('real-media-active'); }
  get liveActive() { return this.active && this.live; }

  fail(error) {
    this.stopLivePolling();
    this.scene.classList.remove('real-media-active');
    this.onState?.('error', error);
  }

  reset() {
    this.stopLivePolling();
    this.abortController?.abort(); this.abortController = null; this.loading = null; this.manifest = null;
    this.resetting = true; this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.resetting = false;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = null;
    this.mediaSource = null; this.sourceBuffer = null; this.mimeType = null; this.currentInitializationKey = null;
    this.loadedFragments.clear(); this.lastEndEpochUs = null; this.liveOptions = null;
    this.scene.classList.remove('real-media-active');
  }

  stopLivePolling() {
    this.live = false;
    if (this.liveTimer != null) clearTimeout(this.liveTimer);
    this.liveTimer = null;
  }

  contains(epochSeconds, camera) {
    if (!this.manifest || this.manifest.requested.camera !== camera) return false;
    const start = Number(this.manifest.requested.logicalStartEpochUs) / 1e6, end = Number(this.manifest.requested.logicalEndEpochUs) / 1e6;
    return epochSeconds >= start && epochSeconds <= end;
  }

  async seek(epochSeconds, {ring, camera, play = false} = {}) {
    this.stopLivePolling();
    if (this.contains(epochSeconds, camera)) {
      this.video.currentTime = Math.max(0, epochSeconds - this.rangeStartEpoch);
      if (play) await this.video.play(); else this.video.pause();
      return;
    }
    this.loading = this.load(epochSeconds, {ring, camera, play});
    return this.loading;
  }

  goLive(epochSeconds, {ring, camera} = {}) {
    this.loading = this.load(epochSeconds, {ring, camera, play:true, live:true});
    return this.loading;
  }

  async appendManifest(manifest, signal) {
    const initById = new Map(manifest.camera.initializations.map(item => [item.id, item]));
    for (const item of manifest.camera.fragments) {
      if (signal.aborted) throw new DOMException('Replay request cancelled.', 'AbortError');
      const fragmentKey = `${item.startEpochUs}:${item.endEpochUs}`;
      if (this.loadedFragments.has(fragmentKey)) continue;
      const initialization = initById.get(item.initializationId);
      if (!initialization) throw new Error('Fragment initialization data is missing.');
      const initializationKey = item.initializationKey || initialization.key || initialization.id;
      if (initializationKey !== this.currentInitializationKey) {
        if (manifest.camera.mimeType !== this.mimeType) {
          if (!this.sourceBuffer.changeType) throw new Error('The camera codec changed and Chrome cannot reconfigure this replay buffer.');
          this.sourceBuffer.changeType(manifest.camera.mimeType); this.mimeType = manifest.camera.mimeType;
        }
        await appendBuffer(this.sourceBuffer, await this.api.bytes(initialization.url, signal), signal);
        this.currentInitializationKey = initializationKey;
      }
      const desiredStart = Number(item.startEpochUs) / 1e6 - this.rangeStartEpoch;
      const mediaStart = Number(item.startPtsUs) / 1e6;
      this.sourceBuffer.timestampOffset = desiredStart - mediaStart;
      await appendBuffer(this.sourceBuffer, await this.api.bytes(item.url, signal), signal);
      this.loadedFragments.add(fragmentKey);
      if (this.lastEndEpochUs == null || BigInt(item.endEpochUs) > BigInt(this.lastEndEpochUs)) this.lastEndEpochUs = item.endEpochUs;
    }
    if (this.mediaSource?.readyState === 'open' && this.lastEndEpochUs != null) {
      const mediaEnd = Number(this.lastEndEpochUs) / 1e6 - this.rangeStartEpoch;
      try { this.mediaSource.duration = Math.max(Number.isFinite(this.mediaSource.duration) ? this.mediaSource.duration : 0, mediaEnd + (this.live ? 2 : 0)); } catch (_) {}
    }
  }

  bufferedEnd() {
    const ranges = this.video.buffered;
    return ranges.length ? ranges.end(ranges.length - 1) : null;
  }

  async maintainLivePlayback(signal) {
    const end = this.bufferedEnd();
    if (end == null || signal.aborted) return;
    if (this.video.ended || this.video.paused || end - this.video.currentTime > 3) this.video.currentTime = Math.max(0, end - LIVE_TARGET_DELAY_SECONDS);
    if (this.video.paused) await this.video.play();
    const removeBefore = this.video.currentTime - LIVE_BUFFER_SECONDS;
    if (removeBefore > 0 && this.sourceBuffer.buffered.length && this.sourceBuffer.buffered.start(0) < removeBefore) {
      this.sourceBuffer.remove(0, removeBefore);
      await waitFor(this.sourceBuffer, 'updateend', signal);
      const retainedEpoch = this.rangeStartEpoch + removeBefore;
      for (const key of this.loadedFragments) if (Number(key.split(':')[1]) / 1e6 < retainedEpoch) this.loadedFragments.delete(key);
    }
  }

  scheduleLivePoll(signal) {
    if (!this.live || signal.aborted) return;
    this.liveTimer = setTimeout(() => { void this.pollLive(signal); }, LIVE_POLL_MS);
  }

  async pollLive(signal) {
    if (!this.live || signal.aborted || !this.lastEndEpochUs) return;
    try {
      const manifest = await this.api.manifest({...this.liveOptions, timeEpochUs:(BigInt(this.lastEndEpochUs) + 1n).toString(), beforeSeconds:0, afterSeconds:5, signal});
      if (manifest.camera.available && manifest.camera.fragments.length) {
        await this.appendManifest(manifest, signal);
        await this.maintainLivePlayback(signal);
      }
    } catch (error) {
      if (error.name !== 'AbortError') { this.fail(error); return; }
    }
    this.scheduleLivePoll(signal);
  }

  async load(epochSeconds, {ring, camera, play, live = false}) {
    this.reset(); this.abortController = new AbortController(); const {signal} = this.abortController;
    this.live = live; this.liveOptions = {ring, camera};
    this.onState?.('loading');
    try {
      const manifest = await this.api.manifest({ring, camera, timeEpochUs:Math.round(epochSeconds * 1e6), beforeSeconds:5, afterSeconds:live ? 0 : 5, signal});
      if (!manifest.camera.available || !manifest.camera.fragments.length) throw Object.assign(new Error('No retained video is available at this time.'), {code:'range_not_retained'});
      if (!window.MediaSource || !MediaSource.isTypeSupported(manifest.camera.mimeType)) throw Object.assign(new Error(`Chrome does not support ${manifest.camera.mimeType || 'this camera codec'}.`), {code:'decoder_unsupported'});
      this.mediaSource = new MediaSource(); this.objectUrl = URL.createObjectURL(this.mediaSource); this.video.src = this.objectUrl;
      await waitFor(this.mediaSource, 'sourceopen', signal);
      this.sourceBuffer = this.mediaSource.addSourceBuffer(manifest.camera.mimeType); this.sourceBuffer.mode = 'segments'; this.mimeType = manifest.camera.mimeType;
      // Keep the preceding keyframe in the non-negative media timeline so MSE
      // can decode frames at the requested logical start.
      this.rangeStartEpoch = Number(manifest.camera.decodableStartEpochUs) / 1e6;
      await this.appendManifest(manifest, signal);
      if (!live && this.mediaSource.readyState === 'open') {
        try {
          const duration = Number(manifest.requested.logicalEndEpochUs) / 1e6 - this.rangeStartEpoch;
          this.mediaSource.duration = Math.max(.001, duration);
        } catch (_) {}
      }
      this.manifest = manifest; this.scene.classList.add('real-media-active');
      this.video.currentTime = live ? Math.max(0, (this.bufferedEnd() ?? 0) - LIVE_TARGET_DELAY_SECONDS) : Math.max(0, epochSeconds - this.rangeStartEpoch);
      if (play) await this.video.play(); else this.video.pause();
      this.onState?.('ready', manifest);
      if (live) this.scheduleLivePoll(signal);
    } catch (error) {
      if (error.name !== 'AbortError') this.fail(error);
      throw error;
    }
  }

  setPlaying(playing) { if (playing) return this.video.play().catch(error => this.fail(error)); this.video.pause(); }
  setRate(rate) { if (rate > 0) this.video.playbackRate = rate; }
}
