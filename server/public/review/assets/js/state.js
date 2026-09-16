const listeners = new Set();

export const state = {
  ring: 1, match: null, round: null, currentView: 'MCV', cameras: [],
  playbackCursor: 0, liveEdge: 0, playbackRate: 1, isPlaying: false,
  currentRequest: null, selectedReviewId: null, activeReviewId: null, pendingRequests: [], reviewHistory: [], reviewWindow: null,
  aur: null, rst: null, reviewClockSeconds: 0, reviewStatus: 'monitoring', reviewResult: null,
  psselEvents: [], timelineRange: {start: 0, end: 0}, timelineStartSource: 'page opened', selectedCamera: 1,
  playbackState: 'live', zoom: 1, pan: {x: 0, y: 0}, scenarios: [], scenario: null,
  syncWarning: null, lastError: null
};

export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function notify(reason = 'state-change') { listeners.forEach(listener => listener(state, reason)); }
export function update(patch, reason) {
  const changed = Object.entries(patch).some(([key, value]) => state[key] !== value);
  if (!changed) return false;
  Object.assign(state, patch); notify(reason); return true;
}
export function selectedReview() { return state.reviewHistory.find(review => review.id === state.currentRequest) || null; }
export function activeReview() { return state.reviewHistory.find(review => review.id === state.activeReviewId) || null; }
export function queuedReview() { return state.reviewHistory.find(review => review.id === state.selectedReviewId) || null; }
export function replaceReviews(reviews, displayedId = state.currentRequest, workflow = {}) {
  state.reviewHistory = reviews;
  state.pendingRequests = reviews.filter(review => ['pending', 'selected'].includes(review.status));
  state.selectedReviewId = workflow.selectedReviewId ?? reviews.find(review => review.status === 'selected')?.id ?? null;
  state.activeReviewId = workflow.activeReviewId ?? reviews.find(review => review.status === 'active')?.id ?? null;
  const preferred = displayedId || state.activeReviewId || state.selectedReviewId;
  state.currentRequest = preferred && reviews.some(review => review.id === preferred) ? preferred : state.activeReviewId || state.selectedReviewId || reviews.at(-1)?.id || null;
  syncSelectedReview();
}
export function syncSelectedReview() {
  const review = selectedReview();
  state.reviewWindow = review ? {start: review.windowStart, end: review.windowEnd} : null;
  state.aur = review?.aur ?? null; state.rst = review?.rst ?? null; state.reviewResult = review?.result ?? null;
  state.reviewStatus = review?.status || 'monitoring';
}
