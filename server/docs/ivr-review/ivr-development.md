# FreePlay IVR Prototype

## Role

You are acting as a senior full-stack web developer and UI prototyper.

Build a **working PHP/Bootstrap/jQuery prototype** of the **FreePlay Instant Video Replay (IVR) review interface** for Taekwondo competition.

The prototype is intended to validate **workflow, operator interaction, information architecture, and UI/UX behavior** before production implementation. It does **not** need to implement the final video transport, final server replay protocol, final persistence model, or production security stack.

Use the files below as the authoritative project inputs. In particular:

1. **FreePlay System Requirements** (`docs/ivr-review/system-requirements.md`) — functional and non-functional requirements.
2. **FreePlay Use Cases** (`docs/ivr-review/use-cases.md`) — operator behavior and workflow semantics.
3. **USATKD Kyorugi Rules 2026 Article 21** (`docs/ivr-review/references/article-21.md`) — authoritative rules excerpt.
4. **2026 USATKD Kyorugi Referee Development Program — IVR** (`docs/ivr-review/references/rdp-ivr.pdf`) — soft/current interpretation guidance only; do not treat it as immutable rules.
5. **UI mockups** (`docs/ivr-review/ui-mockups/multi-camera-view.png`, `docs/ivr-review/ui-mockups/single-camera-view.png`) for Multi Camera View (MCV) and Single Camera View (SCV).
6. **Server Protocol** (`docs/server-protocol.md`) - All sections may be useful but especially Section 38, which explains the Replay API from the video ingestion server that shall be critical for video retrieval for review. If changes to this protocol are necessary to deliver the required functionality, create a prompt for Gemini in Visual Studio in a document `docs/server-ivr-protocol-updates.md` detailing the necessary changes and providing complete and actionable instructions for an LLM agent to implement the updates. If there are design choices to be made, outline the choices and the pros and cons of each choice in the front of the markdown document in a section titled *System Architect's Attention Required*.

If any supplied file, except the server protocol, conflicts with another, use this precedence:

1. Article 21 for actual rule requirements.
2. FreePlay System Requirements for product behavior.
3. FreePlay Use Cases for workflow interpretation and prototype behavior.
4. Referee-development slides for current operational guidance only.
5. Mockups for visual direction.

Do not silently invent rule behavior that is not supported by those files.

If the server protocol conflicts with another file, note the conflict and discuss best choices to resolve as outlined above. Do not make changes in the server protocol (i.e. any file in `/server/src/`), but instead propose changes in the aforementioned markdown file for server/IVR protol updates.

---

# 1. Prototype Goals

Create a browser-based IVR interface that:

- generally matches the supplied MCV and SCV mockups;
- implements the operator behavior described in the use cases;
- demonstrates transitions between live monitoring, request marking, formal review, camera switching, timeline navigation, result selection, and post-review annotation;
- uses **modularized PHP, Bootstrap 5, jQuery, HTML, CSS, and JavaScript**;
- runs without Node.js, Electron, React, Vue, Angular, or a build step;
- is easy to modify as requirements continue to evolve.

This is a **UI/UX and workflow prototype**, not a production replay engine.

Use simulated video placeholders, mock timeline data, mock PSSEL events, and mock server responses where necessary.

---

# 2. Technology Constraints

Use:

- PHP 8+
- Bootstrap 5.3+
- jQuery 3.x
- Font Awesome or Bootstrap Icons
- plain JavaScript modules where useful
- JSON fixtures or PHP arrays for mock data
- optional lightweight PHP endpoints returning JSON

Do **not** use:

- React
- Vue
- Angular
- Node.js as a runtime dependency
- TypeScript
- Webpack/Vite/etc.
- Electron
- database dependencies unless absolutely useful for a prototype

The prototype should run from a normal PHP-capable web server.

---

# 3. Modular Project Structure

Use a structure similar to:

```text
public/review
├── index.php
├── config/
│   └── prototype.php
├── includes/
│   ├── header.php
│   ├── footer.php
│   ├── modals.php
│   └── mock-data.php
├── api/
│   ├── match.php
│   ├── review.php
│   ├── timeline.php
│   └── pssel.php
├── assets/
│   ├── css/
│   │   ├── app.css
│   │   ├── timeline.css
│   │   └── responsive.css
│   ├── js/
│   │   ├── app.js
│   │   ├── state.js
│   │   ├── review-controller.js
│   │   ├── playback-controller.js
│   │   ├── timeline-controller.js
│   │   ├── camera-controller.js
│   │   ├── pssel-controller.js
│   │   └── mock-server.js
│   └── img/
│       └── placeholders/
├── views/
│   ├── mcv.php
│   ├── scv.php
│   ├── review-panel.php
│   ├── timeline.php
│   └── playback-controls.php
└── README.md
```

You may improve this structure, but keep responsibilities separated.

Avoid putting the entire application into one PHP file or one large JavaScript file.

---

# 4. Application Architecture

Implement a small client-side state model that represents the current IVR session.

At minimum, maintain state for:

```js
{
  ring,
  match,
  round,
  currentView,          // "MCV", "CAM1", "CAM2", "CAM3"
  cameras,
  playbackCursor,
  liveEdge,
  playbackRate,
  isPlaying,
  currentRequest,
  pendingRequests,
  reviewHistory,
  reviewWindow,
  aur,
  rst,
  reviewClockSeconds,
  reviewStatus,
  reviewResult,
  psselEvents,
  timelineRange,
  selectedCamera
}
```

Use a clear event-driven/controller structure.

UI controls should call semantic application actions such as:

```js
reviewController.createCoachRequest("chung");
reviewController.createCoachRequest("hong");
reviewController.startReview();
reviewController.resolveWithoutReview();
reviewController.markAUR();
reviewController.setResult("accepted");
reviewController.setResult("rejected");
reviewController.setResult("ivr_issue");

cameraController.showMCV();
cameraController.showCamera(1);

playbackController.seekRelative(-5);
playbackController.seekRelative(-2);
playbackController.seekRelative(-1);
playbackController.stepFrame(-1);
playbackController.stepFrame(1);
playbackController.setRate(-0.5);
playbackController.setRate(0.5);
playbackController.setRate(1);
playbackController.setRate(2);
playbackController.setRate(5);
playbackController.goLive();
```

Do not bind the application design directly to button IDs. Buttons should be one input mechanism for semantic actions.

This will later allow keyboard shortcuts and WebHID ShuttleXpress controls to call the same controller methods.

---

# 5. Core Workflow Model

The prototype must preserve the following conceptual distinction:

> **Review state and camera view are independent.**

The operator can be:

- not reviewing while in MCV;
- reviewing while in MCV;
- reviewing while in CAM 1 / CAM 2 / CAM 3 SCV;
- freely switching MCV ↔ SCV during an active review.

Do **not** model MCV and SCV as workflow states.

A review lifecycle is:

```text
Coach raises card
→ Chung Review Request / Hong Review Request
→ Request Mark (RM)
→ Review Window created
→ either:
     Resolved without Review
   OR
     Start Review
     → Review Start Time (RST)
     → 30-second Review Response Clock starts
     → locate Action Under Review (AUR)
     → inspect MCV and/or SCV
     → Accepted / Rejected / Rejected: IVR Issue
     → clock stops immediately
     → formal review ends
     → detailed annotation may continue afterward
```

---

# 6. Multi Camera View (MCV)

Implement MCV according to the supplied mockup and current design decisions.

Use a **2×2 primary grid**:

```text
┌────────────────┬────────────────┐
│ CAM 1          │ CAM 2          │
│                │                │
├────────────────┼────────────────┤
│ CAM 3          │ Request/Review │
│                │ Controls       │
└────────────────┴────────────────┘
```

Important:

- exactly three camera feeds;
- the fourth quadrant is **Request / Review controls**;
- no permanent right-side rail in MCV;
- camera real estate is the priority;
- camera labels should overlay the video rather than consume separate vertical bars;
- MCV navigation affects all displayed cameras synchronously because all cameras share one logical playback cursor.

Header should be compact and include:

- FreePlay IVR branding
- ring
- match/division metadata
- current time/status
- Live indicator
- `Views ▼`
- `Help ▼`
- optional settings icon

`Views ▼` should contain:

- Multi Camera View
- Camera 1
- Camera 2
- Camera 3

`Help ▼` should contain at minimum:

- Legend
- Keyboard Shortcuts

---

# 7. Single Camera View (SCV)

Implement SCV using the supplied mockup as visual guidance.

Primary goals:

- one camera occupies most of the available screen;
- Review/Request information remains visible;
- common timeline remains visible;
- playback/navigation controls span the bottom;
- camera switching is fast;
- pan/zoom controls exist only in SCV;
- switching cameras preserves the common playback cursor;
- switching back to MCV preserves all review state.

SCV should include:

- large selected camera view;
- current camera label;
- previous/next camera buttons and/or camera selector;
- Request/Review metadata;
- Review Response Clock during an active review;
- formal Review Result controls during an active review;
- notes/annotation area;
- timeline;
- full-width playback/navigation toolbar;
- Fit / Zoom controls;
- optional full-screen camera presentation.

---

# 8. Request and Review Controls

Use these exact coach request labels:

- **Chung Review Request**
- **Hong Review Request**

Do not use `Mark Chung` or `Mark Hong`.

Creating one of these creates a server-authoritative-style mock **Request Mark (RM)**.

For a coach request:

```text
Review Window = RM − 5 seconds through RM
```

Visually show:

- RM
- Review Window
- AUR
- RST
- Playback Cursor
- Live Edge

When a request is first marked:

- it is **not yet a formal review**;
- no RST exists;
- the Review Response Clock has not started.

---

# 9. Four Result / Disposition Choices

There are four total possible request/review disposition choices, but they are **not visible simultaneously**.

## Before Start Review

Show only:

- **Resolved without Review**

Hide:

- Accepted
- Rejected
- Rejected: IVR Issue

If `Resolved without Review` is selected:

- preserve the RM and Review Window;
- keep them normally visible on the timeline for the rest of the match;
- do not create an RST;
- do not start the 30-second Review Response Clock;
- record the disposition for audit/history;
- remain in ordinary monitoring/replay operation.

## After Start Review

Hide:

- Resolved without Review

Reveal:

- **Accepted**
- **Rejected**
- **Rejected: IVR Issue**

Selecting any formal Review Result:

- immediately records the decision timestamp;
- immediately stops the Review Response Clock;
- ends the formal review;
- preserves the review event;
- detailed annotations may still be entered afterward.

Do not include detailed IVR Sheet annotation time inside the 30-second review clock.

---

# 10. Start Review / RST / Review Clock

`Start Review` must be visually and behaviorally distinct from creating an RM.

When clicked:

1. select the relevant pending Request Mark / Review Window;
2. create a mock server-authoritative **Review Start Time (RST)**;
3. start the Review Response Clock;
4. retrieve/show replay context;
5. position playback approximately at `RM − 5 seconds`;
6. remain in the current camera view.

**Start Review must NOT force SCV.**

The operator should commonly begin formal review in MCV so they can:

1. locate the AUR;
2. determine the best camera angle;
3. then enter SCV if helpful.

---

# 11. Review Response Clock

Display the Review Response Clock in both MCV and SCV while a formal review is active.

Use these visual ranges:

- `0–10 sec` → blue
- `10–20 sec` → green
- `20–30 sec` → yellow
- `30+ sec` → red

The clock:

- starts at RST;
- keeps running while the operator switches cameras/views;
- stops immediately when a formal Review Result is selected.

The timer is advisory/operational; do not automatically force a result at 30 seconds.

---

# 12. Action Under Review (AUR)

Provide a **Mark AUR** control as part of playback/navigation, not as a generic annotation feature.

Marking AUR:

- uses the current common playback cursor;
- creates a visible timeline marker;
- is preserved while switching MCV/SCV/cameras.

For a coach review, if the AUR is outside the Review Window:

- warn visually;
- do not prevent the operator from marking it;
- preserve the out-of-window marker for audit/context.

---

# 13. Two-Action Requests

Support the use-case behavior for qualifying two-action requests.

Use:

- one review;
- one Review Window;
- one RST;
- one Review Response Clock;
- one AUR marker on the **first action**;
- two requested-issue records/annotations.

The two actions are expected to be **temporally or causally connected**.

Do not create two independent review clocks.

---

# 14. Second-Review Exception

Support the narrow use case where the opposing coach invokes a subsequent review of an action already reviewed.

Behavior:

- the prior Review Window remains visible;
- the new request mark/window appears:
  - in the appropriate Chung/Hong color;
  - on the appropriate side of the timeline;
- annotations distinguish first review from second review when available;
- the second review is **not a continuation** of the first;
- it receives:
  - its own new RST;
  - its own independent 30-second Review Response Clock;
  - its own result;
- preserve linkage between the two reviews for audit/context;
- never overwrite the first review's RM, Review Window, AUR, RST, result, or annotations.

---

# 15. Timeline

The common timeline is one of the most important controls.

It must contain three camera tracks:

```text
CAM 1
CAM 2
CAM 3
```

Use these semantics:

- **light solid line** = video available and currently displayed;
- **dark solid line** = video available but not currently displayed;
- **broken/gapped line** = video unavailable for that interval.

In MCV:

- all three displayed camera tracks are light.

In SCV:

- selected camera track is light;
- other available cameras are darker.

Also display:

- Review Window(s)
- Chung/Hong request marks
- AUR
- RST if useful
- yellow Playback Cursor
- Live Edge
- PSSEL events
- unavailable media gaps

The timeline must remain compact; video area is more important.

---

# 16. PSSEL Timeline Events

PSSEL means **Protective Scoring System Event Listener**.

PSSEL adapters perform upstream filtering.

The IVR client should receive/display only:

- match start
- match stop
- pause
- resume
- scoring events
- penalty events

Display PSSEL events **directly on the common timeline**.

Use clear, small event markers/tooltips.

Clicking an event should move the playback cursor to its timestamp.

The prototype should include mock PSSEL fixtures so this behavior can be exercised.

Do not treat PSSEL events as adjudication.

They are advisory navigation/context information.

---

# 17. Playback / Navigation Controls

Provide a full-width toolbar with controls for:

- `−5 sec`
- `−2 sec`
- `−1 sec`
- previous frame
- play/pause
- next frame
- reverse `0.5×`
- forward `0.5×`
- `1×`
- `2×`
- `5×`
- Mark AUR
- Go Live
- SCV Fit
- SCV Zoom
- optional full screen

All playback controls must operate on the **common playback cursor**.

For the prototype, simulated playback is acceptable.

Use a 30 fps logical frame duration:

```text
1 frame ≈ 33.33 ms
```

---

# 18. Camera Availability and Gaps

Simulate camera integrity states.

The prototype should demonstrate:

- all cameras healthy;
- one camera unavailable;
- a temporary gap on one camera;
- camera recovery.

If a camera is unavailable:

- show a clear camera status overlay;
- show the broken timeline segment;
- disable/mark unusable camera actions where appropriate;
- do not block playback from healthy cameras.

If all useful views are unavailable, allow the operator to select:

- **Rejected: IVR Issue**

Keep this distinct from ordinary `Rejected`.

---

# 19. Rejected vs Rejected: IVR Issue

Do not treat unclear evidence as an IVR system failure.

Prototype examples should distinguish:

## Rejected

Use when:

- video exists but evidence is unclear;
- action is difficult to see;
- the requested action is not established;
- AUR is outside the permitted Review Window as applicable;
- normal rules/procedure require rejection.

## Rejected: IVR Issue

Use for actual replay/system availability problems such as:

- recording malfunction;
- all useful cameras completely blocked/unavailable;
- other configured true IVR failure.

`Rejected: IVR Issue` is a **fixed label**.

Do not make the label configurable in this prototype.

---

# 20. Request History / Previous / Next Review

Provide compact:

- Previous Review
- Next Review

Behavior:

- navigate between Request Marks / review records;
- selecting a prior review restores its Review Window and annotations;
- do not confuse historical navigation with starting a new formal review;
- result/history data should remain immutable in the prototype once finalized, except through an explicit mock admin/reset function.

---

# 21. Post-Review Annotation

After a formal result is selected:

- the 30-second clock stops;
- the review is complete for timed-decision purposes;
- detailed annotation may continue.

Provide fields sufficient to prototype IVR Sheet capture, including where available:

- match number
- round
- action time
- Chung/Hong identity
- request reason
- result
- Review Jury identity
- explanation
- Gam-jeom type if applicable
- notes

Auto-populate anything already known from session/review state.

Do not force the operator to complete this form before the review result can be selected.

---

# 22. Mock Data / Demonstration Scenarios

Include mock fixtures and buttons or a development menu to load several use-case scenarios.

At minimum include:

### Scenario A — Normal Coach Review
- Hong Review Request
- Start Review
- MCV playback
- Mark AUR
- switch to CAM 2 SCV
- frame step
- Accepted

### Scenario B — Resolved Without Review
- Chung Review Request
- issue corrected before Start Review
- select Resolved without Review
- RM remains on timeline
- no RST / no review clock

### Scenario C — AUR Outside Review Window
- coach request
- Start Review
- mark AUR outside RM−5→RM
- warning
- Rejected

### Scenario D — One Camera Gap
- CAM 2 gap
- CAM 1 and CAM 3 usable
- review still completes

### Scenario E — Rejected: IVR Issue
- all relevant camera views unavailable
- select Rejected: IVR Issue

### Scenario F — Referee Last-Five-Seconds Review
- official/referee-origin request
- no coach quota implication
- review of last action

### Scenario G — Second Review
- first review completed
- opposing coach invokes permitted subsequent review
- both marks visible
- second RST and independent review clock

### Scenario H — Two-Action Request
- one Review Window
- one AUR on first action
- two requested issues attached

### Scenario I — PSSEL Navigation
- match start
- scoring events
- penalty
- pause/resume
- click timeline event to seek

---

# 23. Visual Design

Use the supplied mockups as the primary aesthetic guide.

General visual direction:

- dark navy FreePlay header;
- light content panels;
- strong contrast;
- large video areas;
- restrained use of color;
- competition/referee-oriented rather than consumer-video styling;
- compact controls;
- clear hierarchy;
- no unnecessary decorative elements.

Use color semantically:

- Chung / Hong request identity
- Review Window
- AUR
- playback cursor
- live edge
- timer state
- result buttons
- warning/error state

Do not rely on color alone; include labels/icons/tooltips.

Target desktop/Chromebook landscape screens, especially approximately:

```text
1366 × 768
1920 × 1080
```

The interface should remain usable at both.

---

# 24. Accessibility / Operator Efficiency

Because this is used during live competition:

- make interactive targets large enough for rapid operation;
- support keyboard focus;
- include accessible labels/tooltips;
- avoid modal dialogs for routine playback;
- do not block video with unnecessary overlays;
- keep important actions stable in location;
- use confirmation dialogs only where an accidental action would be difficult to recover from.

Favor speed and predictable muscle memory over visual novelty.

---

# 25. Keyboard Integration

Create a simple keyboard command map that calls the same semantic controllers as UI buttons.

Example defaults are acceptable, such as:

```text
Space        Play/Pause
Left         Previous frame
Right        Next frame
Shift+Left   Seek -1 sec
Ctrl+Left    Seek -5 sec
1            CAM 1
2            CAM 2
3            CAM 3
M            MCV
A            Mark AUR
L            Go Live
```

Keep the mapping centralized so it can later be changed.

Do not implement WebHID yet, but design the controller API so a future ShuttleXpress adapter can invoke the same commands.

---

# 26. Prototype Server/API Behavior

Use simple PHP JSON endpoints or a mock service layer.

Suggested endpoints:

```text
GET  /api/match.php
GET  /api/timeline.php
GET  /api/pssel.php
POST /api/review.php?action=create-request
POST /api/review.php?action=start
POST /api/review.php?action=mark-aur
POST /api/review.php?action=resolve-without-review
POST /api/review.php?action=set-result
POST /api/review.php?action=annotate
```

For this prototype:

- persistence may be in PHP session, JSON file, or in-memory client fixtures;
- server-authoritative timestamps may be simulated by PHP `microtime(true)` / ISO timestamps;
- API latency may optionally be simulated;
- use JSON responses consistently.

Keep API access abstract enough that a future FreePlay replay server can replace the prototype endpoints.

---

# 27. Deliverables

Produce a complete working prototype project.

Include:

1. all PHP files;
2. all JavaScript modules;
3. CSS files;
4. mock data;
5. any placeholder media/images;
6. README with setup instructions;
7. architecture overview;
8. list of implemented use cases;
9. list of intentionally mocked/non-production features;
10. clear TODOs for future server integration.

The README should explain how to run locally, for example:

```bash
php -S localhost:8080
```

Then open:

```text
http://localhost:8080
```

---

# 28. Code Quality

Use:

- small modules;
- descriptive names;
- clear separation between:
  - application state;
  - UI rendering;
  - review workflow;
  - playback/navigation;
  - camera/view behavior;
  - timeline rendering;
  - PSSEL events;
  - mock API/server;
- comments for non-obvious workflow logic;
- reusable rendering helpers;
- no duplicated event-handling logic.

Prefer readable code over clever abstractions.

Do not prematurely optimize.

---

# 29. Important Product Semantics

These points are especially important and should not be lost during implementation:

1. **One review → one common timeline → one playback cursor → three synchronized cameras → two ways of viewing them (MCV/SCV).**
2. MCV and SCV are **views**, not workflow states.
3. `Start Review` starts the formal review but **does not change the camera view**.
4. `Resolved without Review` exists only **before** Start Review.
5. `Accepted`, `Rejected`, and `Rejected: IVR Issue` exist only **after** Start Review.
6. Selecting a formal result immediately ends the timed review; detailed annotation may continue afterward.
7. A second permitted review is a **new review** with a new RST and new 30-second clock.
8. PSSEL events appear **on the timeline** and are filtered upstream to match start/stop/pause/resume/scoring/penalty only.
9. MCV prioritizes camera space.
10. SCV prioritizes detailed inspection, frame navigation, pan, and zoom.
11. Missing video is shown explicitly as a gap; never silently conceal it.
12. The UI should support the Review Jury in making a timely decision, not automate adjudication.

---

# 30. Implementation Sequence

Build in this order:

1. project skeleton;
2. application state and mock data;
3. MCV layout;
4. SCV layout;
5. view switching;
6. shared timeline;
7. playback/navigation;
8. RM / Review Window;
9. Resolved without Review;
10. Start Review / RST / review clock;
11. AUR;
12. formal Review Result behavior;
13. PSSEL event markers;
14. camera gap/unavailable states;
15. previous/next review;
16. second-review behavior;
17. two-action request behavior;
18. post-review annotation;
19. keyboard controls;
20. scenario loader / developer controls;
21. responsive cleanup;
22. README and code comments.

At each stage, keep the prototype runnable.

---

# 31. Final Instruction

Do not merely create static HTML that resembles the mockups.

Create a **functional interactive prototype** whose controls and state transitions demonstrate the behavior in the supplied FreePlay requirements and use cases.

When details remain ambiguous, favor:

1. preserving operator flexibility;
2. keeping the review timeline and timestamps intact;
3. avoiding irreversible state changes before a formal result is selected;
4. keeping camera/view behavior independent from review-state behavior;
5. making future rule/interpretation changes easy to accommodate.

Before finishing, walk through every included mock scenario and verify that the UI state transitions are internally consistent.
