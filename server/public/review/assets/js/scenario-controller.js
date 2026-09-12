import {state, notify, replaceReviews} from './state.js';
import {mockServer} from './mock-server.js';
import {reviewController} from './review-controller.js';
import {cameraController} from './camera-controller.js';
import {playbackController} from './playback-controller.js';

async function clean() { const response = await mockServer.reset(); replaceReviews(response.data.reviews); cameraController.setAllAvailable(true); state.cameras.forEach(camera => camera.gaps = []); state.currentView = 'MCV'; state.selectedCamera = 1; state.scenario = null; playbackController.goLive(); }

export const scenarioController = {
  async load(id) {
    await clean(); state.scenario = id;
    switch (id) {
      case 'A': { const r = await reviewController.createCoachRequest('hong', {issues: ['Technical Points']}); await reviewController.startReview(); playbackController.seekTo(r.rm - 2.1); await reviewController.markAUR(); cameraController.showCamera(2); playbackController.stepFrame(1); await reviewController.setResult('accepted'); break; }
      case 'B': { await reviewController.createCoachRequest('chung', {issues: ['Issue corrected before formal review']}); await reviewController.resolveWithoutReview(); break; }
      case 'C': { const r = await reviewController.createCoachRequest('hong', {issues: ['Action outside five-second window']}); await reviewController.startReview(); playbackController.seekTo(r.rm - 6.2); await reviewController.markAUR(); await reviewController.setResult('rejected'); break; }
      case 'D': { const now = state.liveEdge; state.cameras.find(c => c.id === 2).gaps = [{start: now - 12, end: now - 6}]; cameraController.setAvailability(2, false, 'gap / recovering'); const r = await reviewController.createCoachRequest('chung', {issues: ['Crossing the Boundary Line']}); await reviewController.startReview(); playbackController.seekTo(r.rm - 2); await reviewController.markAUR(); await reviewController.setResult('accepted'); break; }
      case 'E': { cameraController.setAllAvailable(false); await reviewController.createCoachRequest('hong', {issues: ['Recording/system availability']}); await reviewController.startReview(); await reviewController.setResult('ivr_issue'); break; }
      case 'F': { const r = await reviewController.createRequest('official', {issues: ['Last-five-seconds prohibited act']}); await reviewController.startReview(); playbackController.seekTo(r.rm - 2); await reviewController.markAUR(); await reviewController.setResult('accepted'); break; }
      case 'G': { const first = await reviewController.createCoachRequest('hong', {issues: ['Crossing the Boundary Line']}); await reviewController.startReview(); playbackController.seekTo(first.rm - 1.4); await reviewController.markAUR(); await reviewController.setResult('accepted'); playbackController.goLive(); const second = await reviewController.createCoachRequest('chung', {issues: ['Gam-jeom given to the wrong player'], linkedReviewId: first.id}); await reviewController.startReview(); playbackController.seekTo(second.rm - 1.7); await reviewController.markAUR(); await reviewController.setResult('accepted'); break; }
      case 'H': { const r = await reviewController.createCoachRequest('chung', {issues: ['Remove Gam-jeom', 'Gam-jeom for opponent: Falling Down']}); await reviewController.startReview(); playbackController.seekTo(r.rm - 3.4); await reviewController.markAUR(); await reviewController.setResult('accepted'); break; }
      case 'I': playbackController.seekTo(state.psselEvents.find(event => event.type === 'score')?.time || state.liveEdge); break;
    }
    notify('scenario-loaded');
  },
  reset: clean
};
