import {reviewController} from './review-controller.js';
import {cameraController} from './camera-controller.js';
import {playbackController} from './playback-controller.js';
import {state} from './state.js';

const commands = {
  'Space': () => playbackController.playPause(), 'ArrowLeft': () => playbackController.stepFrame(-1), 'ArrowRight': () => playbackController.stepFrame(1),
  '1': () => cameraController.showCamera(1), '2': () => cameraController.showCamera(2), '3': () => cameraController.showCamera(3),
  'm': () => cameraController.showMCV(), 'a': () => reviewController.markAUR(), 'l': () => playbackController.goLive(),
  'c': () => reviewController.createCoachRequest('chung'), 'h': () => reviewController.createCoachRequest('hong'), 's': () => reviewController.startReview(),
  'w': () => reviewController.jumpWindow(), 'r': () => reviewController.jumpAur()
};

export function installKeyboard() {
  document.addEventListener('keydown', event => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
    if (state.currentView !== 'MCV' && event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const movement = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10]}[event.key]; playbackController.pan(...movement); return; }
    if (state.currentView !== 'MCV' && ['+', '='].includes(event.key)) { event.preventDefault(); playbackController.zoom(.25); return; }
    if (state.currentView !== 'MCV' && ['-', '_'].includes(event.key)) { event.preventDefault(); playbackController.zoom(-.25); return; }
    if (event.key === 'ArrowLeft' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); playbackController.seekRelative(-5); return; }
    if (event.key === 'ArrowLeft' && event.shiftKey) { event.preventDefault(); playbackController.seekRelative(-1); return; }
    const command = commands[event.key] || commands[event.key.toLowerCase?.()];
    if (!command) return; event.preventDefault(); command();
  });
}
