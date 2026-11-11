# Current IVR review workflow

This document describes the implemented review UI and API as of November 11, 2026. It consolidates the original workflow and the implemented workflow updates. The code is the authority for current behavior.

The system uses Request Marks (RM), Review Start Times (RST), and Action Under Review (AUR) markers. Review windows, fixed 5/10-second durations, overlap/move confirmations, window navigation, and outside-window AUR warnings have been removed. There is no automatic 20-second eligibility rule.

## 1. Starting the review system and entering match details

1. Open the review page for the appropriate ring and check the match and round.
2. Use **Match** in the Review Request card to change match details when necessary.
3. Use **Start Match/Round** in the playback toolbar to record a new match/round start when appropriate; this requires confirmation.

The bottom timeline labels show elapsed minutes:seconds from the timeline start at 10-second intervals. The timeline start normally comes from the match/round recording start; its source is shown in the timeline heading. Marker tooltips and the heading retain absolute time.

## 2. Creating a review request

1. When the referee announces the request to the IVR operator, click **Chung** or **Hong**, or press **C** or **H**.
2. The initial button press captures server-clock time as RM, regardless of the playback cursor, and displays a provisional timeline marker.
3. In the request modal, choose **Origin** (Coach by default), **Issue type** (Standard by default), and a **Reason**. “Reason pending” is a valid default reason. Origin and issue type are entered in the modal, not the Review Request card.
4. Submit the form or press **Enter** to save the request. **Esc**, Cancel, or closing the modal discards the provisional marker without saving a request. The modal cannot be dismissed while a save is in progress; a failed save leaves it available for retry.

Creating a request does not start formal review or its response clock. The saved RM is a dark blue line for Chung or dark red for Hong. Each request is separate; there is no same-side overlap check.

If neither a request is displayed/selected nor a formal review is active, the new request is automatically **Selected**, and playback pauses at RM. Otherwise it becomes **Pending**, preserving the existing displayed request, camera position, and playback. A displayed completed request also causes a new request to join the queue.

## 3. Select and start the formal review

Selection for display and an **Active** formal review are separate concepts. Selecting a completed request for annotation does not restart formal review.

1. Select an unfinished request in **Pending Review Queue**, or click its RM on the timeline. Selecting a pending request gives it **Selected** status; a previously selected unfinished request returns to **Pending**.
2. Selection seeks to RM and pauses playback. Clicking another annotation marker (AUR or RST) also selects its request and seeks toward that marker, subject to the RM playback limit.
3. Check origin, issue type, reason, and RM in **Review Summary**.
4. Click **Start Review**, or press **S**.

Starting changes the request to **Active**, records server time as RST, holds the timeline end at RST, pauses playback at its current cursor position, and starts the response clock. It does not seek to another point. Only one formal review can be active per ring; selecting another request is blocked until that review is completed or deleted. The timeline background is light blue for an active Chung review and light red for an active Hong review.

Selecting a request alone does not freeze timeline growth. During formal review, the live edge continues to update in the background while the displayed timeline end remains at RST. Camera recording and ingestion continue independently of review playback.

### Seeking, deselection, and live playback

- While a request is selected, seeking, frame stepping, or playing forward is limited to RM. Playback reaching RM stops there. This limit also applies when displaying a completed request.
- Clicking an empty timeline position at or before RM seeks there and retains selection.
- With no formal review active, clicking an empty timeline position after RM deselects the request and seeks to that time, subject to footage availability. An unfinished selected request returns to Pending.
- During formal review, clicking after RM instead parks the cursor at RM and keeps the review selected, with its clock and lock intact.
- **Go Live** (**L**) clears selection and resumes live playback when no formal review is active. During an active review it instead pauses at RM, preserving the active review.

Previous/Next Review navigation uses RM instead of window boundaries. With no request displayed, it finds the nearest earlier/later request relative to the cursor. With a request displayed, it navigates the pending queue. Navigation to another review is blocked during formal review.

Before starting, an unfinished request can instead be **Resolved without Review**. This preserves the request and records the disposition without an RST or formal review duration. It remains displayed until the user navigates away or returns live.

**Delete Request** requires confirmation and removes the request and its markers. The UI offers deletion for unfinished requests, including an active review; deleting an active review releases its lock and allows timeline growth to resume. Finalized requests have no delete button in the UI.

## 4. Find and mark the AUR

1. Inspect footage before RM. Click a camera or press **1**, **2**, or **3** for Single Camera View; press **M** to return to Multi Camera View.
2. Seek using the timeline and backward-seek controls. Use **Space** to play or pause and **Left/Right Arrow** to step frames. Single Camera View also provides zoom, pan, fit, and fullscreen controls.
3. Position the common playback cursor on the action being reviewed.
4. Click **Mark AUR**, or press **A**. The cursor timestamp becomes AUR for the active review, or otherwise for the selected completed review.

AUR can be marked only for an **Active** or **Completed** formal review. A pending or selected unfinished request must first be started; a request resolved without review cannot receive an AUR through this operation.

If AUR already exists, the UI asks for confirmation before replacing it. The server retains the old AUR and its replacement timestamp in AUR history. A completed review's AUR can be replaced without restarting its response clock. No review-window validation or outside-window warning is applied.

When the displayed request has an AUR, a horizontal connector links RM and AUR: light blue at the top of the markers for Chung, or light red at the bottom for Hong. The connector disappears when the request is deselected.

Use **Back to AUR** (**B**) to return the cursor to saved AUR. AUR, RM, and RST are distinct timestamps.

## 5. Report the review result

During an active review, choose one of the result buttons in Review Summary:

- **Accepted**
- **Rejected**
- **Rejected: IVR Issue**

Recording a result changes the review to **Completed**, records the decision time, and calculates response duration from RST to the decision time. Playback returns live, clears selection, and resumes timeline growth. The active-review lock is released so another queued request can be selected and started.

Neither AUR nor completed annotation is required to submit a formal result. The response clock is displayed while the review is active and hidden after finalization. Annotation is a separate step.

## 6. Complete the annotation later

Annotation can be deferred until after the immediate review work. It is available for both **Completed** and **Resolved without Review** requests.

1. Return to the finalized request by selecting its RM on the timeline. Finish any active review before selecting a different request. The pending queue contains unfinished requests, not completed history.
2. In Review Summary, open **Post-review annotation → Complete IVR Sheet**.
3. Check the match number and round, then fill in the Review Jury, request reason, applicable Gam-jeom type, explanation, and notes.
4. Click **Save annotation**. The annotation can be reopened and updated later.

Request side/origin, formal result, and action time are read-only in the form. Action time uses AUR when present, otherwise RM. Match number and round are initially populated from current page context, so check them when returning to an older request.

Existing annotation values populate the jury, reason, Gam-jeom, explanation, and notes fields. Without a saved annotation reason, the form uses the request's first issue; without a saved jury, it defaults to “Prototype Operator.” Unsaved working notes can supply the initial notes value.

Saving annotation does not restart the response clock or change the formal result. It merges submitted annotation fields into the request and records an update timestamp. The annotation reason is stored separately from the original request reason shown in Review Summary.

### Limitation on returning at a later date

The interactive review API currently stores requests, decisions, AUR history, and annotations in PHP session data, grouped by ring. Returning later depends on that session still retaining the request; durable recovery across sessions or dates is not implemented by this API.

The Reviews report reads database records and offers **Open match in IVR**, but that link opens a match and round, not a specific review. The session-backed review API does not load the report's database review into the interactive workflow. Therefore, completing annotation at a later date is currently supported only while the original request remains available in the session and selectable in the UI.

Durable review recovery and annotation across sessions or dates is a forthcoming need, not a currently implemented feature.

## Implementation references

- `public/review/views/review-panel.php`, `review-queue.php`, and `review-summary.php`: request controls, queue, results, and annotation entry point.
- `public/review/includes/modals.php`: request creation, confirmations, match details, and IVR Sheet forms.
- `public/review/views/playback-controls.php`: playback, AUR, live, and match/round controls.
- `public/review/assets/js/app.js`: UI actions, request timestamp capture, modal handling, timeline clicks, media synchronization, summary rendering, and annotation form handling.
- `public/review/assets/js/review-controller.js`: request selection/queuing, formal review transitions, AUR, results, and annotation operations.
- `public/review/assets/js/state.js`: displayed, selected, and active review identities.
- `public/review/assets/js/playback-controller.js`: RM playback limits, live return, and timeline freezing during formal review.
- `public/review/assets/js/timeline-controller.js`: RM/RST/AUR markers, connectors, elapsed-time ticks, and timeline positions.
- `public/review/assets/js/keyboard-controller.js`: keyboard shortcuts.
- `public/review/assets/js/server-clock.js`: server-clock anchoring and elapsed client time.
- `public/review/api/review.php`: review states, request creation/deselection, AUR history, decisions, and annotation validation.
- `public/review/includes/api-common.php`: session storage and selected/active review identities.
- `public/review/report.php`: database-backed review report and match links.
- `deploy/db/schema.sql`: database schema used by the report; interactive review storage remains session-backed.
