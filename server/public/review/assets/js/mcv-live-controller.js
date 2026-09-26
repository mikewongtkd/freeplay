const SYNC_INTERVAL_MS = 1000;

export class McvLiveController {
  constructor(entries, {onState, onSync} = {}) {
    this.entries = entries; this.onState = onState; this.onSync = onSync; this.syncTimer = null; this.generation = 0;
  }

  get activeControllers() { return this.entries.map(entry => entry.controller).filter(controller => controller.liveActive); }
  get playableControllers() { return this.entries.map(entry => entry.controller).filter(controller => controller.active); }

  async start(epochSeconds, {ring, cameras}) {
    this.stop(); const generation = ++this.generation;
    const available = new Set(cameras.filter(camera => camera.available).map(camera => Number(camera.id)));
    const jobs = this.entries.map(async entry => {
      if (!available.has(entry.camera)) { entry.controller.reset(); this.onState?.(entry.camera, 'unavailable'); return; }
      try {
        await entry.controller.goLive(epochSeconds, {ring, camera:entry.camera, play:false});
      } catch (error) {
        if (error.name !== 'AbortError') this.onState?.(entry.camera, 'error', error);
      }
    });
    await Promise.allSettled(jobs);
    if (generation !== this.generation) return;
    this.synchronize();
    await Promise.allSettled(this.activeControllers.map(controller => controller.setPlaying(true)));
    this.scheduleSync(generation);
  }

  synchronize() {
    const controllers = this.activeControllers;
    const epochs = controllers.map(controller => controller.currentEpoch).filter(Number.isFinite).sort((a, b) => a - b);
    if (epochs.length < 2) { this.onSync?.({cameraCount:epochs.length, driftMs:0}); return; }
    const target = epochs[Math.floor(epochs.length / 2)];
    controllers.forEach(controller => controller.synchronizeTo(target));
    this.onSync?.({cameraCount:epochs.length, driftMs:Math.round((epochs.at(-1) - epochs[0]) * 1000)});
  }

  scheduleSync(generation) {
    if (generation !== this.generation) return;
    this.syncTimer = setTimeout(() => { this.synchronize(); this.scheduleSync(generation); }, SYNC_INTERVAL_MS);
  }

  setPlaying(playing) { return Promise.allSettled(this.playableControllers.map(controller => controller.setPlaying(playing))); }

  stop({reset = true} = {}) {
    this.generation++;
    if (this.syncTimer != null) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.entries.forEach(entry => {
      if (reset) entry.controller.reset();
      else { entry.controller.setPlaying(false); entry.controller.stopLivePolling(); }
    });
  }
}
