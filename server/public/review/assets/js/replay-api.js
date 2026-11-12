function defaultOrigin() {
  const configured = window.FREEPLAY_IVR?.config?.replayApiBase;
  if (configured) return configured.replace(/\/$/, "");
  return `${window.location.protocol}//${window.location.hostname}:9000/api/ivr/v1`;
}

export class ReplayApi {
  constructor(base = defaultOrigin()) {
    this.base = base;
  }

  async manifest({
    ring,
    camera,
    timeEpochUs,
    beforeSeconds = 5,
    afterSeconds = 5,
    signal,
  }) {
    const query = new URLSearchParams({
      ring,
      camera,
      timeEpochUs: String(timeEpochUs),
      beforeSeconds,
      afterSeconds,
    });
    const response = await fetch(`${this.base}/replay?${query}`, {
      signal,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok)
      throw Object.assign(
        new Error(payload.error?.message || "Replay lookup failed."),
        { code: payload.error?.code || "replay_lookup_failed" },
      );
    return payload;
  }

  thumbnailUrl(resourceUrl) {
    const url = new URL(resourceUrl, `${this.base}/`);
    if (url.origin !== new URL(this.base).origin || !/^https?:$/.test(url.protocol)) throw new Error("Invalid thumbnail URL");
    return url.href;
  }

  async thumbnails({ring, camera, startEpochUs, endEpochUs, intervalMs = 5000, width = 128, signal}) {
    const query = new URLSearchParams({ring, camera, startEpochUs, endEpochUs, intervalMs, width});
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, {once:true});
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(cancel, 8000);
    try {
      const response = await fetch(`${this.base}/thumbnails?${query}`, {signal:controller.signal, cache:"no-store"});
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error?.message || "Thumbnail lookup failed"), {status:response.status});
      return payload;
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel);
    }
  }

  async bytes(resourceUrl, signal) {
    const response = await fetch(new URL(resourceUrl, `${this.base}/`), {
      signal,
    });
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {}
      throw Object.assign(
        new Error(
          payload?.error?.message || "Replay media could not be loaded.",
        ),
        { code: payload?.error?.code || "media_load_failed" },
      );
    }
    return response.arrayBuffer();
  }
}
