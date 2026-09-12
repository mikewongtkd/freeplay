import {state, notify, update} from './state.js';

const frame = 1 / 30;
function clamp(time) { return Math.max(state.timelineRange.start, Math.min(state.liveEdge, time)); }

export const playbackController = {
  seekTo(time) { state.playbackCursor = clamp(Number(time)); state.isPlaying = false; state.playbackState = Math.abs(state.liveEdge - state.playbackCursor) < .05 ? 'live' : 'paused'; notify('seek'); },
  seekRelative(seconds) { this.seekTo(state.playbackCursor + Number(seconds)); },
  stepFrame(direction) { state.playbackCursor = clamp(state.playbackCursor + frame * Number(direction)); state.isPlaying = false; state.playbackState = 'frame stepping'; notify('frame-step'); },
  playPause() { state.isPlaying = !state.isPlaying; state.playbackState = state.isPlaying ? 'playing' : 'paused'; notify('play-pause'); },
  setRate(rate) { state.playbackRate = Number(rate); state.isPlaying = true; state.playbackState = state.playbackRate < 0 ? 'reverse review' : 'playing'; notify('rate'); },
  goLive() { state.playbackCursor = state.liveEdge; state.isPlaying = true; state.playbackRate = 1; state.playbackState = 'live'; notify('go-live'); },
  tick(deltaSeconds) {
    state.liveEdge += deltaSeconds; state.timelineRange.end = state.liveEdge;
    if (state.playbackState === 'live') state.playbackCursor = state.liveEdge;
    else if (state.isPlaying) {
      state.playbackCursor = clamp(state.playbackCursor + deltaSeconds * state.playbackRate);
      if (state.playbackCursor >= state.liveEdge || state.playbackCursor <= state.timelineRange.start) state.isPlaying = false;
    }
    notify('playback-tick');
  },
  fit() { update({zoom: 1, pan: {x: 0, y: 0}}, 'fit'); },
  zoom(delta) { update({zoom: Math.max(1, Math.min(3, state.zoom + Number(delta)))}, 'zoom'); },
  pan(x, y) { update({pan: {x: Math.max(-50, Math.min(50, state.pan.x + x)), y: Math.max(-50, Math.min(50, state.pan.y + y))}}, 'pan'); }
};
