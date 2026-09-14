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
