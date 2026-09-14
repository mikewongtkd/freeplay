import {state, notify, update} from './state.js';

const frame = 1 / 30;
function selectedReview() { return state.reviewHistory.find(review => review.id === state.currentRequest); }
function clamp(time) { return Math.max(state.timelineRange.start, Math.min(state.timelineRange.end, time)); }

export const playbackController = {
  seekTo(time, emit = true) {
    state.playbackCursor = clamp(Number(time)); state.isPlaying = false;
    state.playbackState = Math.abs(state.liveEdge - state.playbackCursor) < .05 ? 'live' : 'paused';
    if (emit) notify('seek');
  },
  seekRelative(seconds) { this.seekTo(state.playbackCursor + Number(seconds)); },
  stepFrame(direction) {
    state.playbackCursor = clamp(state.playbackCursor + frame * Number(direction));
    state.isPlaying = false; state.playbackState = 'frame stepping'; notify('frame-step');
  },
  playPause() {
    state.isPlaying = !state.isPlaying; state.playbackState = state.isPlaying ? 'playing' : 'paused'; notify('play-pause');
  },
  setRate(rate) {
    state.playbackRate = Number(rate); state.isPlaying = true;
    state.playbackState = state.playbackRate < 0 ? 'reverse review' : 'playing'; notify('rate');
  },
  goLive() {
    state.playbackCursor = state.liveEdge; state.isPlaying = false; state.playbackRate = 1; state.playbackState = 'live'; notify('go-live');
  },
  syncServerTime(serverSeconds) {
    state.liveEdge = Number(serverSeconds);
    if (!selectedReview()?.rst) state.timelineRange.end = state.liveEdge;
    if (state.playbackState === 'live') state.playbackCursor = state.liveEdge;
  },
  advance(deltaSeconds) {
    if (!state.isPlaying || state.playbackState === 'live') return false;
    const next = clamp(state.playbackCursor + deltaSeconds * state.playbackRate);
    state.playbackCursor = next;
    if (next >= state.timelineRange.end || next <= state.timelineRange.start) {
      state.isPlaying = false; state.playbackState = 'paused';
    }
    return true;
  },
  fit() { update({zoom: 1, pan: {x: 0, y: 0}}, 'fit'); },
  zoom(delta) { update({zoom: Math.max(1, Math.min(3, state.zoom + Number(delta)))}, 'zoom'); },
  pan(x, y) { update({pan: {x: Math.max(-50, Math.min(50, state.pan.x + x)), y: Math.max(-50, Math.min(50, state.pan.y + y))}}, 'pan'); }
};
