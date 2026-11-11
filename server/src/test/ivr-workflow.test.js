'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load the browser modules unchanged, using data URLs for their relative imports.
const moduleUrls = new Map();
function moduleUrl(name) {
  const file = path.resolve(__dirname, '../../public/review/assets/js', name);
  if (moduleUrls.has(file)) return moduleUrls.get(file);
  const source = fs.readFileSync(file, 'utf8').replace(/from "(\.\/[^"\n]+)"/g,
    (_, relative) => `from "${moduleUrl(relative)}"`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  moduleUrls.set(file, url);
  return url;
}

test('request selection, queuing, RM limits, formal timing and completion', async () => {
  const { state, replaceReviews, selectedReview } = await import(moduleUrl('state.js'));
  const { playbackController: playback } = await import(moduleUrl('playback-controller.js'));
  const { reviewController: review } = await import(moduleUrl('review-controller.js'));
  const { mockServer: api } = await import(moduleUrl('mock-server.js'));
  let records = [];
  const response = item => ({ data: { reviews: structuredClone(records), review: structuredClone(item),
    workflow: { selectedReviewId: records.find(r => r.status === 'selected')?.id ?? null,
      activeReviewId: records.find(r => r.status === 'active')?.id ?? null } } });
  api.createRequest = async body => {
    const item = { id: String(records.length + 1), rm: body.timestamp, side: body.side,
      status: body.preserveSelection ? 'pending' : 'selected', aur: null };
    records.push(item);
    return response(item);
  };
  api.startReview = async ({ reviewId }) => {
    const item = records.find(r => r.id === reviewId);
    Object.assign(item, { status: 'active', rst: 150 });
    return response(item);
  };
  api.setResult = async ({ reviewId, result }) => {
    const item = records.find(r => r.id === reviewId);
    Object.assign(item, { status: 'completed', result });
    return response(item);
  };
  api.review = async action => {
    assert.equal(action, 'deselect');
    records.forEach(r => { if (r.status === 'selected') r.status = 'pending'; });
    return response();
  };
  Object.assign(state, { timelineRange: { start: 50, end: 140 }, liveEdge: 140,
    currentRequest: null, activeReviewId: null, selectedReviewId: null });
  replaceReviews([], null);
  await review.createRequest('chung', { timestamp: 120 });
  assert.equal(selectedReview().id, '1');
  assert.equal(state.playbackCursor, 120);
  playback.seekTo(110);
  await review.createRequest('hong', { timestamp: 130 });
  assert.equal(selectedReview().id, '1');
  assert.equal(state.playbackCursor, 110);
  assert.equal(state.reviewHistory[1].status, 'pending');
  playback.seekTo(135);
  assert.equal(state.playbackCursor, 120);
  playback.seekTo(119.9);
  playback.playPause();
  playback.advance(1);
  assert.equal(state.playbackCursor, 120);
  assert.equal(state.isPlaying, false);
  await review.startReview();
  assert.equal(state.timelineRange.end, 150);
  playback.syncServerTime(170);
  assert.equal(state.timelineRange.end, 150);
  assert.equal(state.liveEdge, 170);
  assert.equal(await review.selectReview('2'), false);
  assert.equal(await review.deselect(), false);
  playback.goLive();
  assert.equal(state.playbackCursor, 120);
  assert.equal(state.currentRequest, '1');
  await review.setResult('accepted');
  assert.equal(state.currentRequest, null);
  assert.equal(state.activeReviewId, null);
  assert.equal(state.playbackState, 'live');
  assert.equal(state.playbackCursor, 170);
  await review.selectReview('1');
  assert.equal(state.playbackCursor, 120);
  await review.createRequest('hong', { timestamp: 175 });
  assert.equal(selectedReview().id, '1');
  assert.equal(state.reviewHistory[2].status, 'pending');
  await review.deselect();
  assert.equal(selectedReview(), null);
  playback.seekTo(160);
  assert.equal(state.playbackCursor, 160);
});

test('timeline uses RM markers and a side-specific connector without windows', async () => {
  const { state } = await import(moduleUrl('state.js'));
  const elements = new Map();
  global.window = { jQuery: selector => ({
    html: value => elements.set(selector, value),
    append: value => elements.set(selector, (elements.get(selector) || '') + value),
  }) };
  global.document = { querySelectorAll: () => [] };
  const { timelineController } = await import(moduleUrl('timeline-controller.js'));
  Object.assign(state, { timelineRange: { start: 50, end: 150 }, currentRequest: '1',
    activeReviewId: null, provisionalRequest: null,
    reviewHistory: [{ id: '1', side: 'hong', rm: 120, aur: 110, status: 'completed' }] });
  timelineController.renderAnnotations();
  const html = elements.get('#timelineAnnotations');
  assert.match(html, /request-mark hong.*selected/);
  assert.match(html, /aur-connector hong" data-start="110" data-end="120"/);
  assert.doesNotMatch(html, /review-window/);
  state.provisionalRequest = { side: 'chung', rm: 140 };
  timelineController.renderAnnotations();
  assert.match(elements.get('#timelineAnnotations'), /provisional" data-time="140"/);
  state.currentRequest = null;
  state.provisionalRequest = null;
  timelineController.renderAnnotations();
  assert.doesNotMatch(elements.get('#timelineAnnotations'), /aur-connector|provisional/);
});

test('queue filters match and round and includes finalized requests', async () => {
  const { state, matchReviews } = await import(moduleUrl('state.js'));
  Object.assign(state, { match: { number: '101', round: 2 }, timelineRange: { start: 100, end: 200 },
    reviewHistory: [
      { id: 'completed', matchNumber: '101', round: 2, status: 'completed', rm: 130 },
      { id: 'pending', matchNumber: '101', round: 2, status: 'pending', rm: 120 },
      { id: 'other-round', matchNumber: '101', round: 1, status: 'completed', rm: 150 },
      { id: 'other-match', matchNumber: '102', round: 2, status: 'pending', rm: 160 },
    ] });
  assert.deepEqual(matchReviews().map(r => r.id), ['pending', 'completed']);
  const { reviewController: review } = await import(moduleUrl('review-controller.js'));
  await review.selectReview('completed');
  assert.equal(state.currentRequest, 'completed');
  assert.equal(state.playbackCursor, 130);
});

test('Unselect clears active display selection while retaining formal review and RM limit', async () => {
  const { state, selectedReview } = await import(moduleUrl('state.js'));
  const { reviewController: review } = await import(moduleUrl('review-controller.js'));
  const { playbackController: playback } = await import(moduleUrl('playback-controller.js'));
  Object.assign(state, { currentRequest: 'active', activeReviewId: 'active',
    timelineRange: { start: 50, end: 150 }, playbackCursor: 110,
    reviewHistory: [{ id: 'active', rm: 120, rst: 150, status: 'active' }] });
  assert.equal(await review.deselect(true), true);
  assert.equal(selectedReview(), null);
  assert.equal(state.activeReviewId, 'active');
  assert.equal(state.timelineRange.end, 150);
  playback.seekTo(140);
  assert.equal(state.playbackCursor, 120);
  assert.equal(await review.selectReview('other'), false);
});


test('review names omit the internal suffix and preserve the sequence', async () => {
  const { reviewName } = await import(moduleUrl('state.js'));
  assert.equal(reviewName({ id: 'R001-123456' }), 'R001');
  assert.equal(reviewName({ id: 'R012-654321' }), 'R012');
  assert.equal(reviewName({ id: 'R1000-654321' }), 'R1000');
});

test('request reasons depend on origin and type and retain conditional details', async () => {
  const { reasonOptions, requestReason, opponentGamJeomReasons } = await import(moduleUrl('request-reasons.js'));
  assert.deepEqual(reasonOptions('coach', 'standard'), [
    'Reason pending', 'Technical points', 'Punch misidentification', 'Head Kick (no head PSS)',
    'Invalidation of gam-jeom and points reinstated',
    'Restoring points scored before a gam-jeom', 'gam-jeom given to the wrong player',
    'Gam-jeom for the opponent', "Invalidation of opponent's technical points",
    "Invalidation of opponent's points following a gam-jeom", 'Other',
  ]);
  assert.deepEqual(reasonOptions('referee', 'standard'), [
    'Head kick after count', 'Pretending injury', 'Judge request technical',
    'Last action in the last 5 seconds',
  ]);
  for (const origin of ['coach', 'referee']) {
    assert.deepEqual(reasonOptions(origin, 'technical'), [
      'Reason pending', 'PSS test', 'Phantom points', 'Time', 'Scoreboard entry',
    ]);
    assert.throws(() => requestReason({ origin, issueType: 'technical', reason: 'Other', reasonOther: 'Details' }));
  }
  const base = { origin: 'coach', issueType: 'standard' };
  assert.equal(requestReason({ ...base, reason: 'Other', reasonOther: '  Video unavailable  ' }), 'Other: Video unavailable');
  assert.throws(() => requestReason({ ...base, reason: 'Other', reasonOther: '   ' }));
  for (const gamJeomReason of opponentGamJeomReasons) {
    assert.equal(requestReason({ ...base, reason: 'Gam-jeom for the opponent', gamJeomReason }), `Gam-jeom for the opponent: ${gamJeomReason}`);
  }
  assert.throws(() => requestReason({ ...base, reason: 'Gam-jeom for the opponent' }));
  assert.equal(requestReason({ ...base, reason: 'Reason pending', reasonOther: 'Ignored', gamJeomReason: 'Ignored' }), 'Reason pending');
});

test('annotation reasons share request options and preserve saved details and legacy reasons', async () => {
  const { annotationReason, parseReason, reasonOptions } = await import(moduleUrl('request-reasons.js'));
  const coach = { origin: 'coach', issueType: 'standard', reason: 'Reason pending' };
  assert.ok(reasonOptions('coach', 'standard').includes('Head Kick (no head PSS)'));
  assert.equal(annotationReason(coach, { reason: 'Head Kick (no head PSS)' }), 'Head Kick (no head PSS)');
  for (const saved of ['Other: Camera obstruction', 'Gam-jeom for the opponent: Falling down']) {
    const parsed = parseReason(saved);
    assert.equal(annotationReason(coach, {
      reason: parsed.reason, reasonOther: parsed.detail, gamJeomReason: parsed.detail,
    }), saved);
  }
  assert.throws(() => annotationReason(coach, { reason: 'Other', reasonOther: ' ' }));
  assert.throws(() => annotationReason({ origin: 'referee', issueType: 'technical' }, { reason: 'Other', reasonOther: 'Details' }));
  const legacy = { origin: 'coach', issueType: 'standard', annotation: { reason: 'Other / official correction' } };
  assert.equal(annotationReason(legacy, { reason: 'Other / official correction' }), 'Other / official correction');
  assert.equal(annotationReason(legacy, { reason: 'Technical points' }), 'Technical points');
});
