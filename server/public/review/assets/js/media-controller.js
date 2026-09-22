import {ReplayApi} from './replay-api.js';

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
    video.addEventListener('timeupdate', () => { if (this.manifest) this.onTime?.(this.rangeStartEpoch + video.currentTime); });
    video.addEventListener('playing', () => this.onState?.('playing'));
    video.addEventListener('pause', () => this.onState?.('paused'));
    video.addEventListener('error', () => { if (!this.resetting && video.getAttribute('src')) this.fail(new Error('Chrome could not decode the replay media.')); });
  }

  get active() { return !!this.manifest && this.scene.classList.contains('real-media-active'); }

  fail(error) {
    this.scene.classList.remove('real-media-active');
    this.onState?.('error', error);
  }

  reset() {
    this.abortController?.abort(); this.abortController = null; this.loading = null; this.manifest = null;
    this.resetting = true; this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.resetting = false;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = null;
    this.scene.classList.remove('real-media-active');
  }

  contains(epochSeconds, camera) {
    if (!this.manifest || this.manifest.requested.camera !== camera) return false;
    const start = Number(this.manifest.requested.logicalStartEpochUs) / 1e6, end = Number(this.manifest.requested.logicalEndEpochUs) / 1e6;
    return epochSeconds >= start && epochSeconds <= end;
  }

  async seek(epochSeconds, {ring, camera, play = false} = {}) {
    if (this.contains(epochSeconds, camera)) {
      this.video.currentTime = Math.max(0, epochSeconds - this.rangeStartEpoch);
      if (play) await this.video.play(); else this.video.pause();
      return;
    }
    this.loading = this.load(epochSeconds, {ring, camera, play});
    return this.loading;
  }

  async load(epochSeconds, {ring, camera, play}) {
    this.reset(); this.abortController = new AbortController(); const {signal} = this.abortController;
    this.onState?.('loading');
    try {
      const manifest = await this.api.manifest({ring, camera, timeEpochUs:Math.round(epochSeconds * 1e6), signal});
      if (!manifest.camera.available || !manifest.camera.fragments.length) throw Object.assign(new Error('No retained video is available at this time.'), {code:'range_not_retained'});
      if (!window.MediaSource || !MediaSource.isTypeSupported(manifest.camera.mimeType)) throw Object.assign(new Error(`Chrome does not support ${manifest.camera.mimeType || 'this camera codec'}.`), {code:'decoder_unsupported'});
      const mediaSource = new MediaSource(); this.objectUrl = URL.createObjectURL(mediaSource); this.video.src = this.objectUrl;
      await waitFor(mediaSource, 'sourceopen', signal);
      const sourceBuffer = mediaSource.addSourceBuffer(manifest.camera.mimeType); sourceBuffer.mode = 'segments';
      const initById = new Map(manifest.camera.initializations.map(item => [item.id, item]));
      const initBytes = new Map(); let currentInit = null;
      // Keep the preceding keyframe in the non-negative media timeline so MSE
      // can decode frames at the requested logical start.
      this.rangeStartEpoch = Number(manifest.camera.decodableStartEpochUs) / 1e6;
      for (const item of manifest.camera.fragments) {
        if (signal.aborted) throw new DOMException('Replay request cancelled.', 'AbortError');
        if (item.initializationId !== currentInit) {
          const init = initById.get(item.initializationId); if (!init) throw new Error('Fragment initialization data is missing.');
          if (!initBytes.has(init.id)) initBytes.set(init.id, await this.api.bytes(init.url, signal));
          await appendBuffer(sourceBuffer, initBytes.get(init.id), signal); currentInit = init.id;
        }
        const desiredStart = Number(item.startEpochUs) / 1e6 - this.rangeStartEpoch;
        const mediaStart = Number(item.startPtsUs) / 1e6;
        sourceBuffer.timestampOffset = desiredStart - mediaStart;
        await appendBuffer(sourceBuffer, await this.api.bytes(item.url, signal), signal);
      }
      if (mediaSource.readyState === 'open') {
        try {
          const duration = Number(manifest.requested.logicalEndEpochUs) / 1e6 - this.rangeStartEpoch;
          mediaSource.duration = Math.max(.001, duration);
        } catch (_) {}
      }
      this.manifest = manifest; this.scene.classList.add('real-media-active');
      this.video.currentTime = Math.max(0, epochSeconds - this.rangeStartEpoch);
      if (play) await this.video.play(); else this.video.pause();
      this.onState?.('ready', manifest);
    } catch (error) {
      if (error.name !== 'AbortError') this.fail(error);
      throw error;
    }
  }

  setPlaying(playing) { if (playing) return this.video.play().catch(error => this.fail(error)); this.video.pause(); }
  setRate(rate) { if (rate > 0) this.video.playbackRate = rate; }
}
