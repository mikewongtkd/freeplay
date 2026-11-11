# IVR workflow

This document describes the intended workflow to be implemented as part of the review workflow, UI, and API updates for how users actually use the FreePlay review system. Key changes will include the workflow itself, removal of the review window concept, and Action Under Review (AUR) definition and behavior.

## 1. Starting the review system and entering match details

1. Open the review page for the appropriate ring and check the match and round. Use **Match** in the Review Request card to change match details when necessary.

## 2. Creating a review request

1. Click **Chung** or **Hong** for the requesting side. The keyboard equivalents are **C** and **H**. This creates a request mark (RM).

The current interpretation of the correct procedure is that the request mark indicates the server-clock time when the referee announces the request to the IVR operator, which the IVR operator records by creating a review request. The request mark therefore no longer matches the end of the review window, and in fact the review window requirement of 5 or 10 seconds durations is widely ignored in practical usage. A general rule of thumb is that if the action is 20 seconds or more from the time the coach stands then the request is categorically denied, however this is a guide and not part of the formal procedure, so we cannot account for this in the software system. As a consequence of this updated behavior, we must remove the concept of the review window in the system. By having included an option to delete a request, we have effectively empowered the IVR operator (the user) to make and record this decision.

Creating a request does not start the formal review or its response clock, but should display a modal requiring an origin (coach or referee, with coach as the default response), type (standard or technical, with standard as the default response) and reason (request-reason input). Leaving the default answer as "Reason pending" is a valid response. Creating a request also no longer creates a review window, it simply leaves a review marker line (dark blue for chung, dark red for hong) on the timeline. Clicking on the line selects the review request and the camera views shall show the video at that point in time. Unless there is an active review, clicking the timeline after a selected request's RM deselects the review request and shows the video at that point in time in the camera views. Seeking or playback past the selected request’s RM pauses playback and parks the cursor at RM. During an active review, clicking the timeline past RM does the same and keeps the request selected. While this modal is open, the keyboard shortcut **Enter** key shall submit and close the modal, and the keyboard shortcut **Esc** shall discard the RM and close the modal as if the modal were cancelled. Note that the modal requires a review origin and a type, and therefore these inputs may be removed from the review panel.

A new request is automatically **Selected** upon creation, if there is neither a selected request nor an active review. Otherwise it is **Pending**. A request created with a currently selected request or during an active review joins the queue while the existing selected or active review remains selected and displayed and the camera views remain as they were so the IVR operator can continue the active review.

## 3. Select and start the formal review

1. Select the request in **Pending Review Queue**, if it is not already selected. 
2. Check its origin, issue type, and RM in **Review Summary**.
3. Click **Start Review**, or press **S**.

Starting changes the request to **Active**, records the server time as Review Start Time (RST), freezes the timeline growth, pauses playback (if running), and starts the response clock. Only one formal review can be active per ring. Selecting another request is blocked until the active review is completed. While a review request is active, the timeline changes color to match the request: light blue if the request is for *Chung* (blue) or light red if the request is for *Hong* (red).

Before starting, a request can instead be **Resolved without Review**. This preserves the request and records the disposition without creating an RST or formal review duration. **Delete Request** asks for confirmation and removes the request; the UI offers deletion for unfinished requests, including an active one.

## 4. Find and mark the AUR

1. Inspect footage before the RM. Click a camera or press **1**, **2**, or **3** for Single Camera View; press **M** to return to Multi Camera View.
2. Seek using the timeline and backward-seek controls. Use **Space** to play or pause and **Left/Right Arrow** to step frames. Single Camera View also provides zoom, pan, fit, and fullscreen controls.
3. Position the common playback cursor on the action being reviewed.
4. Click **Mark AUR**, or press **A**. The cursor timestamp becomes the AUR.

AUR can be marked only for an **Active** or **Completed** formal review. A pending or selected request must first be started; a request resolved without review cannot receive an AUR through this operation.

If an AUR already exists, the UI asks for confirmation before replacing it. The server retains the previous AUR and replacement timestamp in AUR history. A completed review's AUR can also be replaced without restarting its response clock.

If a selected RM has an AUR, then a horizontal line shall be shown in the timeline to connect the mark of the RM and the mark of the AUR, showing that the two are connected. The RM's side determines the color and position of the line; above the timeline and touching the top of the AUR and the RM in light blue for chung side, and below the timeline and touching the bottom of the AUR and the RM in light red for the hong side.

Use **Back to AUR** (**B**) to return the cursor to the saved AUR. AUR is a separate marker from RM and RST.

## 5. Report the review result

During an active review, choose one of the result buttons in Review Summary:

- **Accepted**
- **Rejected**
- **Rejected: IVR Issue**

Recording a result changes the review to **Completed**, records the decision time, and calculates the response duration from RST to the decision time. Playback returns to live, which, in turn, deselects any selected review. The active-review lock is released so another queued request can be selected and started.

The current implementation does not require an AUR or completed annotation before accepting a formal result. The result records the review disposition; annotation is a separate step. The response-clock display is shown while the review is active and hidden after finalization.

## 6. Complete the annotation later

Annotation can be deferred until after the immediate review work. It is available for both **Completed** and **Resolved without Review** requests.

1. Return to the finalized request by selecting its RM on the timeline. Finish any active review before selecting a different request. The pending queue contains unfinished requests, so it is not the list of completed reviews.
2. In Review Summary, open **Post-review annotation → Complete IVR Sheet**.
3. Check the match number and round, then fill in the Review Jury, request reason, applicable Gam-jeom type, explanation, and notes.
4. Click **Save annotation**. The annotation can be reopened and updated later.

The form displays the request side/origin, formal result, and action time as read-only fields. Action time uses AUR when present and otherwise falls back to RM. Match number and round are initially populated from the current page context, so check them when returning to an older request. Existing annotation values populate the jury, reason, Gam-jeom, explanation, and notes fields; unsaved working notes can supply the initial notes value.

Saving annotation does not restart the response clock or change the formal result. It merges the submitted annotation into the request and records an annotation update timestamp.
