# FreePlay Timeline Thumbnail Preview (TTP)

**Target:** Existing FreePlay IVR browser UI (VS Code)  
**Feature:** Three-camera Timeline Thumbnail Preview (TTP)  
**Scope:** Implement and test the IVR frontend integration with the **already implemented** ingestion-server thumbnail API. Do not rewrite the thumbnail service or video ingestion pipeline.

## Instructions to Codex

You are working in the existing FreePlay IVR repository. Implement this feature in the real application, not a standalone mockup. Before editing, inspect the current source and tests to identify:

1. The single-camera (SCV) and multi-camera (MCV) views, camera layout, timeline DOM/canvas and scroll/zoom implementation.
2. The authoritative server-timestamp-to-pixel mapping, playback cursor, seek controls, synchronized camera playback and timeline range model.
3. The implemented thumbnail API's **actual** routes, request/response schemas, timestamp units, authentication, error statuses, caching and image URLs. Inspect its implementation or existing documentation; do **not** assume the examples below are exact.
4. Existing UI components, Bootstrap/jQuery/JavaScript conventions, CSS styles, event handlers, state management and test infrastructure.
5. The current **review controls** container, review-start event/transition, **AUR (Area Under Review) marking** event/transition, existing keyboard shortcut dispatcher, and any current panel visibility/state management. Determine the actual definitions and hooks rather than inventing new review lifecycle events.

First summarize the concrete integration points in your working notes. Reuse existing abstractions and avoid introducing another competing clock, playback controller, or timeline model. Make focused changes, preserve unrelated work and functionality, and add tests. Do not stop after planning; implement and verify unless genuinely blocked.

## 1. User experience and layout

These UI changes apply to the **Multi-Camera View (MCV)** only; the single-camera views (SCV) remain unmodified.

Add a **Timeline Thumbnail Preview (TTP)** panel displayed **alongside the existing camera views and timeline**, without obscuring the video players or removing the existing timeline. **The TTP occupies the same UI region as the review controls: these two panels are mutually exclusive.** It shows **three horizontally scrolling thumbnail tracks**, one for each ring camera, in stable order Camera 1, Camera 2, Camera 3. Each track shares one common time axis and horizontal scroll position so corresponding thumbnails are vertically aligned across all cameras.

- **Thumbnail cell dimensions:** exactly **128 CSS pixels wide × 68 CSS pixels high** for the image viewport; one cell spans **5,000 ms** of server time. Keep dimensions stable while images load or fail. Do not stretch source images disproportionately: use `object-fit: cover` or a consistent letterbox policy, and document the choice.
- Each camera has a persistent, clearly labeled row; if a camera is offline, stopped, has a recording gap, or a thumbnail is unavailable, display a **bundled default placeholder image** in that cell. Do not leave a broken image icon, empty gap, or shift the time grid. Differentiate missing video from a temporarily loading thumbnail when practical.
- The three tracks share the same left/right time boundaries and grid. A missing camera does not shift the other cameras.
- Add a shared, clearly visible **yellow vertical TTP cursor** extending across all three camera thumbnail tracks. Its position represents one authoritative server timestamp, not an individual camera frame index.
- Keep camera labels fixed when horizontally scrolling; scroll only the thumbnail time grid. The TTP should be visible and usable at ordinary Chromebook/laptop resolutions, without causing unintended horizontal page overflow.
- Preserve existing SCV/MCV and playback behavior, including keyboard/shuttle playback operations. **The review controls are hidden while TTP is visible and restored when TTP is hidden.** Do not confuse the review controls panel with the existing timeline, camera views, or playback controller; only swap the intended review-control UI region. Use the project's established styling, accessibility and responsive conventions. If a smaller viewport cannot display all tracks without excessively shrinking the videos, allow the TTP panel to scroll vertically or collapse using the existing UI pattern; do not silently change the specified thumbnail dimensions.
- Implement the `t` keyboard shortcut and review-workflow automatic visibility rules in Section 1A. A visible toggle may be added if it fits the existing UI, but it must call the **same** visibility state transition as the shortcut and workflow events.

### Conceptual layout (not a mandate to replace the current DOM)

```text
┌─────────────────────── Camera views ───────────────────────┐
│   Camera 1              Camera 2              Camera 3     │
└────────────────────────────────────────────────────────────┘
┌──────── TTP (replaces review controls while visible) ──────┐
│ Camera 1 │ [128×68][128×68][128×68][128×68] ...            │
│ Camera 2 │ [128×68][missing][128×68][128×68] ...           │
│ Camera 3 │ [128×68][128×68][missing][128×68] ...           │
│          │               │ yellow cursor                   │
└────────────────────────────────────────────────────────────┘
┌──────────────────── Existing timeline ─────────────────────┐
│             ...  [playhead] ...                            │
└────────────────────────────────────────────────────────────┘
```

## 1A. Operator workflow, AUR identification and panel visibility (mandatory)

**Primary purpose:** The TTP is a rapid visual navigation aid for the IVR operator to identify the **AUR (Area Under Review)**. It is not a replacement for the review state machine, authoritative timeline, or playback controller.

### Mutually exclusive UI panels

- The **TTP and existing review controls occupy the same designated panel region**. Exactly one of them is visible at a time during a review: `TTP visible → review controls hidden`; `TTP hidden → review controls visible`.
- Preserve the camera views and existing timeline in both modes. Do not hide the timeline, disable playback, destroy review-control state, or recreate video players when swapping panels.
- Prefer hiding/revealing existing DOM/components (using the application's established visibility convention) over destroying and reconstructing controls. Keep existing event subscriptions and review data intact; avoid duplicate listeners across repeated toggles.
- The layout must not reserve a second empty panel area when one is hidden. Where possible, preserve stable overall layout dimensions to avoid disruptive video/timeline resizing.

### Keyboard shortcut

- **At any time during an applicable IVR session, pressing `t` shows the TTP.** If it is already shown, pressing `t` again may toggle back to review controls; implement this as the consistent `t` toggle behavior unless the existing shortcut convention requires otherwise. In all cases, the first `t` press when hidden must show TTP.
- Register the shortcut through the application's **existing keyboard shortcut dispatcher**, if one exists; do not attach redundant global listeners. Confirm whether `t` is already assigned, and resolve conflicts without silently breaking another command.
- Do not intercept `t` while the operator is typing into an `input`, `textarea`, editable field, or IME composition, or when a modifier combination is in use. Respect the application's modal and focus handling.
- When the TTP becomes visible, synchronize its viewport and yellow cursor to the current authoritative server timestamp. Do not seek or alter playback merely by showing the panel.
- If a visible Show/Hide control is provided, keep its label/pressed state synchronized with the keyboard and workflow events.

### Automatic visibility transitions

1. **Review started:** On the existing application's authoritative **review-started** transition, automatically **show TTP and hide review controls**, to help the operator locate the AUR. This must work whether the review was started locally or the UI receives the state through its existing review workflow/event mechanism.
2. **AUR marked:** On the existing application's authoritative **AUR-marked** transition (when the operator commits/marks the Area Under Review), automatically **hide TTP and show review controls**, so the operator can continue the review workflow.
3. **Manual override:** Pressing `t` remains available to bring TTP back into view after the AUR has been marked, without clearing or changing the AUR. Manual panel switching must not itself start a review, mark an AUR, or modify the review state.
4. **Repeat reviews:** Each subsequent review-start event must show TTP again, regardless of how the operator last left the panels. Each subsequent AUR-marked event must return to review controls.
5. **Idempotency:** Repeated/replayed review-start or AUR-marked notifications must not duplicate panels, listeners, API requests, or state transitions. Avoid responding to mere review-state refreshes as if a new review had started; identify the actual transition/event or review identifier.
6. **Scope:** Inspect the real application for review cancellation, completion, ring changes, and no-active-review states. Preserve established behavior; if a new visibility default is necessary, document it. Do **not** invent AUR semantics or assume that seeking to a timestamp automatically marks the AUR.

### Centralized visibility ownership

Implement a single explicit visibility state and a small set of functions/actions (names illustrative):

```text
showThumbnailPreview(reason)
showReviewControls(reason)
toggleThumbnailPreview(reason="keyboard")

onReviewStarted(reviewId)  → showThumbnailPreview("review_started")
onAURMarked(reviewId)      → showReviewControls("aur_marked")
onKeyT()                  → toggleThumbnailPreview("keyboard")
```

Wire these to existing review lifecycle events, not DOM heuristics or polling. The review-start and AUR-marked transitions take precedence when they occur; a later manual `t` press can switch panels again. When the TTP is hidden, suspend unnecessary thumbnail fetch/prefetch work and cancel stale requests without losing the playback timestamp or review state. On re-show, restore correct cursor/time alignment and fetch the newly visible range.

### Updated conceptual layout

```text
Camera 1 view         Camera 2 view         Camera 3 view
────────────────────────────────────────────────────────
Existing synchronized playback timeline (always visible)
────────────────────────────────────────────────────────
SHARED PANEL REGION — one of:

  TTP visible:                Review controls visible:
  Camera 1 thumbnails        Existing review controls
  Camera 2 thumbnails        (unchanged functionality)
  Camera 3 thumbnails
  yellow TTP cursor

  `t` toggles these panels
  Review starts → TTP         AUR marked → Review controls
```

## 2. Timebase and independent scales

**Critical:** The TTP and existing timeline use the **same server time domain** but **different pixel scales**.

- TTP scale is fixed at **128 px / 5 seconds = 25.6 CSS px/second**, or **0.0256 px/ms**. Do not force the existing timeline to use that scale or change its zoom behavior.
- The existing timeline retains its current scale/zoom, which may vary.
- Every TTP cell represents a fixed interval `[cellStart, cellStart + 5,000 ms)` in the common server timeline, even if the thumbnail image was extracted from a nearby keyframe. Thumbnail **actual source-frame timestamp** is image metadata; it must not move or resize the cell.
- Align the TTP grid to a deterministic server-time boundary (for example, `floor(timestampMs / 5000) * 5000`) or to the server's documented sampling grid. Use **one** consistent origin for all cameras, and avoid floating-point drift.
- Server epoch-microsecond values may be JSON decimal strings and can exceed JavaScript safe integer precision. **Never convert absolute epoch microseconds directly to a JS Number and multiply.** Use BigInt for absolute timestamps or reuse the project's proven precision-safe time utility, then convert bounded differences to Number for pixel calculations. Normalize all time units explicitly.
- The server timestamp is the single source of truth for both cursors and all seek requests. Do not use browser wall-clock time, image index, or video `currentTime` alone to establish cross-camera alignment.

Suggested pure mapping helpers (adapt names to existing code):

```text
cellStart(t) = origin + floor((t - origin) / 5000ms) * 5000ms
xTTP(t) = ((t - origin) / 5000ms) * 128px
serverTimeAtTTPX(x) = origin + (x / 128px) * 5000ms
xTimeline(t) = existingTimelineTimeToPixel(t)
```

Use actual CSS geometry and scroll offsets when converting pointer coordinates. Account for the fixed camera-label column, viewport bounding rectangle, zoom, scroll position and high-DPI displays. The conversion must be stable at sub-cell positions: clicking halfway through a thumbnail corresponds to approximately 2.5 seconds after that cell's start, **not** merely its thumbnail/keyframe timestamp.

## 3. Thumbnail loading and default images

Integrate with the **existing server thumbnail API**, not a newly invented endpoint. The API may return ready/pending/unavailable states and image URLs. Discover the real contract before implementation.

- Request thumbnails for **all three camera streams** for the visible TTP range, plus a modest prefetch margin on both sides.
- Use a **5-second interval** and request images rendered at **128 × 68** where the API supports both dimensions. If it only accepts width, request width 128 and fit/crop to the 128×68 viewport consistently.
- Match the returned thumbnails to **requested time cells**, not array position or the source frame's actual timestamp. Respect stream generation, timestamp gaps and API semantics.
- For `unavailable`, recording gaps, HTTP 404/410, failed image loads, disconnected cameras without video for that interval, or otherwise unrenderable thumbnails, show the **default bundled image** at 128×68. Do not fabricate a frame or reuse the last available frame across a gap.
- For `pending`, show a loading placeholder or the default image until ready; retry with **bounded exponential backoff** and stop retrying when the cell leaves the active/prefetch window. Do not poll indefinitely.
- Do not interpret a camera being currently idle/offline as proof that its **historical** video is unavailable. Historical thumbnails should still appear when indexed video exists.
- Use `AbortController` or the existing request-cancellation mechanism to discard obsolete responses when the user scrolls/seeks quickly, changes rings or hides the panel. Prevent stale responses from replacing images for another ring/time window.
- Use bounded DOM virtualization/windowing and request batching: never create a thumbnail element for every five-second cell in a full ten-hour tournament. Limit active images, in-flight requests, retries and decoded-image memory. Reuse browser caching and server cache headers.
- Handle mixed success/failure per camera independently. A missing thumbnail on one camera must not block the other two.
- Bundle a small, locally available **default image asset** within the IVR frontend, or use an existing project asset. It must work on an isolated LAN without external CDN requests. Include descriptive accessible text such as “Video unavailable”.

## 4. Bidirectional scroll synchronization

**Scrolling the TTP must scroll the existing timeline, and scrolling the timeline must scroll the TTP**, with proportional movement determined by their **different time-to-pixel scales**.

Implement this in **time coordinates**, not by copying `scrollLeft` values or applying a fixed pixel ratio independent of timeline zoom.

Preferred behavior:

1. Define the shared **viewport anchor timestamp** (normally the server timestamp at the horizontal center of the timeline/TTP content viewport; use the same anchor for both).
2. When the user horizontally scrolls the TTP, compute the anchor timestamp from TTP geometry, then scroll the existing timeline so that timestamp occupies its corresponding anchor position.
3. When the user horizontally scrolls the timeline, compute the timeline anchor timestamp from its current scale/zoom and scroll position, then scroll the TTP to that same timestamp.
4. If the timeline zoom changes, recompute mapping without changing the authoritative playhead timestamp.
5. Clamp gracefully at recording/range edges. When either viewport cannot scroll farther, do not oscillate or jump the other viewport.
6. Avoid feedback loops between programmatic and user-initiated scroll events using a reentrancy guard, origin token, animation-frame coalescing or the project's established mechanism. Avoid heavy network requests on every scroll event; debounce visible-range fetches while keeping visual scroll synchronization responsive.
7. Preserve native touchpad, wheel/shift-wheel, scrollbar and drag-to-scroll behavior supported by the existing UI. Do not hijack vertical page scrolling unnecessarily.

**Important distinction:** Scroll synchronization changes which time range is visible; it must **not automatically seek playback** unless the existing timeline's established scroll behavior explicitly does so. Cursor synchronization is separate from viewport synchronization.

## 5. Cursor, click-to-seek, and alignment

Maintain **one authoritative playhead server timestamp** in the existing playback state. Both timeline and TTP cursors derive from that value.

### Click on the TTP

1. Calculate the exact TTP content-space x coordinate of the click, including scroll offset and fixed labels.
2. Convert that x coordinate to a server timestamp using 128 px per 5,000 ms.
3. Use the **existing timeline seek function** to set the authoritative playhead and seek the relevant camera players. Do not introduce a second playback clock or a competing seek implementation.
4. Show/move the **yellow vertical TTP cursor** at the clicked timestamp, and update the existing timeline cursor to the same timestamp.
5. Scroll the timeline/TTP as needed to make their cursors **vertically aligned on screen** (same horizontal screen x), if both viewports have enough available scroll range. Prefer the click location as the alignment target, subject to viewport boundaries.
6. If exact vertical alignment is impossible near a start/end boundary or due to unequal viewport widths, clamp each viewport to its valid range and preserve correct timestamp correspondence; never falsify the cursor timestamp merely to make the lines look aligned.

### Click on the existing timeline

1. Preserve the existing click-to-seek behavior and its timestamp resolution.
2. Update/show the yellow TTP cursor at the same authoritative server timestamp.
3. Scroll the TTP so the TTP cursor aligns vertically with the timeline cursor when feasible.

### During playback and all seek operations

- Track the TTP cursor continuously as the existing timeline cursor advances, including normal playback, pause/resume, keyboard seeks, frame stepping, reverse playback, fast playback, go-live, replay-window changes, and any shuttle/scrubber controls implemented by the application.
- Derive updates from the **same state/event stream that moves the existing timeline cursor**, rather than duplicating playback timers.
- When the playhead exits the visible TTP range, use the existing timeline's follow-playhead/auto-scroll policy (or a documented consistent equivalent) to bring both cursors back into view while keeping their on-screen x positions aligned where possible.
- Do not steal scroll position during an active manual scroll gesture if the existing timeline intentionally suspends follow-playhead; resume synchronization according to the established policy.
- Show cursor position even if the selected timestamp falls in a recording gap; playback seeking may resolve to an available frame according to the existing playback engine, but the UI must distinguish the **requested** timestamp from any actual resolved frame time if the existing application exposes that distinction.
- All three camera tracks share **one** TTP cursor, not three independent cursors.

### Cursor visual specification

Use a visible yellow line (e.g. `#FFD400` or the existing application yellow accent), approximately 2 px wide, spanning the complete height of the three thumbnail tracks. Ensure it is positioned relative to the scrolling thumbnail content, does not intercept clicks (`pointer-events: none`), and remains legible over bright images (a subtle dark edge/shadow is acceptable). Keep it visually aligned with the existing timeline playhead wherever feasible; do not recolor the existing timeline cursor unless consistent with current design.

## 6. State and component design

Prefer a small, testable component/module such as `TimelineThumbnailPreview` integrated with the existing IVR controller. Reuse established framework conventions (likely PHP, Bootstrap 5, jQuery and JavaScript) rather than introducing React/Vue or a new build pipeline solely for this feature.

Separate concerns:

```text
Existing Playback/Timeline Controller (authoritative server timestamp)
             │
             ├── Existing timeline cursor and viewport
             │
             └── TTP component
                   ├── shared 3-camera thumbnail tracks
                   ├── thumbnail API adapter and cache
                   ├── time ↔ pixel mapping
                   ├── scroll synchronization
                   └── yellow cursor rendering
```

Document event ownership and cleanup. Remove subscriptions/listeners on panel teardown or ring change. Do not create duplicate playback event handlers when the panel is toggled repeatedly. Ensure camera order, ring selection, active time window and stream-generation changes update the preview correctly.

## 7. Edge cases

Explicitly handle:

- One or more cameras never connected, disconnected, idle, starting or stopped.
- Historical video present while camera is currently offline.
- Missing GOPs, incomplete first/last GOP, video gaps, stale or pending thumbnail jobs.
- Stream stop/start and generation discontinuities.
- Sparse historical recordings or recordings shorter than 5 seconds.
- Start/end timestamps that do not fall on a five-second boundary.
- Timestamp precision across long events and epoch-microsecond JSON values.
- User switching rings while image requests are in flight.
- Rapid alternating scroll between timeline and TTP, wheel gestures and programmatic seek.
- Existing timeline zoom changes while the TTP scale remains fixed.
- Playback seeks outside available media and return-to-live behavior.
- Browser resize, different device pixel ratios, and fixed label widths.
- Offline isolated-LAN operation, API errors, authentication failures, and partial responses.
- Server not supporting requested image dimensions (graceful fallback).

## 8. Automated tests

Use the existing test framework and add focused tests. At minimum verify:

**Time mapping and scale**
- 128 px maps to exactly 5 seconds in TTP; 64 px maps to 2.5 seconds.
- All three tracks align to identical five-second boundaries.
- Existing timeline zoom changes do not alter TTP scale.
- BigInt/precision-safe epoch-microsecond timestamps map correctly across a 10-hour event.
- Sub-cell click offsets map to correct timestamps.

**Scrolling**
- TTP scroll synchronizes timeline by timestamp, not equal `scrollLeft`.
- Timeline scroll synchronizes TTP by timestamp, including after timeline zoom.
- No recursive scroll feedback or oscillation.
- Boundary clamping behaves correctly.
- Manual scroll and follow-playhead policy interact predictably.

**Cursor and seeking**
- Clicking TTP seeks via existing playback controller and updates both cursors.
- Clicking timeline updates TTP cursor.
- Cursors align vertically when enough scroll range exists.
- When alignment is impossible, timestamps remain correct and scrolling clamps.
- Playback, reverse playback, frame stepping, go-live and other seek functions update TTP cursor.
- One shared TTP cursor spans all camera rows.

**Thumbnail data**
- Correct API requests for three cameras at five-second intervals.
- Ready images load in the correct cell and camera row.
- Unavailable/gap/404/image error displays the default 128×68 image.
- Pending thumbnails retry within bounds.
- Historical thumbnails remain visible when camera is currently disconnected.
- Rapid ring changes and scrolls cannot render stale results.
- DOM/image/request counts stay bounded during a simulated 10-hour timeline.
- Missing images do not shift cell positions or camera alignment.

**Review workflow and visibility**
- Pressing `t` while TTP is hidden shows TTP and hides only the review controls; pressing `t` again restores review controls and hides TTP.
- The existing timeline and all camera views remain visible and functional in both modes.
- Starting a review automatically shows TTP even if the operator previously hid it.
- Marking the AUR automatically hides TTP and restores review controls.
- After marking an AUR, pressing `t` reopens TTP without changing the marked AUR or review state.
- A second review-start event reopens TTP; a second AUR-mark event returns to review controls.
- Duplicate/replayed lifecycle events do not cause toggling, duplicated listeners or lost review-control state.
- `t` is not captured while typing, composing text, using modifier shortcuts, or when an existing modal should own keyboard input.
- TTP show/hide does not seek, pause, restart playback, or recreate camera players.
- Hiding TTP stops unnecessary thumbnail loading; reopening restores correct scroll/cursor position.

**Regression**
- Existing SCV/MCV playback, timeline seek/zoom, camera switching, remote start/stop and keyboard/shuttle controls still work.
- Toggling TTP repeatedly does not leak listeners or timers.

Where practical, add a browser-level integration test using mock API responses and simulated scrolling/clicking, rather than relying only on pure unit tests.

## 9. Implementation milestones

1. Inspect and document existing timeline/playback integration points and actual thumbnail API contract.
2. Implement precision-safe shared time-coordinate helpers, with unit tests.
3. Add the three-row 128×68 thumbnail panel and bundled default image.
4. Implement visible-range loading, prefetching, cache, cancellation and bounded virtualization.
5. Implement the fixed 128 px / 5 s time scale independently of existing timeline zoom.
6. Implement bidirectional timestamp-based scroll synchronization and feedback-loop prevention.
7. Implement TTP click-to-seek and shared yellow cursor.
8. Wire timeline clicks, playback progress and every existing seek pathway to TTP cursor updates.
9. Implement best-effort vertical cursor alignment and edge clamping.
10. Integrate mutually exclusive TTP/review-controls visibility, the `t` shortcut, automatic show on review start and automatic hide on AUR marking.
11. Add loading/error/gap states, accessibility, responsiveness and cleanup.
12. Run tests and browser verification; fix regressions.
13. Update relevant IVR documentation and provide a concise operator note.

## 10. Required verification and acceptance demonstration

Run existing lint/build/tests plus newly added tests. In a browser or automated browser harness, demonstrate:

1. Three labeled rows are displayed, each with 128×68 thumbnail cells at five-second intervals.
2. Camera 2 has missing video for one interval: that cell shows the default image while Cameras 1 and 3 remain intact and aligned.
3. Scroll TTP 256 px: its time anchor moves 10 seconds; timeline viewport moves by the corresponding **timeline-scale** amount, not necessarily 256 px.
4. Scroll timeline: TTP moves to the matching server-time range without oscillation.
5. Click halfway through a TTP cell: seek occurs at the cell start plus approximately 2.5 seconds, both cursors show the same timestamp, and their screen x positions align when possible.
6. Click timeline: yellow TTP cursor appears at the corresponding timestamp and aligns when possible.
7. Play, pause, reverse, frame-step, shuttle seek and go-live as supported: TTP cursor follows the authoritative playhead.
8. Zoom the existing timeline: TTP stays at 128 px per five seconds and both remain synchronized.
9. Change rings quickly during outstanding requests: no stale camera images appear.
10. Scroll across a long event: DOM count and memory stay bounded and playback remains responsive.
11. Start a review: TTP appears automatically in the review-controls region, and review controls disappear; camera views and timeline stay visible.
12. Mark the AUR: TTP disappears and review controls return, preserving review state.
13. Press `t` after AUR marking: TTP returns without altering the AUR; press `t` again to return to review controls.
14. Start another review: TTP appears again regardless of the prior manual panel selection.
15. Test `t` with focus in a text field and while a modal is active: normal typing/modal shortcuts are preserved.

Do not report unrun browser/device checks as passed. If full browser testing is unavailable, provide precise manual verification instructions and list the checks that remain outstanding.

## 11. Final report

Report:

- Files created and changed, and why.
- Actual thumbnail API routes and timestamp formats used.
- TTP component integration points and authoritative playhead source.
- Actual review-start and AUR-marked hooks used, `t` shortcut integration, and mutually exclusive review-controls/TTP panel behavior.
- How scroll synchronization avoids feedback loops.
- How pixel/time conversion handles different scales and timestamp precision.
- How placeholder images, pending responses and recording gaps work.
- How cursor alignment and follow-playhead behavior work near boundaries.
- Virtualization/caching limits and their configuration.
- Test commands, results and any incomplete verification.
- Any remaining integration issues or known limitations.

## 12. Non-negotiable acceptance criteria

The feature is complete when the existing IVR displays **three synchronized thumbnail rows** alongside camera views and the existing timeline **in place of the review controls while TTP is visible**; pressing **`t`** toggles TTP visibility without disrupting playback or editing the AUR; **review start automatically shows TTP**, and **AUR marking automatically hides TTP and restores review controls**; every thumbnail image occupies **128×68 CSS px** and every cell represents **five seconds**; missing video shows a local default image; TTP and timeline scroll bidirectionally by shared server timestamp despite different pixel scales; clicking either timeline seeks through the existing playback controller and updates both cursors; the **yellow TTP cursor** follows all playback and seek operations; the cursors align vertically whenever scroll geometry allows; and the change does not break existing camera playback, video ingestion, remote camera control or long-event performance.
