import {state} from './state.js';
import {playbackController} from './playback-controller.js';

const $ = window.jQuery;
const tickCount = 7;
function pct(time) { const span = Math.max(.001, state.timelineRange.end - state.timelineRange.start); return Math.max(0, Math.min(100, ((time - state.timelineRange.start) / span) * 100)); }
function timeLabel(time, milliseconds = false) { const date = new Date(time * 1000); return date.toLocaleTimeString([], {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', ...(milliseconds ? {fractionalSecondDigits: 3} : {})}); }
function gapAt(camera, time) { return !camera.available || camera.gaps?.some(gap => time >= gap.start && time <= gap.end); }
function marker(review, type, time, label, className) { return `<button class="annotation-marker ${className}" style="left:${pct(time)}%" data-review-id="${review.id}" data-time="${time}" title="${label}: ${timeLabel(time, true)}"><span>${label}</span></button>`; }

function ensureTicks() {
  const container = document.getElementById('timelineTicks');
  if (container.children.length === tickCount) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < tickCount; i++) { const span = document.createElement('span'); span.style.left = `${i * 100 / (tickCount - 1)}%`; fragment.append(span); }
  container.replaceChildren(fragment);
}

export const timelineController = {
  initialize() { ensureTicks(); this.renderTracks(); this.renderAnnotations(); this.renderPsselEvents(); this.updateDynamic(); },
  renderTracks() {
    $('#timelineTracks').html(state.cameras.map(camera => {
      const gaps = (camera.gaps || []).map(gap => `<span class="track-gap" data-start="${gap.start}" data-end="${gap.end}"></span>`).join('');
      return `<div class="timeline-track" data-camera-track="${camera.id}"><span class="track-label">CAM ${camera.id}</span><div class="track-line">${gaps}</div></div>`;
    }).join(''));
    this.updateTrackState(); this.updatePositions();
  },
  updateTrackState() {
    state.cameras.forEach(camera => {
      const displayed = state.currentView === 'MCV' || state.selectedCamera === camera.id;
      $(`[data-camera-track="${camera.id}"] .track-line`).toggleClass('displayed', displayed).toggleClass('available', !displayed).toggleClass('unavailable', !camera.available);
    });
  },
  renderAnnotations() {
    $('#timelineAnnotations').html(state.reviewHistory.map(review => {
      const className = `${review.side || 'chung'} ${review.issueType === 'technical' ? 'technical' : ''} ${review.origin === 'referee' ? 'referee' : ''}`;
      let html = `<button class="review-window ${className} ${review.id === state.currentRequest ? 'selected' : ''}" data-review-id="${review.id}" data-start="${review.windowStart}" data-end="${review.windowEnd}" title="Select ${review.id}"><span>${review.id}</span></button>`;
      html += marker(review, 'rm', review.rm, 'RM', `request-mark ${className}`);
      if (review.rst) html += marker(review, 'rst', review.rst, 'RST', 'rst-mark');
      if (review.aur != null) html += marker(review, 'aur', review.aur, 'AUR', `aur-mark ${review.aurOutsideWindow ? 'outside' : ''}`);
      return html;
    }).join(''));
    this.updatePositions();
  },
  renderPsselEvents() {
    $('#psselEvents').html(state.psselEvents.map(event => `<button class="pssel-marker pssel-${event.type} ${event.side || ''}" data-pssel-id="${event.id}" data-time="${event.time}" title="${event.label} · ${timeLabel(event.time, true)}${event.score ? ` · ${event.score}` : ''}"><i class="fa-solid ${event.type === 'score' ? 'fa-bolt' : event.type === 'penalty' ? 'fa-square' : event.type === 'pause' ? 'fa-pause' : event.type === 'resume' ? 'fa-play' : 'fa-flag'}"></i></button>`).join(''));
    this.updatePositions();
  },
  updatePositions() {
    document.querySelectorAll('#timeline [data-time]').forEach(node => { node.style.left = `${pct(Number(node.dataset.time))}%`; });
    document.querySelectorAll('#timeline .review-window').forEach(node => { node.style.left = `${pct(Number(node.dataset.start))}%`; node.style.width = `${Math.max(.7, pct(Number(node.dataset.end)) - pct(Number(node.dataset.start)))}%`; });
    document.querySelectorAll('#timeline .track-gap').forEach(node => { node.style.left = `${pct(Number(node.dataset.start))}%`; node.style.width = `${Math.max(.4, pct(Number(node.dataset.end)) - pct(Number(node.dataset.start)))}%`; });
  },
  updateDynamic() {
    this.updatePositions();
    $('#playbackCursor').css('left', `${pct(state.playbackCursor)}%`);
    $('#liveEdge').css('left', `${pct(state.liveEdge)}%`);
    $('#timeline').attr('aria-valuenow', pct(state.playbackCursor).toFixed(1));
    ensureTicks();
    [...document.getElementById('timelineTicks').children].forEach((tick, i) => { const time = state.timelineRange.start + (state.timelineRange.end - state.timelineRange.start) * i / (tickCount - 1); tick.textContent = timeLabel(time); });
    const endSource = state.reviewHistory.find(review => review.id === state.currentRequest)?.rst ? 'review start' : 'current time';
    $('#timelineRangeLabel').text(`${timeLabel(state.timelineRange.start)} (${state.timelineStartSource}) – ${timeLabel(state.timelineRange.end)} (${endSource})`);
  },
  positionFromEvent(event) { const rect = document.getElementById('timeline').getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); return state.timelineRange.start + ratio * (state.timelineRange.end - state.timelineRange.start); },
  seekFromEvent(event) { const time = this.positionFromEvent(event); const camera = state.cameras.find(item => item.id === state.selectedCamera); if (state.currentView !== 'MCV' && gapAt(camera, time)) return false; playbackController.seekTo(time); return true; },
  format: timeLabel
};
