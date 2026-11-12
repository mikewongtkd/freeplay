# MCV Timeline Thumbnail Preview

## Operator behavior

In Multi-Camera View, press **T** or click **Thumbnails (T)** to swap the three review-control columns for a three-camera thumbnail preview. Camera videos, the existing timeline, playback controls, and review-control DOM/state remain intact. Press T again or choose **Review controls** to restore the columns. Single Camera View does not display the preview; returning to MCV restores the current preview preference.

Starting a formal review opens the preview. Committing or replacing an AUR (Action Under Review) restores the review controls. Repeated refreshes of the same review start/AUR do not undo a later manual toggle. Completing/deleting the active review restores controls. A page initially loaded with an active, unmarked review opens the preview; one already containing AUR opens controls. With no active review, manual preview browsing is available. Modals, editable fields, IME composition, and modified shortcuts retain keyboard ownership.

Each cell spans five seconds and has a fixed **128×68 CSS-pixel** viewport. Images use **object-fit: cover**: the server accepts width only, so small differences from the viewport aspect ratio are cropped without distortion. All cameras use the same epoch-aligned five-second grid and fixed labels. Loading and unavailable cells use the local `video-unavailable.svg` placeholder and distinct captions. Historical thumbnails are requested even for currently offline cameras.

Clicking inside a cell seeks to its exact horizontal time, not the image's source frame time. Keyboard activation of a cell seeks to its midpoint. Existing review RM bounds and deselection behavior still apply. The yellow line derives from `state.playbackCursor` and spans all three rows, including gaps. Toggle/show never seeks or pauses playback. Small viewports can scroll the panel vertically without shrinking thumbnail cells.

## Time and viewport ownership

`thumbnail-time.js` uses BigInt epoch microseconds for grid origins, cell keys, API slots, and timestamp differences. The application stores playback time in epoch seconds; conversions split integer/fractional seconds rather than multiplying absolute microseconds through Number. Returned decimal-string microseconds are never converted to Number. Pixel computations convert only bounded differences.

The preview scale is always 25.6 px/second; the existing timeline scale is read from its current rendered width and state range. Scroll events translate viewport-anchor time deltas to the other viewport's scale, accounting for fixed labels/padding. Preserving deltas avoids an artificial initial jump after cursor alignment where viewport gutters differ. Programmatic scroll targets are recognized and ignored on feedback; requestAnimationFrame coalesces user scroll work. Edge clamping never changes playback time.

After seeks/show, both cursors align to the same screen x where their scroll ranges permit it. At edges, each viewport clamps independently. While playing, the existing playhead updates the preview; offscreen cursors are brought back into view. Manual scroll suspends cursor-follow for 700 ms, and paused playback does not snap the viewport back afterward. Viewport resizing or timeline scale changes recompute geometry. Scroll synchronization itself does not seek.

## API and bounds

`ReplayApi.thumbnails` uses the same configured API base as replay:

```text
GET /api/ivr/v1/thumbnails?ring=...&camera=...&startEpochUs=...&endEpochUs=...&intervalMs=5000&width=128
```

Each response slot maps by `requestedEpochUs`; `actualEpochUs` remains image metadata and never changes cell positioning. Image URLs must resolve to the configured API origin. The frontend follows the existing no-store/token API; see [server thumbnail service](../thumbnail-service.md).

Fixed implementation bounds:

- At most **32 cells per camera**, **96 image/cell nodes** total; two cells of prefetch margin where space permits.
- At most **two simultaneous metadata requests**, then the remaining camera, matching server per-client admission limits.
- An in-memory metadata cache capped at **192 entries**, pruned to the current window on load.
- Pending/transient responses retry at exponential delays starting at 500 ms, with **four attempts per cell**. After that the placeholder remains until the cell leaves/reenters the window or context changes.
- Metadata requests time out after **8 seconds**; windows debounce for **100 ms**; ready URL metadata is eligible for refresh after **60 seconds** when revisited/reloaded.
- Hiding, SCV switching, range/context changes, or scrolling cancel obsolete metadata requests; hidden cells release remote image sources. Ring/match/round/start changes reset cached context. Old responses cannot paint a new context.

There is no separate playback clock, global polling interval, backend change, or extra API endpoint. `TimelineThumbnailPreview` owns visibility, viewport work and cleanup; `ThumbnailData` owns API/caching/retries. The component subscribes once to existing review state and compares active review ID/RST and AUR/history revisions. `app.js` calls `update()` on its existing time-sensitive update path, including actual media-time callbacks. `destroy()` removes subscriptions, resize observation, event listeners, animation frames and timers.

## Verification

```sh
node --test src/test/thumbnail-preview.test.js src/test/ivr-workflow.test.js src/test/ivr-client-rendering.test.js
PHP_BIN=php node src/test/thumbnail-preview-browser.cjs
```

The optional browser harness requires PHP and Chrome; set `PHP_BIN` and `CHROME_BIN` to absolute executable paths where necessary. It starts a temporary local server and isolated headless Chrome profile, renders the production PHP views/CSS/component, and injects deterministic thumbnail API responses. It checks cell sizes, independent gaps, proportional scroll, sub-cell seeks, cursor alignment, workflow visibility, keyboard ownership, SCV suspension, bounded long-event DOM and repeated toggles. It does not connect to live cameras or qualify device performance.

For device/live-service acceptance, start an actual match/round and review in MCV, verify T/AUR/Start Review transitions, scroll both panels, click cell midpoints and timeline marks, exercise live/play/reverse/frame controls, switch camera views, resize to Chromebook dimensions, and browse a long recording. Confirm unavailable and expired-image behavior with the deployed thumbnail API. Hardware touchpad/high-DPI and live three-camera end-to-end performance remain deployment checks.
