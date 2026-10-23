import { state, activeReview } from "./state.js";
import { playbackController } from "./playback-controller.js";

const $ = window.jQuery;
const tickCount = 7;
const pixelsPerSecond = 10;
function pct(time) {
  const span = Math.max(
    0.001,
    state.timelineRange.end - state.timelineRange.start,
  );
  return Math.max(
    0,
    Math.min(100, ((time - state.timelineRange.start) / span) * 100),
  );
}
function px(time) {
  return Math.max(
    0,
    Math.min(
      state.timelineRange.end - state.timelineRange.start,
      time - state.timelineRange.start,
    ),
  ) * pixelsPerSecond;
}
function timelineWidth() {
  return Math.max(
    1,
    (state.timelineRange.end - state.timelineRange.start) * pixelsPerSecond,
  );
}
function timeLabel(time, milliseconds = false) {
  const date = new Date(time * 1000);
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(milliseconds ? { fractionalSecondDigits: 3 } : {}),
  });
}
function gapAt(camera, time) {
  return (
    !camera.available ||
    camera.gaps?.some((gap) => time >= gap.start && time <= gap.end)
  );
}
function marker(review, type, time, label, className) {
  if (time < state.timelineRange.start) return "";
  return `<button class="annotation-marker ${className}" style="left:${px(time)}px" data-review-id="${review.id}" data-time="${time}" title="${label}: ${timeLabel(time, true)}"><span>${label}</span></button>`;
}

function ensureTicks() {
  const container = document.getElementById("timelineTicks");
  if (container.children.length === tickCount) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < tickCount; i++) {
    const span = document.createElement("span");
    span.style.left = `${(i * 100) / (tickCount - 1)}%`;
    fragment.append(span);
  }
  container.replaceChildren(fragment);
}

export const timelineController = {
  initialize() {
    ensureTicks();
    this.renderTracks();
    this.renderAnnotations();
    this.renderPsselEvents();
    this.updateDynamic();
  },
  renderTracks() {
    $("#timelineTracks").html(
      state.cameras
        .map((camera) => {
          const gaps = (camera.gaps || [])
            .filter((gap) => gap.end >= state.timelineRange.start)
            .map(
              (gap) =>
                `<span class="track-gap" data-start="${gap.start}" data-end="${gap.end}"></span>`,
            )
            .join("");
          return `<div class="timeline-track" data-camera-track="${camera.id}"><span class="track-label">CAM ${camera.id}</span><div class="track-line">${gaps}</div></div>`;
        })
        .join(""),
    );
    this.updateTrackState();
    this.updatePositions();
  },
  updateTrackState() {
    state.cameras.forEach((camera) => {
      const displayed =
        state.currentView === "MCV" || state.selectedCamera === camera.id;
      $(`[data-camera-track="${camera.id}"] .track-line`)
        .toggleClass("displayed", displayed)
        .toggleClass("available", !displayed)
        .toggleClass("unavailable", !camera.available);
    });
  },
  renderAnnotations() {
    const lanes = { chung: 0, hong: 0 };
    $("#timelineAnnotations").html(
      state.reviewHistory
        .filter((review) => review.windowEnd >= state.timelineRange.start)
        .map((review) => {
          const className = `${review.side || "chung"} ${review.issueType === "technical" ? "technical" : ""} ${review.origin === "referee" ? "referee" : ""}`;
          const lane = lanes[review.side || "chung"]++ % 3,
            shift = lane * 4 * (review.side === "hong" ? -1 : 1);
          const locked =
            state.activeReviewId && state.activeReviewId !== review.id;
          let html = `<button class="review-window ${className} ${review.id === state.currentRequest ? "selected" : ""} ${review.id === state.activeReviewId ? "active" : ""} ${locked ? "locked" : ""}" style="--lane-shift:${shift}px" data-review-id="${review.id}" data-start="${review.windowStart}" data-end="${review.windowEnd}" title="${locked ? "Pending while another review is active" : `Select ${review.id}`}" ${locked ? 'aria-disabled="true"' : ""}><span>${review.id}</span></button>`;
          html += marker(
            review,
            "rm",
            review.rm,
            "RM",
            `request-mark ${className}`,
          );
          if (review.rst)
            html += marker(review, "rst", review.rst, "RST", "rst-mark");
          if (review.aur != null)
            html += marker(
              review,
              "aur",
              review.aur,
              "AUR",
              `aur-mark ${review.aurOutsideWindow ? "outside" : ""}`,
            );
          return html;
        })
        .join(""),
    );
    this.updatePositions();
  },
  renderPsselEvents() {
    $("#psselEvents").html(
      state.psselEvents
        .filter((event) => event.time >= state.timelineRange.start)
        .map(
          (event) =>
            `<button class="pssel-marker pssel-${event.type} ${event.side || ""}" style="left:${px(event.time)}px" data-pssel-id="${event.id}" data-time="${event.time}" title="${event.label} · ${timeLabel(event.time, true)}${event.score ? ` · ${event.score}` : ""}"><i class="fa-solid ${event.type === "score" ? "fa-bolt" : event.type === "penalty" ? "fa-square" : event.type === "pause" ? "fa-pause" : event.type === "resume" ? "fa-play" : "fa-flag"}"></i></button>`,
        )
        .join(""),
    );
    this.updatePositions();
  },
  updatePositions() {
    document.querySelectorAll("#timeline [data-time]").forEach((node) => {
      node.style.left = `${px(Number(node.dataset.time))}px`;
    });
    document.querySelectorAll("#timeline .review-window").forEach((node) => {
      node.style.left = `${px(Number(node.dataset.start))}px`;
      node.style.width = `${Math.max(1, px(Number(node.dataset.end)) - px(Number(node.dataset.start)))}px`;
    });
    document.querySelectorAll("#timeline .track-gap").forEach((node) => {
      node.style.left = `${px(Number(node.dataset.start))}px`;
      node.style.width = `${Math.max(1, px(Number(node.dataset.end)) - px(Number(node.dataset.start)))}px`;
    });
  },
  updateDynamic() {
    const scroll = document.getElementById("timelineScroll");
    const pinnedToLive =
      scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft <= 2;
    document.getElementById("timeline").style.width = `${timelineWidth()}px`;
    if (pinnedToLive) scroll.scrollLeft = scroll.scrollWidth;
    this.updatePositions();
    $("#playbackCursor").css("left", `${px(state.playbackCursor)}px`);
    $("#liveEdge").css("left", `${px(state.liveEdge)}px`);
    $("#timeline").attr("aria-valuenow", pct(state.playbackCursor).toFixed(1));
    ensureTicks();
    [...document.getElementById("timelineTicks").children].forEach(
      (tick, i) => {
        const time =
          state.timelineRange.start +
          ((state.timelineRange.end - state.timelineRange.start) * i) /
            (tickCount - 1);
        tick.style.left = `${px(time)}px`;
        tick.textContent = timeLabel(time);
      },
    );
    const endSource = activeReview()?.rst
      ? "active review start"
      : "current time";
    $("#timelineRangeLabel").text(
      `${timeLabel(state.timelineRange.start)} (${state.timelineStartSource}) – ${timeLabel(state.timelineRange.end)} (${endSource})`,
    );
  },
  positionFromEvent(event) {
    const rect = document.getElementById("timeline").getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    return (
      state.timelineRange.start +
      ratio * (state.timelineRange.end - state.timelineRange.start)
    );
  },
  seekFromEvent(event) {
    const time = this.positionFromEvent(event);
    const camera = state.cameras.find(
      (item) => item.id === state.selectedCamera,
    );
    if (state.currentView !== "MCV" && gapAt(camera, time)) return false;
    playbackController.seekTo(time);
    return true;
  },
  format: timeLabel,
};
