import { state, notify } from "./state.js";

export const roundController = {
  started(start) {
    state.roundPhase = "running";
    state.round = Number(state.match.round);
    state.timelineFixedEnd = false;
    state.liveEdge = start;
    state.timelineRange.start = start;
    state.timelineRange.end = start;
    state.timelineStartSource = "round start";
    state.playbackCursor = start;
    state.isPlaying = false;
    state.playbackState = "paused";
    notify("seek");
  },
  stop(now) {
    if (state.roundPhase === "stopped" || state.roundPhase === "finished")
      return state.roundPhase !== "finished";
    state.timelineRange.end = Math.max(state.timelineRange.start, now);
    state.liveEdge = state.timelineRange.end;
    state.timelineFixedEnd = true;
    state.isPlaying = false;
    state.playbackState = "paused";
    state.roundPhase = Number(state.match.round) >= 3 ? "finished" : "stopped";
    notify("play-pause");
    return state.roundPhase !== "finished";
  },
  advance() {
    if (state.roundPhase !== "stopped" || Number(state.match.round) >= 3) return;
    state.round = Number(state.match.round) + 1;
    state.match.round = state.round;
    state.roundPhase = "ready";
  },
};
