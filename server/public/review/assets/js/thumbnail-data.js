import { CELL_US } from "./thumbnail-time.js";
export class ThumbnailData {
  constructor(api, {limit = 192, attempts = 4, now = () => performance.now()} = {}) {
    Object.assign(this, {api, limit, attempts, now}); this.entries = new Map(); this.generation = 0;
  }
  key(ring, camera, time) { return `${ring}:${camera}:${time}`; }
  get(ring, camera, time) { return this.entries.get(this.key(ring, camera, time)); }
  reset() { this.cancel(); this.entries.clear(); }
  cancel() { this.generation++; this.abort?.abort(); this.abort = null; }
  async load(ring, times, onUpdate) {
    this.cancel();
    if (!times.length) return;
    const generation = this.generation;
    const abort = this.abort = new AbortController();
    const wanted = new Set(times.flatMap(time => [1, 2, 3].map(camera => this.key(ring, camera, time))));
    for (const key of this.entries.keys()) if (!wanted.has(key)) this.entries.delete(key);
    const loadCamera = async camera => {
      if (abort.signal.aborted || generation !== this.generation) return;
      const needed = times.filter(time => {
        const entry = this.get(ring, camera, time);
        return !entry || (entry.status === "pending" && entry.attempts < this.attempts && entry.next <= this.now()) || (entry.status === "ready" && entry.expires <= this.now());
      });
      if (!needed.length) return;
      // The bounded visible window is one batch per camera. Match slots by timestamp, never array position.
      const start = needed[0], end = needed.at(-1) + CELL_US;
      let payload;
      try { payload = await this.api.thumbnails({ring, camera, startEpochUs:String(start), endEpochUs:String(end), intervalMs:5000, width:128, signal:abort.signal}); }
      catch (error) {
        if (abort.signal.aborted) return;
        payload = {samples:needed.map(time => ({requestedEpochUs:String(time), status:error.status === 404 || error.status === 410 ? "unavailable" : "pending", reason:"service_unavailable"}))};
      }
      if (generation !== this.generation || abort.signal.aborted) return;
      const samples = new Map((payload.samples || []).map(sample => [String(sample.requestedEpochUs), sample]));
      for (const time of needed) {
        const key = this.key(ring, camera, time), previous = this.entries.get(key);
        const sample = samples.get(String(time)) || {status:"unavailable", reason:"missing_sample"};
        const attempts = (previous?.attempts || 0) + 1;
        const retryable = sample.status === "pending" || ["queue_full", "source_pending", "thumbnail_busy"].includes(sample.reason);
        const ready = sample.status === "ready" && typeof sample.imageUrl === "string";
        let url = null;
        try { if (ready) url = this.api.thumbnailUrl(sample.imageUrl); } catch (_) { /* Reject invalid image URLs. */ }
        this.entries.set(key, {...sample, status:url ? "ready" : retryable && attempts < this.attempts ? "pending" : "unavailable", url, attempts,
          next:this.now() + Math.min(8000, 500 * 2 ** (attempts - 1)), expires:this.now() + 60000});
      }
      while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
      onUpdate();
    };
    // The service admits two simultaneous thumbnail operations per client.
    for (const cameras of [[1, 2], [3]]) await Promise.allSettled(cameras.map(loadCamera));
  }
  imageFailed(ring, camera, time) {
    const entry = this.get(ring, camera, time);
    if (entry) { entry.status = "unavailable"; entry.url = null; entry.reason = "image_unavailable"; }
  }
  nextRetry() {
    const entries = [...this.entries.values()].filter(entry => entry.status === "pending");
    return entries.length ? Math.max(0, Math.min(...entries.map(entry => entry.next)) - this.now()) : null;
  }
}
