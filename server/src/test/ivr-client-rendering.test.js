'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicRoot = path.resolve(__dirname, '../../public/review');
const read = relative => fs.readFileSync(path.join(publicRoot, relative), 'utf8');

test('clock pulse does not broadcast or invoke a full renderer', () => {
  const app = read('assets/js/app.js');
  assert.doesNotMatch(app, /function\s+renderAll|subscribe\(renderAll\)/);
  const pulse = app.match(/function clockPulse\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(pulse, /notify\(|\.html\(|replaceChildren|\.append\(/);
  assert.match(pulse, /syncServerTime/);
});

test('review panel is moved only when its view destination changes', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /if \(panel\.parentElement !== destination\) destination\.append\(panel\)/);
});

test('timeline separates structural rendering from dynamic positioning', () => {
  const timeline = read('assets/js/timeline-controller.js');
  assert.match(timeline, /renderTracks\(\)/);
  assert.match(timeline, /renderAnnotations\(\)/);
  assert.match(timeline, /renderPsselEvents\(\)/);
  const dynamic = timeline.match(/updateDynamic\(\)\s*\{([\s\S]*?)\n  \},\n  positionFromEvent/)?.[1] || '';
  assert.doesNotMatch(dynamic, /\.html\(|replaceChildren|\.append\(/);
});

test('FR-053 clock uses a monotonic client delta from a server anchor', () => {
  const clock = read('assets/js/server-clock.js');
  assert.match(clock, /performance\.now\(\)/);
  assert.match(clock, /serverAnchorSeconds \+ \(performance\.now\(\) - localAnchorMs\) \/ 1000/);
  const notifications = read('assets/js/notification-controller.js');
  assert.match(notifications, /camera-start-recording/);
  assert.match(notifications, /camera-stop-recording/);
  assert.match(notifications, /pssel-event/);
});

test('review workflow keeps displayed, selected, and active identities separate', () => {
  const state = read('assets/js/state.js');
  assert.match(state, /currentRequest: null, selectedReviewId: null, activeReviewId: null/);
  assert.match(state, /review\.status === 'selected'/);
  assert.match(state, /review\.status === 'active'/);
});

test('active review alone freezes the timeline and completion returns to live', () => {
  const review = read('assets/js/review-controller.js');
  const playback = read('assets/js/playback-controller.js');
  assert.match(review, /state\.timelineRange\.end = activeReview\(\)\?\.rst \|\| state\.liveEdge/);
  assert.match(review, /playbackController\.goLive\(\)/);
  assert.match(playback, /if \(!activeReview\(\)\?\.rst\) state\.timelineRange\.end = state\.liveEdge/);
});

test('pending review selection is locked while another review is active', () => {
  const controller = read('assets/js/review-controller.js');
  const app = read('assets/js/app.js');
  assert.match(controller, /state\.activeReviewId && state\.activeReviewId !== id/);
  assert.match(app, /data-action="select-review"/);
  assert.match(app, /const locked = !!state\.activeReviewId/);
});
