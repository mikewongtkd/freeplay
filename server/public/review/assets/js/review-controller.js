import {
  state,
  notify,
  replaceReviews,
  selectedReview,
  activeReview,
  queuedReview,
} from "./state.js";
import { mockServer } from "./mock-server.js";
import { playbackController } from "./playback-controller.js";
import { serverClock } from "./server-clock.js";

function useResponse(response, selectedId) {
  const serverTime = response.data.serverTime;
  if (serverTime?.epochSeconds != null)
    serverClock.anchor(serverTime.epochSeconds, "review-response");
  const displayedId =
    response.data.workflow?.activeReviewId ||
    (selectedId ?? state.currentRequest ?? response.data.workflow?.selectedReviewId);
  replaceReviews(response.data.reviews, displayedId, response.data.workflow);
  if (!activeReview()) state.timelineRange.end = state.liveEdge;
  return response.data.review;
}
async function execute(operation) {
  try {
    state.lastError = null;
    return await operation();
  } catch (error) {
    state.lastError = error.message;
    notify("error");
    throw error;
  }
}

export const reviewController = {
  async createCoachRequest(side, options = {}) {
    return this.createRequest(side, { origin: "coach", ...options });
  },
  async createRequest(side, options = {}) {
    return execute(async () => {
      const previousId = state.currentRequest;
      const preserveActiveContext = !!(previousId || state.activeReviewId);
      const response = await mockServer.createRequest({
        ring: state.ring,
        side,
        origin: options.origin || "coach",
        issueType: options.issueType || "standard",
        reason: options.reason || options.issues?.[0] || "",
        issues: options.issues || [],
        linkedReviewId: options.linkedReviewId || null,
        timestamp: Number(options.timestamp ?? serverClock.now()),
        preserveSelection: preserveActiveContext,
      });
      const review = useResponse(response, previousId);
      if (!preserveActiveContext) {
        state.playbackCursor = review.rm;
        state.playbackState = "paused";
        state.isPlaying = false;
      }
      notify(preserveActiveContext ? "request-queued" : "request-created");
      return review;
    });
  },
  async startReview() {
    const review = queuedReview();
    if (!review || review.status !== "selected") return;
    return execute(async () => {
      const active = useResponse(
        await mockServer.startReview({ ring: state.ring, reviewId: review.id }),
        review.id,
      );
      state.timelineRange.end = active.rst;
      state.isPlaying = false;
      state.playbackState = "paused";
      notify("review-started");
      return active;
    });
  },
  async resolveWithoutReview() {
    const review = selectedReview();
    if (!review) return;
    return execute(async () => {
      const result = useResponse(
        await mockServer.resolveWithoutReview({
          ring: state.ring,
          reviewId: review.id,
        }),
        review.id,
      );
      notify("review-updated");
      return result;
    });
  },
  async deleteRequest() {
    const review = selectedReview();
    if (!review) return false;
    return execute(async () => {
      useResponse(
        await mockServer.deleteRequest({
          ring: state.ring,
          reviewId: review.id,
        }),
        null,
      );
      notify("review-updated");
      return true;
    });
  },
  async markAUR(time = state.playbackCursor) {
    const review = activeReview() || selectedReview();
    if (!review || !["active", "completed"].includes(review.status)) return;
    return execute(async () => {
      const result = useResponse(
        await mockServer.markAur({
          ring: state.ring,
          reviewId: review.id,
          time: Number(time),
        }),
        review.id,
      );
      notify("review-updated");
      return result;
    });
  },
  async setResult(result) {
    const review = activeReview();
    if (!review?.rst) return;
    return execute(async () => {
      const updated = useResponse(
        await mockServer.setResult({
          ring: state.ring,
          reviewId: review.id,
          result,
        }),
        review.id,
      );
      playbackController.goLive();
      notify("review-updated");
      return updated;
    });
  },
  async annotate(annotation) {
    const review = selectedReview();
    if (!review) return;
    return execute(async () => {
      const updated = useResponse(
        await mockServer.annotate({
          ring: state.ring,
          reviewId: review.id,
          annotation,
        }),
        review.id,
      );
      notify("review-updated");
      return updated;
    });
  },
  async deselect() {
    if (state.activeReviewId) return false;
    return execute(async () => {
      const response = await mockServer.review("deselect", { ring: state.ring });
      replaceReviews(response.data.reviews, null, response.data.workflow);
      state.currentRequest = null;
      syncDisplayedReview();
      state.timelineRange.end = state.liveEdge;
      notify("review-selected");
      return true;
    });
  },
  async selectReview(id, moveCursor = true) {
    const target = state.reviewHistory.find((review) => review.id === id);
    if (!target || (state.activeReviewId && state.activeReviewId !== id))
      return false;
    if (["pending", "selected"].includes(target.status))
      await execute(async () =>
        useResponse(
          await mockServer.selectReview({ ring: state.ring, reviewId: id }),
          id,
        ),
      );
    else {
      state.currentRequest = id;
      syncDisplayedReview();
    }
    const review = selectedReview();
    if (!activeReview()) state.timelineRange.end = state.liveEdge;
    if (moveCursor) playbackController.seekTo(review.rm, false);
    notify("review-selected");
    return true;
  },
  previous() {
    if (!state.currentRequest) {
      const target = state.reviewHistory
        .filter((review) => review.rm < state.playbackCursor)
        .sort((a, b) => b.rm - a.rm)[0];
      if (target) return this.selectReview(target.id);
      return;
    }
    if (state.activeReviewId) return;
    const pending = state.pendingRequests;
    const i = pending.findIndex((review) => review.id === state.currentRequest);
    if (i > 0) this.selectReview(pending[i - 1].id);
  },
  next() {
    if (!state.currentRequest) {
      const target = state.reviewHistory
        .filter((review) => review.rm > state.playbackCursor)
        .sort((a, b) => a.rm - b.rm)[0];
      if (target) return this.selectReview(target.id);
      return;
    }
    if (state.activeReviewId) return;
    const pending = state.pendingRequests;
    const i = pending.findIndex((review) => review.id === state.currentRequest);
    if (i >= 0 && i < pending.length - 1) this.selectReview(pending[i + 1].id);
  },
  jumpAur() {
    const review = selectedReview();
    if (review?.aur != null) playbackController.seekTo(review.aur);
  },
};

function syncDisplayedReview() {
  const review = selectedReview();
  state.aur = review?.aur ?? null;
  state.rst = review?.rst ?? null;
  state.reviewStatus = review?.status || "monitoring";
  state.reviewResult = review?.result ?? null;
}
