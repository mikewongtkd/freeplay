import { ReplayApi } from "./replay-api.js";
import { ThumbnailData } from "./thumbnail-data.js";
import { CELL_US, CELL_PX, ROW_PX, secondsUs, usSeconds, cellStart, timeX, xTime, visibleCells, anchorTime, scrollForTime, clampScroll } from "./thumbnail-time.js";
const PLACEHOLDER = "/review/assets/images/video-unavailable.svg";
export class PreviewVisibility {
  constructor() { this.visible = false; this.started = null; this.aur = new Map(); }
  lifecycle(state) {
    const active = state.reviewHistory.find(review => review.id === state.activeReviewId);
    const key = active ? `${active.id}:${active.rst}` : null;
    if (key && key !== this.started) this.visible = active.aur == null;
    if (!key && this.started) this.visible = false;
    this.started = key;
    for (const review of state.reviewHistory) {
      const version = review.aur == null ? null : `${review.aur}:${review.aurHistory?.length || 0}`;
      const previous = this.aur.get(review.id);
      if (version && version !== previous && previous !== undefined) this.visible = false;
      this.aur.set(review.id, version);
    }
    const ids = new Set(state.reviewHistory.map(review => review.id));
    for (const id of this.aur.keys()) if (!ids.has(id)) this.aur.delete(id);
  }
}
export class TimelineThumbnailPreview {
  constructor({state, subscribe, seek, api = new ReplayApi()}) {
    Object.assign(this, {state, seek}); this.visibility = new PreviewVisibility(); this.data = new ThumbnailData(api);
    this.panel = document.getElementById("thumbnailPreview");
    this.controls = document.querySelector("#mcvView .mcv-controls-row");
    this.scroll = document.getElementById("ttpScroll"); this.grid = document.getElementById("ttpGrid"); this.cursor = document.getElementById("ttpCursor");
    this.timelineScroll = document.getElementById("timelineScroll"); this.timeline = document.getElementById("timeline");
    this.cells = new Map(); this.expected = new Map(); this.positions = new Map(); this.listeners = [];
    this.listen(this.scroll, "scroll", () => this.scrolled("ttp"));
    this.listen(this.timelineScroll, "scroll", () => this.scrolled("timeline"));
    this.listen(this.grid, "click", event => { void this.click(event); });
    this.listen(document.getElementById("hideThumbnailPreview"), "click", () => this.toggle());
    this.listen(document.getElementById("toggleThumbnailPreview"), "click", () => this.toggle());
    this.listen(window, "resize", () => { if (this.active) { this.windowKey = null; this.update(); this.alignCursor(); } });
    this.unsubscribe = subscribe(() => this.stateChanged());
    this.resize = new ResizeObserver(() => {
      if (!this.active) return;
      const width = this.scroll.clientWidth, scale = this.geometry().scale;
      const changed = width !== this.observedWidth || Math.abs(scale - (this.observedScale || scale)) > .01;
      this.observedWidth = width; this.observedScale = scale;
      this.update();
      if (changed && performance.now() >= (this.manualUntil || 0)) this.alignCursor();
    });
    this.resize.observe(this.timeline); this.resize.observe(this.scroll);
  }
  stateChanged() { this.visibility.lifecycle(this.state); this.present(); this.update(); }
  listen(target, type, callback) { target.addEventListener(type, callback); this.listeners.push(() => target.removeEventListener(type, callback)); }
  toggle() {
    if (this.state.currentView !== "MCV") return;
    this.visibility.visible = !this.visibility.visible; this.present();
  }
  present() {
    const active = this.visibility.visible && this.state.currentView === "MCV";
    this.panel.classList.toggle("d-none", !active); this.controls.classList.toggle("d-none", active);
    const toggle = document.getElementById("toggleThumbnailPreview");
    toggle.setAttribute("aria-pressed", String(active)); toggle.textContent = active ? "Review controls (T)" : "Thumbnails (T)";
    if (active === this.active) return;
    this.active = active;
    cancelAnimationFrame(this.showFrame);
    if (!active) {
      clearTimeout(this.loadTimer); clearTimeout(this.retryTimer); this.data.cancel();
      for (const cell of this.cells.values()) cell.querySelector("img").src = PLACEHOLDER;
      return;
    }
    this.windowKey = null;
    this.update();
    this.showFrame = requestAnimationFrame(() => { if (this.active) { this.alignCursor(); this.windowKey = null; this.update(); } });
  }
  geometry() {
    const rect = this.timeline.getBoundingClientRect(), viewport = this.timelineScroll.getBoundingClientRect();
    const start = secondsUs(this.state.timelineRange.start), end = secondsUs(this.state.timelineRange.end);
    return {start, scale:rect.width / Math.max(0.000001, Number(end - start) / 1000000),
      offset:rect.left - viewport.left + this.timelineScroll.scrollLeft, rect, viewport};
  }
  setScroll(element, value) {
    const next = clampScroll(value, element.scrollWidth, element.clientWidth);
    if (Math.abs(element.scrollLeft - next) < 0.5) { this.positions.set(element, element.scrollLeft); return; }
    this.expected.set(element, next); this.positions.set(element, next); element.scrollLeft = next;
  }
  scrolled(source) {
    if (!this.active) return;
    const element = source === "ttp" ? this.scroll : this.timelineScroll;
    const previous = this.positions.get(element) ?? element.scrollLeft;
    this.positions.set(element, element.scrollLeft);
    if (Math.abs(element.scrollLeft - (this.expected.get(element) ?? Infinity)) < 1) { this.expected.delete(element); return; }
    this.expected.delete(element);
    if (Math.abs(previous - element.scrollLeft) < .5) return;
    this.manualUntil = performance.now() + 700;
    const g = this.geometry();
    const origin = source === "ttp" ? this.origin : g.start;
    const scale = source === "ttp" ? 25.6 : g.scale;
    const offset = source === "ttp" ? 0 : g.offset;
    const delta = anchorTime(element.scrollLeft, element.clientWidth, offset, origin, scale) - anchorTime(previous, element.clientWidth, offset, origin, scale);
    this.pendingScroll = {source, delta:delta + (this.pendingScroll?.source === source ? this.pendingScroll.delta : 0n)};
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      if (!this.active || !this.pendingScroll) return;
      const pending = this.pendingScroll; this.pendingScroll = null;
      const target = pending.source === "ttp" ? this.timelineScroll : this.scroll;
      const geometry = this.geometry();
      const start = pending.source === "ttp" ? geometry.start : this.origin;
      const pixels = pending.source === "ttp" ? geometry.scale : 25.6;
      const padding = pending.source === "ttp" ? geometry.offset : 0;
      // Translate the viewport anchor's time delta; unequal label gutters must not add a jump after cursor alignment.
      const anchor = anchorTime(target.scrollLeft, target.clientWidth, padding, start, pixels) + pending.delta;
      this.setScroll(target, scrollForTime(anchor, start, pixels, padding, target.clientWidth / 2, target.scrollWidth, target.clientWidth));
      this.updateWindow();
    });
  }
  update() {
    if (!this.active) return;
    const start = secondsUs(this.state.timelineRange.start), end = secondsUs(this.state.timelineRange.end);
    const context = `${this.state.ring}:${this.state.match?.number}:${this.state.match?.round}:${start}`;
    if (context !== this.context) {
      this.context = context; this.data.reset(); this.windowKey = null;
      for (const cell of this.cells.values()) cell.remove(); this.cells.clear();
    }
    this.origin = cellStart(start); this.end = end;
    this.count = Math.max(1, Number((end - this.origin + CELL_US - 1n) / CELL_US));
    this.grid.style.width = `${this.count * CELL_PX}px`;
    const cursor = secondsUs(this.state.playbackCursor);
    this.cursor.style.left = `${timeX(cursor, this.origin)}px`;
    if (cursor !== this.lastCursor && performance.now() >= (this.manualUntil || 0)) this.alignCursor();
    this.lastCursor = cursor;
    this.updateWindow();
  }
  alignCursor(screenX) {
    if (!this.active || this.origin == null) return;
    const g = this.geometry(), time = secondsUs(this.state.playbackCursor);
    let x = screenX ?? g.rect.left + timeX(time, g.start, g.scale);
    if (screenX == null && (x < g.viewport.left || x > g.viewport.right)) x = g.viewport.left + this.timelineScroll.clientWidth / 2;
    this.setScroll(this.timelineScroll, timeX(time, g.start, g.scale) + g.offset - (x - g.viewport.left));
    const viewport = this.scroll.getBoundingClientRect();
    this.setScroll(this.scroll, timeX(time, this.origin) - (x - viewport.left));
  }
  async click(event) {
    const button = event.target.closest("[data-ttp-time]"); if (!button || !this.active) return;
    const rect = this.scroll.getBoundingClientRect();
    const time = event.detail === 0 ? BigInt(button.dataset.ttpTime) + CELL_US / 2n : xTime(event.clientX - rect.left + this.scroll.scrollLeft, this.origin);
    await this.seek(usSeconds(time));
    if (this.active) { this.alignCursor(event.detail === 0 ? undefined : event.clientX); this.updateWindow(); }
  }
  updateWindow() {
    if (!this.active || this.origin == null) return;
    const {first, end} = visibleCells(this.scroll.scrollLeft, this.scroll.clientWidth, this.count);
    const key = `${this.context}:${first}:${end}`;
    if (key === this.windowKey) return;
    this.windowKey = key; this.data.cancel(); clearTimeout(this.loadTimer); clearTimeout(this.retryTimer);
    this.times = Array.from({length:Math.max(0, end - first)}, (_, index) => this.origin + BigInt(first + index) * CELL_US);
    const wanted = new Set();
    for (const camera of [1, 2, 3]) for (const time of this.times) {
      const id = `${camera}:${time}`; wanted.add(id);
      if (!this.cells.has(id)) {
        const button = document.createElement("button"); button.type = "button"; button.className = "ttp-cell"; button.dataset.ttpTime = String(time); button.dataset.camera = String(camera);
        button.style.left = `${timeX(time, this.origin)}px`; button.style.top = `${(camera - 1) * ROW_PX}px`;
        const image = document.createElement("img"); image.width = 128; image.height = 68; image.alt = "Video unavailable"; image.src = PLACEHOLDER; image.decoding = "async";
        const label = document.createElement("span"); label.className = "ttp-cell-caption";
        button.append(image, label); this.grid.insertBefore(button, this.cursor); this.cells.set(id, button);
        image.addEventListener("error", () => { if (this.cells.get(id) === button && image.getAttribute("src") !== PLACEHOLDER) { this.data.imageFailed(this.state.ring, camera, time); this.paint(); } });
      }
    }
    for (const [id, cell] of this.cells) if (!wanted.has(id)) { cell.remove(); this.cells.delete(id); }
    this.paint(); this.loadTimer = setTimeout(() => { void this.load(); }, 100);
  }
  paint() {
    if (!this.active) return;
    for (const button of this.cells.values()) {
      const time = BigInt(button.dataset.ttpTime), camera = Number(button.dataset.camera);
      const entry = this.data.get(this.state.ring, camera, time);
      const status = entry?.status || "pending", image = button.querySelector("img");
      const url = status === "ready" ? entry.url : PLACEHOLDER;
      if (image.getAttribute("src") !== url) image.src = url;
      image.alt = status === "ready" ? `Camera ${camera} preview` : status === "pending" ? "Thumbnail loading" : "Video unavailable";
      const elapsed = (time - secondsUs(this.state.timelineRange.start)) / 1000000n;
      const text = `${elapsed < 0n ? "−" : ""}${String((elapsed < 0n ? -elapsed : elapsed) / 60n)}:${String((elapsed < 0n ? -elapsed : elapsed) % 60n).padStart(2,"0")}`;
      button.querySelector("span").textContent = `${text}${status === "pending" ? " · Loading" : status === "unavailable" ? " · Unavailable" : ""}`;
      button.setAttribute("aria-label", `Camera ${camera}, ${text}, ${image.alt}; seek within this interval`);
      button.title = entry?.actualEpochUs ? `Requested ${time} µs; source frame ${entry.actualEpochUs} µs` : image.alt;
    }
  }
  async load() {
    if (!this.active) return;
    const key = this.windowKey;
    await this.data.load(this.state.ring, this.times, () => this.paint());
    if (!this.active || key !== this.windowKey) return;
    clearTimeout(this.retryTimer);
    const delay = this.data.nextRetry();
    if (delay != null) this.retryTimer = setTimeout(() => { void this.load(); }, delay);
  }
  destroy() {
    this.unsubscribe(); this.resize.disconnect(); this.listeners.forEach(remove => remove()); this.data.cancel();
    clearTimeout(this.loadTimer); clearTimeout(this.retryTimer); cancelAnimationFrame(this.showFrame); cancelAnimationFrame(this.scrollFrame);
  }
}
