const listeners = new Set();

export const state = {
  ring: 1, match: null, round: null, currentView: 'MCV', cameras: [],
  playbackCursor: 0, liveEdge: 0, playbackRate: 1, isPlaying: false,
  currentRequest: null, pendingRequests: [], reviewHistory: [], reviewWindow: null,
  aur: null, rst: null, reviewClockSeconds: 0, reviewStatus: 'monitoring', reviewResult: null,
  psselEvents: [], timelineRange: {start: 0, end: 0}, selectedCamera: 1,
  playbackState: 'live', zoom: 1, pan: {x: 0, y: 0}, scenarios: [], scenario: null,
  syncWarning: null, lastError: null
};

export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function notify(reason = 'state-change') { listeners.forEach(listener => listener(state, reason)); }
export function update(patch, reason) { Object.assign(state, patch); notify(reason); }
export function selectedReview() { return state.reviewHistory.find(review => review.id === state.currentRequest) || null; }
export function replaceReviews(reviews, selectedId = state.currentRequest) {
  state.reviewHistory = reviews;
  state.pendingRequests = reviews.filter(review => review.status === 'pending');
  state.currentRequest = selectedId && reviews.some(review => review.id === selectedId) ? selectedId : reviews.at(-1)?.id || null;
  syncSelectedReview();
}
export function syncSelectedReview() {
  const review = selectedReview();
  state.reviewWindow = review ? {start: review.windowStart, end: review.windowEnd} : null;
  state.aur = review?.aur ?? null; state.rst = review?.rst ?? null; state.reviewResult = review?.result ?? null;
  state.reviewStatus = review?.status || 'monitoring';
}
