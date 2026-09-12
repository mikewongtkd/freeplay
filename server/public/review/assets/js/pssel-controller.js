import {state} from './state.js';
import {playbackController} from './playback-controller.js';

export const psselController = {
  events() { return state.psselEvents; },
  goTo(id) { const event = state.psselEvents.find(item => item.id === id); if (event) playbackController.seekTo(event.time); }
};
