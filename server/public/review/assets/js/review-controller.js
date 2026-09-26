import {state, notify, replaceReviews, selectedReview, activeReview, queuedReview} from './state.js';
import {mockServer} from './mock-server.js';
import {playbackController} from './playback-controller.js';
import {serverClock} from './server-clock.js';

function useResponse(response, selectedId) {
  const serverTime = response.data.serverTime;
  if (serverTime?.epochSeconds != null) serverClock.anchor(serverTime.epochSeconds, 'review-response');
  const displayedId = response.data.workflow?.activeReviewId || selectedId || response.data.review?.id;
  replaceReviews(response.data.reviews, displayedId, response.data.workflow);
  state.timelineRange.end = activeReview()?.rst || state.liveEdge;
  return response.data.review;
}
async function execute(operation) { try { state.lastError = null; return await operation(); } catch (error) { state.lastError = error.message; notify('error'); throw error; } }

export const reviewController = {
  async createCoachRequest(side, options = {}) { return this.createRequest(side, {origin: 'coach', ...options}); },
  async createRequest(side, options = {}) {
    return execute(async () => {
      const preserveActiveContext = !!state.activeReviewId;
      const response = await mockServer.createRequest({ring: state.ring, side, origin: options.origin || 'coach', issueType: options.issueType || 'standard', reason: options.reason || options.issues?.[0] || '', issues: options.issues || [], linkedReviewId: options.linkedReviewId || null});
      const review = useResponse(response); if (!preserveActiveContext) { state.playbackCursor = review.rm; state.playbackState = 'paused'; state.isPlaying = false; } notify('request-created'); return review;
    });
  },
  async startReview() {
    const review = queuedReview(); if (!review || review.status !== 'selected') return;
    return execute(async () => { const active = useResponse(await mockServer.startReview({ring: state.ring, reviewId: review.id}), review.id); playbackController.seekTo(active.windowStart, false); notify('review-started'); return active; });
  },
  async resolveWithoutReview() { const review = selectedReview(); if (!review) return; return execute(async () => { const result = useResponse(await mockServer.resolveWithoutReview({ring: state.ring, reviewId: review.id}), review.id); notify('review-updated'); return result; }); },
  async markAUR(time = state.playbackCursor) { const review = activeReview() || selectedReview(); if (!review || !['active', 'completed'].includes(review.status)) return; return execute(async () => { const result = useResponse(await mockServer.markAur({ring: state.ring, reviewId: review.id, time:Number(time)}), review.id); notify('review-updated'); return result; }); },
  async setResult(result) { const review = activeReview(); if (!review?.rst) return; return execute(async () => { const updated = useResponse(await mockServer.setResult({ring: state.ring, reviewId: review.id, result}), review.id); playbackController.goLive(); notify('review-updated'); return updated; }); },
  async annotate(annotation) { const review = selectedReview(); if (!review) return; return execute(async () => { const updated = useResponse(await mockServer.annotate({ring: state.ring, reviewId: review.id, annotation}), review.id); notify('review-updated'); return updated; }); },
  async selectReview(id, moveCursor = true) {
    const target = state.reviewHistory.find(review => review.id === id); if (!target || (state.activeReviewId && state.activeReviewId !== id)) return false;
    if (['pending', 'selected'].includes(target.status)) await execute(async () => useResponse(await mockServer.selectReview({ring: state.ring, reviewId: id}), id));
    else { state.currentRequest = id; syncDisplayedReview(); }
    const review = selectedReview(); state.timelineRange.end = activeReview()?.rst || state.liveEdge;
    if (moveCursor) playbackController.seekTo(review.windowStart, false); notify('review-selected'); return true;
  },
  previous() { if (state.activeReviewId) return; const pending = state.pendingRequests; const i = pending.findIndex(review => review.id === state.currentRequest); if (i > 0) this.selectReview(pending[i - 1].id); },
  next() { if (state.activeReviewId) return; const pending = state.pendingRequests; const i = pending.findIndex(review => review.id === state.currentRequest); if (i >= 0 && i < pending.length - 1) this.selectReview(pending[i + 1].id); },
  jumpWindow() { const review = selectedReview(); if (review) playbackController.seekTo(review.windowStart); },
  jumpAur() { const review = selectedReview(); if (review?.aur != null) playbackController.seekTo(review.aur); }
};

function syncDisplayedReview() {
  const review = selectedReview();
  state.reviewWindow = review ? {start: review.windowStart, end: review.windowEnd} : null; state.aur = review?.aur ?? null; state.rst = review?.rst ?? null;
  state.reviewStatus = review?.status || 'monitoring'; state.reviewResult = review?.result ?? null;
}
