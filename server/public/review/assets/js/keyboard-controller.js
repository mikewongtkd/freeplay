import { reviewController } from "./review-controller.js";
import { cameraController } from "./camera-controller.js";
import { playbackController } from "./playback-controller.js";
import { state } from "./state.js";

const commands = {
  " ": /* Space */ () => playbackController.playPause(),
  ArrowLeft: () => playbackController.stepFrame(-1),
  ArrowRight: () => playbackController.stepFrame(1),
  1: () => cameraController.showCamera(1),
  2: () => cameraController.showCamera(2),
  3: () => cameraController.showCamera(3),
  m: () => cameraController.showMCV(),
  a: () => document.querySelector('[data-action="mark-aur"]')?.click(),
  b: () => reviewController.jumpAur(),
  l: () => document.querySelector('[data-action="go-live"]')?.click(),
  c: () =>
    document
      .querySelector('[data-action="create-request"][data-side="chung"]')
      ?.click(),
  f: () => {
    let element = document.querySelector(".scv-video");
    if( document.fullscreenElement === element) {
      document.exitFullscreen();
      return;
    } else {
      element?.requestFullscreen?.();
    }
  },
  h: () =>
    document
      .querySelector('[data-action="create-request"][data-side="hong"]')
      ?.click(),
  s: () => reviewController.startReview(),
};

export function installKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (document.querySelector(".modal.show")) return;
    if (event.isComposing) return;
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) ||
      event.target.isContentEditable
    )
      return;
    if (event.key.toLowerCase() === "t") {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || state.currentView !== "MCV") return;
      event.preventDefault(); document.getElementById("toggleThumbnailPreview")?.click(); return;
    }
    if (
      state.currentView !== "MCV" &&
      event.altKey &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const movement = {
        ArrowLeft: [-10, 0],
        ArrowRight: [10, 0],
        ArrowUp: [0, -10],
        ArrowDown: [0, 10],
      }[event.key];
      playbackController.pan(...movement);
      return;
    }
    if (state.currentView !== "MCV" && ["+", "="].includes(event.key)) {
      event.preventDefault();
      playbackController.zoom(0.25);
      return;
    }
    if (state.currentView !== "MCV" && ["-", "_"].includes(event.key)) {
      event.preventDefault();
      playbackController.zoom(-0.25);
      return;
    }
    if (event.key === "ArrowLeft" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      playbackController.seekRelative(-5);
      return;
    }
    if (event.key === "ArrowLeft" && event.shiftKey) {
      event.preventDefault();
      playbackController.seekRelative(-1);
      return;
    }
    const command = commands[event.key] || commands[event.key.toLowerCase?.()];
    if (!command) return;
    event.preventDefault();
    command();
  });
}
