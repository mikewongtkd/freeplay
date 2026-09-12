import {state, notify, replaceReviews, selectedReview} from './state.js';
import {mockServer} from './mock-server.js';
import {playbackController} from './playback-controller.js';

function useResponse(response, selectedId) { replaceReviews(response.data.reviews, selectedId || response.data.review?.id); notify('review-response'); return response.data.review; }
async function execute(operation) { try { state.lastError = null; return await operation(); } catch (error) { state.lastError = error.message; notify('error'); throw error; } }

export const reviewController = {
  async createCoachRequest(side, options = {}) { return this.createRequest(side, options); },
  async createRequest(origin, options = {}) { return execute(async () => { const response = await mockServer.createRequest({ring: state.ring, origin, issues: options.issues || [], linkedReviewId: options.linkedReviewId || null}); const review = useResponse(response); state.playbackCursor = review.rm; state.playbackState = 'paused'; notify('request-created'); return review; }); },
  async startReview() { const review = selectedReview(); if (!review || review.status !== 'pending') return; return execute(async () => { const response = await mockServer.startReview({reviewId: review.id}); const active = useResponse(response, review.id); playbackController.seekTo(active.windowStart); notify('review-started'); return active; }); },
  async resolveWithoutReview() { const review = selectedReview(); if (!review) return; return execute(async () => useResponse(await mockServer.resolveWithoutReview({reviewId: review.id}), review.id)); },
  async markAUR() { const review = selectedReview(); if (!review || !['active', 'completed'].includes(review.status)) return; return execute(async () => useResponse(await mockServer.markAur({reviewId: review.id, time: state.playbackCursor}), review.id)); },
  async setResult(result) { const review = selectedReview(); if (!review?.rst || review.status !== 'active') return; return execute(async () => useResponse(await mockServer.setResult({reviewId: review.id, result}), review.id)); },
  async annotate(annotation) { const review = selectedReview(); if (!review) return; return execute(async () => useResponse(await mockServer.annotate({reviewId: review.id, annotation}), review.id)); },
  selectReview(id, moveCursor = true) { if (!state.reviewHistory.some(review => review.id === id)) return; state.currentRequest = id; const review = selectedReview(); state.reviewWindow = {start: review.windowStart, end: review.windowEnd}; state.aur = review.aur; state.rst = review.rst; state.reviewStatus = review.status; state.reviewResult = review.result; if (moveCursor) playbackController.seekTo(review.windowStart); notify('review-selected'); },
  previous() { const i = state.reviewHistory.findIndex(review => review.id === state.currentRequest); if (i > 0) this.selectReview(state.reviewHistory[i - 1].id); },
  next() { const i = state.reviewHistory.findIndex(review => review.id === state.currentRequest); if (i >= 0 && i < state.reviewHistory.length - 1) this.selectReview(state.reviewHistory[i + 1].id); },
  jumpWindow() { const review = selectedReview(); if (review) playbackController.seekTo(review.windowStart); },
  jumpAur() { const review = selectedReview(); if (review?.aur != null) playbackController.seekTo(review.aur); }
};
