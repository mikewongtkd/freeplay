# FreePlay IVR Review System Requirements

by Mike Wong, assisted by AI (ChatGPT), September 2026

**Contents:** This document entails the functional and non-functional system requirement specification for the FreePlay Instant Video Replay Review software system.

**Revision note:** Revised after requirements and UI/UX prototype review to clarify the continuous-timeline model, Request Mark/AUR semantics, PSSEL scope, playback speeds, adjacent-media retrieval, timeline bounds, review-window selection and activation, concurrent review requests, appeal-quota behavior, Review Start Time (RST), Multi Camera View (MCV), Single Camera View (SCV), review-clock behavior, live-time approximation, browser-refresh recovery, and camera-feed timeline semantics.

**Audience:** FreePlay developers and system designers

**Scope:** Laptop/browser-based Instant Video Replay (IVR) client, HID peripherals, and the server capabilities required to support it

**Rules basis:** USATKD Kyorugi Rules 2026, Article 21 --- Instant Video Replay

------------------------------------------------------------------------

## 1. Purpose

FreePlay IVR shall provide the Review Jury with rapid access to relevant recorded competition video so that an Instant Video Replay request can be reviewed and a decision communicated within the time constraints established by the competition rules.

The IVR system is one component of FreePlay:

``` text
FreePlay Camera tablets
        |
        | continuous H.264 video
        v
FreePlay Ingestion Server
        |
        | timestamp-based replay service
        v
FreePlay IVR Client
        |
        v
Review Jury
```

The IVR client is expected to run in a reasonably modern version of Google Chrome on an ASUS Chromebook or comparable laptop. Initial development may use keyboard controls in place of the planned Contour ShuttleXpress HID controller.

### 1.1 Core replay model

The IVR client shall present recorded competition video as a **continuously navigable common timeline**. Media segments retrieved from the ingestion server are implementation units used for transport, buffering, and decoding; they shall not impose artificial navigation boundaries on the operator.

The following time concepts are distinct:

- **Request Mark (RM):** The server-authoritative timestamp recorded when the IVR operator marks that a coach or the Center Referee has initiated a potential review request.
- **Review Window:** The rules/operations-relevant interval associated with a Request Mark. Its duration shall be supplied by the applicable ruleset/configuration rather than hard-coded in the client. The current default is five seconds for coach requests and ten seconds for referee requests.
- **Selected Review:** A pending Review Window that the operator has chosen as the next review context. Selection does not start the formal review and does not create an RST.
- **Active Review:** The selected review after the operator activates **Start Review**. A review remains active until its Review Result is recorded.
- **Action Under Review (AUR):** The operator-selected timestamp identifying the action being adjudicated, or the operator's best estimate of that time if the action cannot be located in the available video. For a coach-requested IVR, the AUR shall normally fall within the Review Window.
- **Initial Replay Context:** The media initially retrieved around a Request Mark to allow the Review Jury to locate and understand the AUR. This context may extend beyond the Review Window without expanding the rules-defined scope of the appeal.
- **Playback Cursor:** The current logical time displayed by the player on the common timeline.
- **Review Start Time (RST):** The server-authoritative timestamp recorded when the operator activates **Start Review** for the Selected Review. RST begins the Review Response Clock.
- **Multi Camera View (MCV):** A synchronized view displaying all available camera feeds against the same common timeline and Playback Cursor.
- **Single Camera View (SCV):** A synchronized view displaying one selected camera at the same logical Playback Cursor, with detailed replay navigation, frame stepping, pan, and zoom.

These concepts shall be represented separately in the data model and shall not be treated as interchangeable timestamps or states. MCV and SCV are viewing modes and shall not determine whether a review is pending, selected, or active. More than one pending review request may exist concurrently, including overlapping Chung and Hong requests, but at most one review may be active in a given IVR client/ring workflow at a time.

------------------------------------------------------------------------

# 2. Rules-Derived Operational Constraints

The following constraints should drive the IVR design.

## 2.1 Permitted coach-requested IVR subjects

The system shall support review of video relevant to:

-   penalties against the opponent for:
    -   falling down;
    -   crossing the boundary line;
    -   attacking after **Kal-yeo**;
    -   attacking a fallen opponent;
-   technical points;
-   any penalty against the requesting coach's own contestant;
-   failure to invalidate points after a **Gam-jeom** for a prohibited
    act;
-   incorrect identification by a judge of the contestant making a fist
    attack;
-   an unscored head kick when Head PSS is not in use.

## 2.2 Scope of a coach-requested review

A coach's IVR request is limited to **one action occurring within five seconds of the coach's request**.

The current rules-derived coach Review Window is the five seconds immediately preceding the Request Mark through the Request Mark. The implementation shall not hard-code this duration into UI or replay logic. Instead, the applicable ruleset/configuration shall provide the Review Window duration and the server/review model shall represent explicit window start and end timestamps. Under the current rules, the coach value is five seconds (`RM - 5s` through `RM`). The system shall also make additional preceding context immediately available to help the Review Jury locate and understand the AUR. Additional context does not expand the rules-defined scope of the appeal.

## 2.3 Referee-requested IVR

The system shall also support IVR initiated by the Center Referee, including:

-   review during the final five seconds of a round for possible
    specified Gam-jeom penalties;
-   review following a count after certain head impacts when the head
    PSS did not score;
-   clarification before declaring Gam-jeom for pretending injury;
-   correction of certain clear erroneous decisions or
    contestant-identification/scoring errors during the round.

## 2.4 Limited decision time

The Review Jury is required to inform the Center Referee of the final decision **within 30 seconds of time after receiving the request**.

The IVR workflow shall therefore be optimized for rapid acquisition, review, navigation, and decision-making rather than general-purpose video browsing.

## 2.5 Appeal accounting

The competition rules establish an appeal quota and provide that a successful appeal retains the appeal right.

FreePlay IVR should be capable of representing appeal status if the final system is assigned responsibility for this function, but appeal-quota administration should remain logically separate from basic video playback.

## 2.6 Finality and auditability

Because the Review Jury's decision is generally final, the system should preserve sufficient event metadata to reconstruct what video and time interval were reviewed.

------------------------------------------------------------------------

# 3. Functional Requirements

Requirements use identifiers beginning with **FR**.

------------------------------------------------------------------------

## 3.1 Ring and Contest Context

### FR-001 --- Ring selection

The IVR client shall operate in the context of a selected competition ring.

### FR-002 --- Persistent ring assignment

The client should retain its assigned ring during normal operation so that an operator is not required to repeatedly select the ring for each review.

### FR-003 --- Camera association

The client shall identify the cameras associated with the selected ring.

The current FreePlay architecture assumes up to three cameras per ring:

``` text
CAM 1
CAM 2
CAM 3
```

### FR-004 --- Camera availability

The client shall clearly indicate whether each expected camera is:

-   available;
-   unavailable;
-   disconnected;
-   recording/streaming;
-   paused, if supported;
-   affected by a known recording discontinuity or other condition that may impair review.

### FR-005 --- Contest/round context

Where contest and round metadata are available from FreePlay or another scoring system, the client should associate replay requests with the pertinent contest and round.

The IVR client shall not depend on such integration for basic timestamp-based replay.

### FR-006 --- Protective Scoring System Event Listener (PSSEL)

When available, the system shall provide an endpoint to receive event data from the Protective Scoring System (PSS). The default integration mechanism shall be a webhook endpoint that receives HTTP POST messages containing JSON. Developers may provide additional adapters for PSS systems that use other interfaces.

Each accepted PSS event shall contain, or be mapped by an adapter to, sufficient information to associate the event with the FreePlay timeline and contest context. Where supplied by the source system, this should include:

``` text
match number
round number
pss timestamp
pss display time
freeplay timestamp
round timestamp
round display time
event type
blue points
blue penalties
red points
red penalties
```

Here is an example events notification from the Daedo/TrueScore PSS:

``` text
{
    "matchNumber":"test",
    "roundNumber":1,
    "tkStrikeSystemTimestamp":1435222915812,
    "tkStrikeSystemTimestampStr":"30\/10\/2015 12:33:20:842", 
    "roundTimestamp":1435224374662,
    "roundTimestampStr":"01:51.000",
    "eventType":"BLUE_HEAD_POINT",
    "bluePoints":3,
    "bluePenalties":0,
    "redPoints":0,
    "redPenalties":0
}

```

PSSEL shall not directly modify the authoritative PSS score. Its purpose within IVR is to correlate scoring events with the AUR and to assist the operator in identifying possible scoring corrections that should be communicated to the appropriate scoring official or system.

If an IVR decision causes a *gam-jeom* to be applied, FreePlay shall identify any correlated scoring event by the penalized contestant occurring after the prohibited AUR and present a recommendation for invalidation when applicable. If an IVR decision causes a *gam-jeom* to be removed, FreePlay shall identify any correlated scoring event by that contestant that may previously have been invalidated because of the *gam-jeom* and present a recommendation for reinstatement when applicable.

Any such recommendation shall remain advisory unless a future approved requirement explicitly authorizes FreePlay to modify the scoring system.

**Design note --- temporal correlation risk:** A simple rule such as selecting the next scoring event after the AUR can associate an unrelated later exchange with the reviewed action. The initial implementation may retain the present advisory correlation approach, but this risk shall be documented. Future refinement should consider a constrained temporal neighborhood, event/context matching, and/or explicit operator confirmation before treating a scoring event as causally related to the AUR.

### FR-007 --- Review Response Clock

When the operator activates **Start Review** for a selected Request Mark, the system shall record the server-authoritative Review Start Time (RST) and display a clock labeled **Review Response Time**.

The clock shall show the number of elapsed seconds since RST, counting upward until the Review Result is recorded.

The clock shall use the following visual progression:

``` text
0-10 seconds     blue
10-20 seconds    green
20-30 seconds    yellow
30+ seconds      red
```

The clock shall remain visible while the formal review is active regardless of whether the operator is using Multi Camera View (MCV) or Single Camera View (SCV).

Recording the Review Result shall stop the Review Response Clock and end the active review.


------------------------------------------------------------------------

## 3.2 Creation of an IVR Request

### FR-010 --- Immediate replay request

The operator shall be able to create a Request Mark (RM) for the current ring with a single dedicated operator action. The RM shall be recorded immediately using server-authoritative time.

Due to scoring-system latency, a coach may indicate an intent to request review and then decline or be declined before a formal review begins because the expected score appears shortly afterward. In this case, the RM may remain as an uncommitted timeline annotation and shall not become a formal IVR event unless the referee addresses the request.

If the referee chooses to address the request, the operator shall be able to open the corresponding review immediately. The Review Window shall use the explicit start/end timestamps derived from the applicable ruleset/configuration; under the current coach-request rules this begins five seconds before RM. The Initial Replay Context shall include additional preceding video as specified in FR-013.

### FR-011 --- Server-authoritative request timestamp

The system shall associate the request with a server-authoritative timestamp suitable for locating the corresponding video from all cameras.

### FR-012 --- Five-second rule window

For a coach-requested IVR, the system shall identify and display the explicit Review Window bounds produced from the applicable ruleset/configuration. The current coach ruleset value is five seconds ending at RM (`RM - 5s` through `RM`), but client behavior shall use the supplied start/end timestamps rather than independently hard-coding the subtraction. The system shall make this interval immediately accessible from the Request Mark. Video outside this interval may be reviewed for context as specified in FR-013, but shall not alter the rules-defined Review Window. 

### FR-013 --- Context around the rule window

When a formal review is opened from a Request Mark, the system shall initially retrieve at least the ten seconds preceding the RM. Playback shall initially be positioned at the explicit beginning timestamp of the Review Window. Under the current coach ruleset this is normally `RM - 5s`, but playback logic shall not assume that value is fixed.

The operator shall also be able to navigate to any timestamp between the beginning of the current match's retained recording and the latest video available from the ingestion server. As playback or seeking approaches either boundary of currently buffered media, the client shall automatically request adjacent media so that navigation can continue without a separate explicit retrieval action.

The extra context shall not imply that actions outside the rules-defined review scope are themselves reviewable.

### FR-014 --- Identification of the Action Under Review

When the operator finds the Action Under Review (AUR), or the best estimate of where the AUR would occur if the action cannot be located in the available video, the operator shall mark its server-authoritative timeline position. Each review window shall contain at most one current AUR mark; replacing that mark shall preserve only the newest AUR as the active AUR for the review record. For a coach-requested IVR, the system shall warn the operator if the selected AUR falls outside the Review Window.

### FR-015 --- Referee-requested review

The system shall permit a replay to be initiated as a referee-requested review rather than a coach appeal. The system may reuse the same review procedure, but the request shall be recorded with **Referee** origin and shall not consume or modify either coach's appeal quota. Review Jury, Technical Delegate, or CSB direction that a review be opened shall be operationally conveyed through the Center Referee and shall therefore remain a Referee-origin review.

### FR-016 --- Request origin

Each IVR request shall record an **Origin** with exactly one of the following values:

``` text
Coach
Referee
```

The requesting side (Chung or Hong) shall be represented separately from Origin. Review Jury, Technical Delegate, or CSB direction to open a review shall be executed through the Center Referee and recorded with Origin = Referee rather than creating additional origin values.

### FR-017 --- Review reason

The system should permit selection or recording of the reason for review.

Suggested reason categories should correspond to Article 21 where practical.

### FR-018 --- Rapid initiation

The review is initiated when the operator has placed one or more Request Marks, has a Review Window selected, and activates a button labeled **Start Review**.

If exactly one pending Review Window exists and none is selected, the client may automatically select it. If two or more pending Review Windows exist, the operator shall explicitly select which one is to be reviewed first; the system shall not choose the order on the operator's behalf.

Activating **Start Review** shall transition the Selected Review to the Active Review and shall:

- record the server-authoritative Review Start Time (RST);
- start the Review Response Clock defined in FR-007;
- request the replay media corresponding to the selected Review Window;
- position playback at the explicit beginning timestamp of that Review Window;
- freeze the normal timeline right bound at RST for the duration of the Active Review;
- preserve Multi Camera View (MCV) as a valid initial review view rather than forcing a camera selection.

While a review is active, selection or activation of any other pending Review Window shall be disabled. Other pending Review Windows shall remain visible. The operator shall complete the Active Review by recording its Review Result before another pending review can be selected and started.

The operator shall be free to remain in MCV, enter Single Camera View (SCV), switch among cameras, or return to MCV at any time during the Active Review.

Creating or initiating a replay request shall not require the operator to complete administrative metadata before video can be viewed.

Administrative fields may be completed or confirmed while or after video is being acquired.


### FR-019 --- Orthogonal request classification

The request model shall represent the following dimensions independently rather than collapsing them into a single request-type value:

``` text
Side:       Chung | Hong
Origin:     Coach | Referee
Issue Type: Non-Technical | Technical
Reason:     selected/recorded review reason
```

Side identifies which contestant/request lane the Review Window belongs to. Origin identifies whether the request came from a coach or the Center Referee. Issue Type identifies whether the request uses the normal red/blue-card workflow or the technical/green-card workflow.

The UI may present these dimensions using compact controls, but the data model and server API shall preserve them separately.



------------------------------------------------------------------------

## 3.3 Timestamp-Based Video Retrieval

### FR-020 --- Timestamp query

The IVR client shall be able to request video from the ingestion server using a time-based request.

Conceptually:

``` text
ring
target timestamp
start/before interval
end/after interval
```

### FR-021 --- Multi-camera response

A replay request shall resolve the corresponding video interval for every available camera assigned to the ring.

### FR-022 --- Common replay timeline

All camera views shall be presented against a common server-authoritative replay timeline.

### FR-023 --- Decodable starting point

The server shall provide video beginning from an appropriate H.264 decoding boundary/keyframe even when the requested logical start time occurs between keyframes.

### FR-024 --- Requested logical time

The IVR client shall distinguish the requested logical replay interval from any additional encoded media that must be delivered to establish a decodable starting point.

### FR-025 --- Recent-video retrieval

Video from the server's recent replay cache should be retrievable with the lowest practical latency.

### FR-026 --- Recorded-video retrieval

The same logical replay operation shall be capable of retrieving video that has aged out of the RAM replay cache and must be obtained from recorded/indexed storage.

### FR-027 --- File-boundary transparency

The client shall not require the operator to know whether a replay interval crosses:

-   GOP boundaries;
-   fMP4 fragment boundaries;
-   physical recording-file boundaries.

### FR-028 --- Retrieval failure

If some or all of the requested interval cannot be retrieved, the client shall identify the affected camera/time range rather than silently presenting incomplete video as complete.

------------------------------------------------------------------------

## 3.4 Video Playback

### FR-030 --- Play

The operator shall be able to play replay video forward at 50%, 100%, 200%, and 500% of normal speed and to review video in reverse at an effective 50% of normal speed.

As playback approaches the bounds of the media currently buffered by the IVR client, the client shall automatically request adjacent video from the ingestion server so that playback can continue across GOP, fragment, and physical recording-file boundaries without a separate operator retrieval action.

### FR-031 --- Pause

The operator shall be able to pause replay video.

### FR-032 --- Seek

The operator shall be able to seek to a position within the available replay interval. See section 3.6 for further functional requirements on how to seek.

### FR-033 --- Frame stepping

The operator shall be able to move forward and backward through video at approximately frame-level granularity where supported by the playback implementation.

### FR-034 --- Variable-speed review

The required continuous forward playback rates shall be 0.5×, 1×, 2×, and 5×. The required effective reverse review rate shall be 0.5×. These rates are authoritative for the initial IVR implementation; additional rates may be added later without removing the required rates.

### FR-035 --- Reverse review

The system shall support effective reverse review at 0.5× and discrete backward navigation consisting of one-frame backward scrubbing and repeated backward seeks of 1 second, 2 seconds, or 5 seconds per control interval. The implementation may use native reverse playback, decoded-frame caching, repeated seeking, or another technique, provided the operator-observable behavior satisfies these controls.

### FR-036 --- Return to key timeline points of interest

The operator shall be able to rapidly return to the original replay/request point (beginning of the review window). The operator shall also be able to rapidly return to any identified action under review.

### FR-037 --- Replay window indication

The UI shall show the operator where the current playback position lies relative to:

-   the available video interval;
-   the request timestamp;
-   the Review Window.

### FR-038 --- Playback state

The client shall clearly indicate whether playback is:

``` text
playing
paused
seeking/loading
frame stepping
unavailable/error
```

### FR-039 --- Pan and Zoom

When in single-camera review mode, the system shall allow the operator to use the mouse to indicate a focal point for zoom in and out operations, as well as offer a button to click to reset the focal point to the center of the video.

------------------------------------------------------------------------

## 3.5 Multi-Camera Review

### FR-040 --- Multi Camera View (MCV)

The client shall provide a Multi Camera View (MCV) that displays all available cameras assigned to the selected ring simultaneously.

All camera feeds shown in MCV shall be synchronized to the same server-authoritative common timeline and Playback Cursor.

MCV shall be available both while awaiting a formal review and while a formal review is active.

### FR-041 --- Single Camera View (SCV)

The client shall provide a Single Camera View (SCV) that displays one selected camera at the same logical Playback Cursor used by MCV.

SCV shall provide detailed replay controls appropriate for close inspection of the AUR, including frame-by-frame navigation, variable-speed playback, pan, and zoom.

### FR-042 --- Free switching between MCV and SCV

The operator shall be able to switch freely between MCV and SCV during an active review without changing:

- the selected Review Window;
- the Request Mark;
- the Action Under Review;
- the Review Start Time;
- the Review Response Clock;
- the current Playback Cursor;
- the active-review state.

### FR-043 --- Camera selection

From MCV or SCV, the operator shall be able to select CAM 1, CAM 2, or CAM 3 where available.

Selecting a camera from MCV shall open or focus that camera in SCV at the same logical Playback Cursor.

### FR-044 --- Timeline-preserving camera switch

Switching among cameras in SCV shall preserve the current logical replay time.

Example:

``` text
CAM 1 @ T + 1.233 s
       |
       | select CAM 2
       v
CAM 2 @ the same common-timeline event time
```

### FR-045 --- Rapid switching

Camera and view switching shall be fast enough to be useful within the 30-second decision workflow.

### FR-046 --- Camera identification

The camera or cameras currently displayed shall always be visually obvious.

### FR-047 --- Unavailable camera

An unavailable camera shall be visibly disabled or marked unavailable rather than producing an ambiguous blank player.

A recording defect in one camera shall not prevent review from the other available cameras.

### FR-048 --- Camera synchronization warning

If known synchronization quality between cameras is outside the accepted tolerance, the client shall warn the operator.


------------------------------------------------------------------------

## 3.6 Timeline annotation and navigation

### FR-050 --- Indicating the time

Time shall be displayed as a common timeline, which shall be visible in all views and at all times. 

The left bound shall be, in order of preference and depending on the availability of metadata and video: (1) up to 30 seconds prior to the start of the current round for the current match; (2) the most recent start of video recording; or (3) if there are no video available, the time the review page was first opened for a given ring, match, and round.

The right bound shall be state-dependent:

1. while no formal review is active, the right bound shall track the current approximated server time/live edge;
2. when **Start Review** is activated, the right bound shall freeze at that review's RST so that timeline annotations and interactive targets do not move during adjudication;
3. when the Review Result is recorded, the client shall exit the frozen review timeline, restore the right bound to the current approximated server time, and return playback to the live edge unless the operator has explicitly entered a historical-review/reopen workflow.

The transition back to live shall not erase the completed review's timeline annotations or audit record.

The beginning of the current match may be established, in order of preference, by: (1) explicit match-start metadata received from an integrated scoring/tournament system; or (2) an operator-created match-start action when such integration is unavailable. Camera recording may begin before match start, but pre-match video is not required to be shown on the normal match timeline unless the operator explicitly navigates to retained earlier media. If the start is not established by the scoring system or the operator, the start of the recording shall be the default value for the match start.

The timeline shall contain a line for each camera indicating intervals when that camera stream was available, displayed, not displayed, paused, disconnected, or otherwise unavailable. Camera timeline tracks shall use the following visual semantics:

``` text
light solid line     camera video available and currently displayed
dark solid line      camera video available but not currently displayed
broken/gapped line   camera video unavailable for that interval
```

In MCV, all displayed camera tracks shall use the light solid treatment. In SCV, the selected camera track shall use the light solid treatment while other available camera tracks shall use the darker solid treatment.

A yellow Playback Cursor shall indicate the current logical playback position. During live viewing, the cursor shall track the rightmost available server time.

The operator shall be able to click a valid point on the timeline to move the playback cursor to that logical time. The client shall initially request a 10-second navigation segment centered on the selected point (5 seconds before and 5 seconds after), subject to available recording bounds. This navigation segment is a buffering/retrieval unit and shall not restrict continuous navigation to adjacent retained media.

### FR-051 --- Annotating the timeline with review windows

At any time, the operator shall be able to create a Request Mark for Chung or Hong. More than one pending Request Mark/Review Window may exist concurrently. In particular, Chung and Hong coaches may raise their cards at approximately the same time, producing overlapping or near-simultaneous Review Windows.

The system shall present a button for **Chung Review Request** and **Hong Review Request** to create the Request Mark. A radio toggle button group labelled **Origin** with two buttons labelled **Coach** and **Referee** shall indicate the request origin, and a switch labelled **Issue Type** with two states: (default) **Non-Technical (Red or Blue Card)** and **Technical (Green Card)** shall indicate whether the request concerns a technical issue.

Review Window duration shall be determined by the applicable ruleset/configuration and represented by explicit start and end timestamps. The current defaults are:

``` text
Coach origin      5 seconds ending at RM
Referee origin   10 seconds ending at RM
```

The IVR client shall not derive Review Window boundaries from hard-coded `RM - 5s` or `RM - 10s` logic when explicit window bounds are available from the server/review model.

The Chung Review Window shall be shown by default in a shade of blue above the timeline, and the Hong Review Window shall be shown by default in a shade of red below the timeline. If a request is designated as a technical issue, its window shall be shown by default in a shade of green. Referee-origin requests shall be visually distinguishable from coach-origin requests.

Request Marks, Review Windows, and AUR marks belonging to different reviews are independent timeline annotations and may overlap in time or occupy the same timestamp. The UI shall render such overlaps without merging the underlying review records or implying that one annotation invalidates another.

On creating a Request Mark, the system shall make the corresponding pending Review Window selectable. When exactly one pending window exists, **Start Review** may act on that window as described in FR-018. When multiple pending windows exist, the operator shall select which Review Window is to be handled first.

Clicking a pending review-window annotation shall select that window without changing its timestamps. Selecting a previous or next pending Review Window shall change the selected review context and shall move playback to the beginning of that selected window unless the operator explicitly continues playback at the current position.

At most one pending Review Window shall be designated as the Selected Review at a time. Once **Start Review** is activated, that Selected Review becomes the Active Review. While an Active Review exists:

- no other pending Review Window may be selected;
- Previous/Next Review selection commands shall be disabled or ignored for changing review context;
- other pending Review Windows shall remain visible;
- new Request Marks may still be recorded if operationally necessary, but they shall remain pending and shall not interrupt or replace the Active Review;
- the operator shall record the Active Review's Review Result before selecting the next pending review.

After the Active Review is completed, review selection shall be re-enabled and the operator may choose the next pending review. The system shall not impose Chung-first, Hong-first, oldest-first, or newest-first ordering when more than one pending review exists; review order is an operator/Review Jury decision.

Review windows shall be selectable by mouse interaction and by semantic keyboard/HID commands when selection is enabled.

### FR-052 --- Annotating the timeline with action under review

Each review window shall support one active Action Under Review (AUR) mark. The operator shall be able to create or replace the AUR using mouse interaction or a semantic keyboard/HID command at the current playback-cursor time.

If an AUR is created for a window that already has an AUR, the new mark shall replace the previous active AUR. The operator shall be able to return playback to the AUR by mouse interaction or keyboard/HID command. For coach-requested reviews, an AUR outside the Review Window shall be visibly flagged to the operator.

### FR-053 --- Live Time Approximation

The ingestion server shall notify the IVR Review system on the following events:

- camera start recording
- camera stop recording
- any PSSEL event

These notifications shall carry the server timestamp, which shall be used to re-anchor the IVR Review system clock.

Between server notifications, the browser shall approximate current server time by adding elapsed monotonic browser time to the most recently received server timestamp. In JavaScript, elapsed time shall be based on `performance.now()` or an equivalent monotonic high-resolution clock rather than `Date.now()` so that local wall-clock adjustments do not corrupt the approximation.

Conceptually:

``` text
serverNowApprox =
    lastServerTimestamp +
    (performance.now() - performanceNowAtLastServerTimestamp)
```

Each new server timestamp shall replace/re-anchor this approximation. The implementation shall treat server timestamps as authoritative and browser elapsed time only as an interpolation mechanism between server notifications.

A browser refresh/restart resets the local monotonic clock origin; after reconnect, the client shall establish a new server-time anchor rather than attempting to continue a pre-refresh `performance.now()` delta.

### FR-054 --- Pending, selected, and active review state

Each review request shall have an explicit workflow state sufficient to distinguish at least:

``` text
pending
selected
active
completed
resolved_without_review
```

A Selected Review is a pending request chosen by the operator as the next review to process. Activating **Start Review** transitions that review to Active and records RST. Recording a formal Review Result transitions the Active Review to Completed. A request handled before formal review may transition to `resolved_without_review` without ever becoming Active.

At most one review may be Selected and at most one review may be Active in the same ring/client workflow at a time. Multiple other requests may remain pending concurrently.

Persistent/server-side review state shall be identified by review/event ID rather than inferred from visual ordering, latest timestamp, or browser-only selection state.



------------------------------------------------------------------------

## 3.7 Replay Scrubbing and Operator Controls

### FR-060 --- Keyboard operation

The initial IVR implementation shall provide keyboard commands sufficient to perform the core replay workflow without specialized hardware.

At minimum, keyboard controls shall support:

-   play/pause;
-   camera selection;
-   switch between MCV and SCV;
-   pan up/down/left/right;
-   zoom in;
-   zoom out;
-   reset focal point to center of video;
-   mark action under review;
-   mark chung review request;
-   mark hong review request;
-   return to beginning of current (or latest if none selected) request window;
-   return to action under review mark;
-   activate Start Review when enabled;
-   open the Review Result annotation control.

### FR-061 --- Timeline annotation and review-navigation controls

The IVR UI/UX shall provide controls for timeline annotation and review navigation.

Before a formal review is active, the operator shall be able to:

- mark chung review request;
- mark hong review request;
- select previous request window;
- select next request window;
- return to the beginning of the current or latest Review Window.

During an active review, the operator shall be able to:

- mark or replace the AUR at the current Playback Cursor;
- return to the beginning of the selected Review Window;
- return to the AUR;
- switch between MCV and SCV;
- switch among available cameras.

General request annotation controls are not required to remain visible during an active review. **Mark AUR** shall remain available because it is part of replay navigation and review resolution.


### FR-062 --- Video replay and navigation controls

The IVR UI/UX shall display a button group to support the following functionality related to video replay and navigation. In MCV, playback/navigation commands shall act on all displayed camera feeds synchronously. In SCV, they shall act on the selected camera while preserving the common Playback Cursor:

-   play/pause;
-   seek backwards at -5s each second;
-   seek backwards at -2s each second;
-   seek backwards at -1s each second;
-   play backwards at 50% speed;
-   play forwards at 50% speed;
-   play forwards at 100% speed;
-   play forwards at 200% speed;
-   play forwards at 500% speed;
-   scrub backward (go back one frame);
-   scrub forward (go forward one frame);

### FR-063 --- Pan and Zoom controls

The IVR UI/UX shall display a button group in SCV to support the following functionality related to detailed camera inspection:

-   zoom in;
-   zoom out;
-   return to 100% zoom;
-   pan up;
-   pan down;
-   pan left;
-   pan right;
-   return to center;

### FR-064 --- Complete request annotation

The IVR UI/UX shall display buttons to display modal dialogs form that support the following functionality related to request annotation:

-   **Division dialog:** age, belt rank, gender, weight class, difficulty (for black belts only; optional)
-   **Match dialog:** match number, chung contestant name and team, hong contestant name and team
-   **Request dialog:** request reason, request origin, request result, quota update, further recommendations

**Request reason:**

-   Gam-jeom for opposing player
    -   Falling
    -   Crossing the Boundary Line
    -   Attacking After Kal-yeo
    -   Attacking the Fallen Opponent
-   Invalidation of Technical Points
-   Invalidation of points following a Gam-jeom
-   Invalidate Gam-jeom & points reinstated
-   Restore points scored before a Gam-jeom
-   Gam-jeom given to the wrong player
-   Punch Misidentification
-   Request for points
    -   Technical points
    -   Head kick
-   Technical Issue
    -   Phantom points
    -   Time management
    -   PSS test
    -   Scoreboard entry

**Referee IVR requests:**
- Pretending Injury
- Request for last action
- Request for scoring event prior to knockdown

**Request result:** Results may be: (1) Accepted; (2) Rejected; (3) Rejected: IVR Issue; (4) Resolved without Review

The **Review Result** annotation control shall be readily accessible in both MCV and SCV while a formal review is active. Recording the Review Result shall:

- record the decision and decision timestamp;
- stop the Review Response Clock;
- end the active review;
- preserve the completed review record for auditability.

**Quota Update:** FreePlay shall track the coach appeal quota associated with each contest when contest/review metadata are being recorded. For coach review requests, if the review decision is accepted, the appeal right is retained and the quota card is returned to the coach. If the review decision is rejected, the appeal is consumed and the quota card is removed from play (i.e. the referee keeps the card). Referee review requests do not affect either coach's appeal quota.

Article 21 does not specify the procedure when a review cannot be decided for technical reasons (for example, the cameras did not capture usable footage or the action occurred off-screen). FreePlay shall support the local operational disposition **Rejected: IVR Issue** and shall record that disposition separately from an ordinary rejected appeal. Under the current project workflow, this disposition returns the quota card to the coach. This behavior is an operational policy rather than a rule stated in Article 21 and shall remain configurable if governing policy changes. 

Further recommendations: If the review causes a *gam-jeom* to be given, then any scoring technique from the penalized player that occurs immediately after the action under review should be recommended for invalidation (i.e. "Invalidate scoring event for X points"). If the review causes a *gam-jeom* to be removed, then any points from a scoring technique from the pardoned player that occurs immediately after the action under review should be reinstated, if they were previously invalidated.

### FR-065 --- HID-independent command model

Replay commands shall be represented internally as semantic actions rather than being tied directly to keyboard events.

Example actions:

``` text
PLAY_PAUSE
JOG_REV_050
SCRUB_BACKWARD
SCRUB_FORWARD
MARK_ACTION
MARK_CHUNG
MARK_HONG
SEEK_1S_BACKWARD
SEEK_1S_FORWARD
SEEK_2S_BACKWARD
SEEK_2S_FORWARD
SEEK_5S_BACKWARD
SEEK_5S_FORWARD
SELECT_CAMERA_1
SELECT_CAMERA_2
SELECT_CAMERA_3
JUMP_TO_REVIEW_WINDOW_START
JUMP_TO_ACTION_UNDER_REVIEW
SET_PLAYBACK_RATE
SWITCH_TO_MCV
SWITCH_TO_SCV
START_REVIEW
OPEN_REVIEW_RESULT
```

### FR-066 --- Future ShuttleXpress support

The architecture shall permit a future Contour ShuttleXpress/WebHID adapter to invoke video replay speed and navigation commands.

### FR-067 --- Future Jog behavior

The control model shall support discrete relative movement appropriate for a physical jog wheel.

### FR-068 --- Future Shuttle behavior

The control model shall support variable-speed/directional playback appropriate for a spring-loaded shuttle ring.

------------------------------------------------------------------------

## 3.8 Review Decision Workflow

### FR-070 --- Review timer

The Review Response Clock shall use RST as its authoritative start time and shall stop when the Review Result is recorded, as defined in FR-007. If the browser reconnects or refreshes during an Active Review, the elapsed review time shall be reconstructed from the server-authoritative RST and current server time; the clock shall not restart from zero.


### FR-071 --- 30-second awareness

The UI shall provide clear awareness of the 30-second decision requirement without obstructing video review. The Review Response Clock shall remain visible in both MCV and SCV while a formal review is active.

### FR-072 --- Decision recording

During a formal review, the system shall permit the authorized operator to record the Review Result using the Request Result values defined in FR-064.

Recording the Review Result shall end the Active Review, stop the Review Response Clock, release the review-selection lock, restore the normal live timeline right bound, and return playback to the live edge as defined in FR-050.

Final terminology shall be aligned with the approved operational workflow.


### FR-073 --- Decision timestamp

A recorded decision shall include its timestamp.

### FR-074 --- Decision finalization

Once finalized, a review record should be protected against accidental alteration.

### FR-075 --- Appeal retention

When coach appeal metadata are being recorded, the system shall track the coach's appeal state for the contest. A successful appeal shall retain the appeal right; an ordinary unsuccessful appeal shall consume it. A referee/official request shall not modify coach appeal state. A **Rejected: IVR Issue** disposition shall follow the operational policy defined in FR-064.

### FR-076 --- Referee-request distinction

Referee-requested IVR shall not incorrectly consume a coach's appeal quota.

------------------------------------------------------------------------

## 3.9 Review Event Record / Audit Trail

### FR-080 --- Replay event record

The system shall create or promote a persistent replay-event record when a pending/uncommitted Request Mark is selected and accepted for formal IVR review. The event shall preserve its workflow state (pending/selected/active/completed as applicable). An uncommitted Request Mark that is never addressed by the referee may remain only as a transient or non-formal timeline annotation and shall not be required to consume appeal quota.

### FR-081 --- Event metadata

Where available, the record should include:

``` text
event/replay ID
ring
contest ID
round
request timestamp
review start time (RST)
requesting side/official
reason
requested logical time window
AUR timestamp
cameras available
cameras reviewed
decision
decision timestamp
review duration derived from RST to decision timestamp
operator/review jury identity if available
```

### FR-082 --- Media reference

The event record should reference the server timeline/video needed to reproduce the review rather than requiring a duplicate standalone video file.

### FR-083 --- Reproducibility

An authorized user should be able to reopen a stored IVR event and retrieve the same relevant recorded interval while the underlying tournament recording remains available.

### FR-084 --- Integrity information

Known gaps, incomplete GOPs, synchronization warnings, or unavailable camera angles relevant to the review should be retained with or derivable from the event record.

------------------------------------------------------------------------

## 3.10 Server/Client Communication

### FR-090 --- Replay service boundary

The IVR client shall obtain replay media through a defined replay service/API rather than reading the ingestion server's recording filesystem directly.

### FR-091 --- Time-range request

The server API shall support requesting a replay interval by ring/camera and server-authoritative time.

### FR-092 --- Replay metadata

The server shall return sufficient metadata for the client to understand:

``` text
requested interval
available interval
camera identity
timeline mapping
media source/segments
quality/discontinuity state
```

### FR-093 --- Media delivery

The replay protocol shall use browser-compatible media delivery suitable for low-latency playback in modern Chrome.

The precise media transport remains to be specified.

### FR-094 --- Control/media separation

The architecture should permit control/API messages and video media to use different transport mechanisms where appropriate.

### FR-095 --- No direct filesystem dependency

The browser shall not require knowledge of server file paths, GOP database rows, or physical recording-file organization.

### FR-096 --- Concurrent ingest and replay

Replay requests shall operate while the ingestion server continues recording all active cameras.

### FR-097 --- Multiple IVR clients

The server architecture should support simultaneous IVR clients assigned to different rings without one client's replay operation changing another client's state.

------------------------------------------------------------------------

## 3.11 Camera Control from IVR --- Reserved Capability

The project intends eventually to permit authorized IVR/server workflows to send commands to camera tablets through the ingestion server.

### FR-100 --- Server-mediated camera control

Any browser-initiated camera command shall be sent to the FreePlay server, which shall communicate with the camera over its existing bidirectional ingestion connection.

The IVR browser shall not directly connect to individual tablets.

### FR-101 --- Pause/resume capability

The architecture shall reserve support for remotely pausing and resuming a camera stream.

### FR-102 --- Clean resume

Resuming a paused H.264 stream shall establish a clean decoding boundary, including a fresh keyframe and codec configuration where required.

### FR-103 --- Authorization

Camera-control commands shall be treated as privileged operations.

Detailed camera-control UI and workflow are outside the immediate replay MVP unless subsequently approved.

------------------------------------------------------------------------

# 4. Non-Functional Requirements

Requirements use identifiers beginning with **NFR**.

------------------------------------------------------------------------

## 4.1 Performance

### NFR-001 --- Decision-oriented performance

The complete IVR workflow shall be designed around the rule requirement that the Review Jury communicate its decision within 30 seconds.

### NFR-002 --- Replay startup latency

For video still present in the recent replay cache, the target time from replay request to usable video should be **less than one second on a healthy tournament LAN**.

This is an engineering target, not a rules-derived value.

### NFR-003 --- Camera-switch latency

Switching among already-buffered camera angles shall preserve the common-timeline position and shall display the destination camera without requiring the replay request to be re-entered. The acceptance-test latency threshold shall be set during prototype performance testing; until then, camera-switch latency shall be measured and reported rather than described as "immediate".

### NFR-004 --- Seek responsiveness

Normal seek/jog operations shall provide visual feedback quickly enough to support the 30-second review workflow. Seek/jog response latency shall be measured during prototype testing, and a numeric acceptance threshold shall be adopted before release qualification.

### NFR-005 --- No server transcoding dependency

Normal replay shall not require real-time server transcoding.

### NFR-006 --- Concurrent operation

Replay processing shall not materially disrupt continuous camera ingestion or recording.

------------------------------------------------------------------------

## 4.2 Timing and Synchronization

### NFR-010 --- Common timeline

Multi-camera replay shall use a server-authoritative common timeline.

### NFR-011 --- Device-clock independence

The design shall not assume that raw Android monotonic timestamps from different tablets share a common epoch.

### NFR-012 --- Synchronization target

At 30 fps, the engineering target should be approximately one frame of relative alignment where practical.

Initial validation thresholds may use:

``` text
PASS: <= approximately 33 ms
WARN: >33 ms and <=100 ms
FAIL: >100 ms
```

These thresholds are project engineering criteria and may be revised after testing.

### NFR-013 --- Synchronization transparency

Known synchronization uncertainty shall not be concealed from the Review Jury/operator.

------------------------------------------------------------------------

## 4.3 Reliability and Fault Tolerance

### NFR-020 --- Partial camera failure

Failure of one camera shall not prevent replay from remaining available cameras.

### NFR-021 --- Network interruption

The IVR client shall recover gracefully from temporary server/network interruptions.

### NFR-022 --- No silent corruption

Missing or incomplete media shall be reported rather than silently represented as complete video.

### NFR-023 --- Server continuity

An IVR request shall not pause or otherwise interfere with recording of unrelated rings/cameras.

### NFR-024 --- Browser refresh/restart

A formal IVR event already recorded by the server shall remain recoverable after a browser refresh or IVR-client restart.

If a refresh/restart occurs during an Active Review, reconnecting the client shall restore, from server-authoritative state where available:

- the Active Review/event ID;
- its Request Mark and explicit Review Window bounds;
- RST;
- current AUR, if one has been marked;
- request side, Origin, Issue Type, and reason metadata already recorded;
- result state (which shall remain unset if no decision has yet been recorded);
- pending review requests for the same ring/contest.

The Review Response Clock shall resume from the elapsed time derived from RST and current server time and shall not restart from zero. Browser-local state such as `performance.now()` anchors shall be re-established after reconnect.

Restoring the exact pre-refresh Playback Cursor is desirable but is secondary to restoring the authoritative review/event state and clock correctly.

### NFR-025 --- Deterministic state

The server, rather than transient browser state, shall be authoritative for persistent replay-event records and formal review workflow state, including Active Review identity, RST, recorded result, and persistent annotations.

------------------------------------------------------------------------

## 4.4 Usability

### NFR-030 --- Officiating-first interface

The IVR interface shall be optimized for an official performing a time-critical review, not for general-purpose video editing.

### NFR-031 --- Minimal interaction

The common workflow of marking one or more requests, selecting the next request to review, starting the review, locating/marking the AUR in MCV, selecting and inspecting camera angles in SCV, switching freely between views, and recording the Review Result shall be executable without mandatory entry of administrative metadata during active video review. While an Active Review exists, controls for selecting another review shall be disabled or otherwise made unavailable so that the operator cannot accidentally change review context. Operator action counts for representative workflows shall be documented during use-case validation and used to identify avoidable interaction steps.

### NFR-032 --- Large, unambiguous controls

Critical controls and status indicators shall be easily identifiable under tournament conditions.

### NFR-033 --- Keyboard-first MVP

The MVP shall be fully operable using a conventional Chromebook keyboard.

### NFR-034 --- Future physical controller

The interaction architecture shall support the Contour ShuttleXpress through Chrome WebHID without requiring the replay engine to understand HID-specific events.

### NFR-035 --- Visual focus

Administrative metadata shall not compete visually with the video during active review.

### NFR-036 --- Error clarity

Errors shall state what is unavailable and, where practical, what the operator can do next.

------------------------------------------------------------------------

## 4.5 Platform and Browser Compatibility

### NFR-040 --- Primary client platform

The primary IVR client target shall be an ASUS Chromebook or comparable ChromeOS laptop.

### NFR-041 --- Browser

The application shall run in the current stable version of Google Chrome available for the supported ChromeOS device at release qualification. The tested Chrome and ChromeOS versions shall be recorded with each release.

### NFR-042 --- Browser application

The IVR client shall not require local Node.js, shell access, native executable installation, or an Electron application.

### NFR-043 --- Web standards

Video playback and device integration should use browser-supported technologies wherever practical.

### NFR-044 --- Current development transport

During initial IVR development, the system may use:

``` text
http://
ws://
```

on the isolated FreePlay development/tournament LAN.

### NFR-045 --- Future secure transport

The architecture shall permit migration to:

``` text
https://
wss://
```

using the planned FreePlay private CA without redesigning IVR application semantics.

------------------------------------------------------------------------

## 4.6 Scalability

### NFR-050 --- Tournament scale

The replay architecture shall coexist with the FreePlay target of up to:

``` text
14 rings
3 cameras per ring
42 camera streams
```

### NFR-051 --- Per-ring isolation

Replay activity on one ring should not materially degrade replay or ingestion on another ring.

### NFR-052 --- Multiple simultaneous reviews

The server should support multiple concurrent IVR clients/reviews subject to measured server/network capacity.

### NFR-053 --- Bounded resources

Client and server replay buffers shall be bounded.

------------------------------------------------------------------------

## 4.7 Maintainability and Modularity

### NFR-060 --- Separation of concerns

The IVR implementation shall separate:

``` text
UI
replay state/controller
keyboard/HID input adapters
server API client
media playback
camera selection
event/decision model
```

### NFR-061 --- Input abstraction

Keyboard and future ShuttleXpress input shall invoke the same semantic replay-controller interface.

### NFR-062 --- Server abstraction

The IVR client shall depend on documented server APIs rather than internal SQLite schemas or recording-file layouts.

### NFR-063 --- Protocol versioning

The eventual server-to-IVR protocol/API should provide a mechanism for version identification or compatible evolution.

### NFR-064 --- Testability

Replay-controller behavior shall be testable independently of physical ShuttleXpress hardware.

### NFR-065 --- Diagnostic observability

The system should expose sufficient diagnostic information to distinguish:

``` text
media unavailable
camera unavailable
server lookup failure
network failure
playback failure
synchronization warning
```

------------------------------------------------------------------------

## 4.8 Security --- Deferred Implementation, Required Architecture

### NFR-070 --- Consistent future encryption

The intended production architecture shall support TLS consistently for browser and camera/server communications.

### NFR-071 --- No browser-to-camera trust shortcut

The IVR browser shall communicate with cameras through the server rather than directly trusting/addressing camera tablets.

### NFR-072 --- Privileged operations

Administrative actions and camera-control operations shall be separable from ordinary replay viewing.

### NFR-073 --- No insecure fallback in production

When secure mode is eventually enabled, TLS failures shall not silently downgrade to insecure transport.

Detailed TLS implementation is deferred while the IVR fundamentals are developed.

------------------------------------------------------------------------

## 4.9 Auditability

### NFR-080 --- Review traceability

Formal IVR events should contain enough metadata to establish:

-   when the request occurred;
-   which ring/contest was involved;
-   what time interval was available/reviewed;
-   which camera views were available;
-   what decision was recorded, if decision recording is in scope.

### NFR-081 --- Rules distinction

The system shall preserve the distinction between:

``` text
coach-origin IVR
referee-origin IVR
technical review
other official correction
```

where those concepts are represented by FreePlay.

### NFR-082 --- Video immutability

Normal IVR operation shall not modify the underlying recorded
competition video.

------------------------------------------------------------------------

# 5. Explicitly Out of Scope for the Initial IVR MVP

Unless subsequently approved, the following are not required for the first functional IVR implementation:

-   Automated rules interpretation;
-   Computer-vision judging;
-   Automatic determination of whether an appeal is valid;
-   Automatic scoring changes;
-   Automatic PSS integration;
-   Full tournament bracket/match-management functions;
-   Video editing/export tools;
-   Cloud services;
-   Internet connectivity;
-   Direct IVR-browser connections to camera tablets;
-   Contour ShuttleXpress hardware support before keyboard-based replay is working;
-   TLS deployment before the HTTP/WS replay fundamentals are proven.

------------------------------------------------------------------------

# 6. Open Design Decisions for the Next Specification Revision

The following decisions may appropriately be resolved during UI/UX mock-up, use-case development, protocol design, or prototype testing:

1. Exact keyboard mappings.
2. Exact ShuttleXpress mappings.
3. Exact server-to-client replay media transport.
4. Integration details with specific scoring/PSS/tournament systems.
5. Required retention period for IVR event metadata and recorded video.
6. Authentication/authorization model when TLS/security work resumes.
7. Whether remote pause/resume camera controls belong in the IVR MVP or a later operational-control module.
8. Numeric release thresholds for camera-switch, MCV/SCV transition, and seek/jog response latency.
9. Pan/zoom limits, increments, and whether pan/zoom state persists across camera changes.
10. Exact visual treatment of referee/official review windows and technical-review annotations.
11. Whether the operational **Rejected: IVR Issue** quota-return policy requires configuration by tournament/ruleset.
12. Whether all three camera streams should remain continuously decoded in MCV/SCV or whether implementation may use selective decoding while preserving the required operator-observable behavior.
13. Future refinement of PSSEL-to-AUR temporal/causal correlation so that advisory invalidation/reinstatement recommendations do not accidentally associate an unrelated later scoring event with the reviewed action.

------------------------------------------------------------------------

# 7. Proposed MVP Acceptance Criteria

The first IVR prototype should be considered functionally successful when an operator can:

1.  open the IVR web application in Chrome;
2.  select or use an assigned ring;
3.  view all available ring cameras simultaneously in MCV;
4.  create Request Marks for coach- or referee-origin requests, including concurrent/overlapping Chung and Hong requests;
5.  explicitly select which pending review is to be handled first when multiple pending requests exist;
6.  activate **Start Review** and cause the Selected Review to become Active, RST to be recorded, the Review Response Clock to begin, and selection of other pending reviews to become disabled;
7.  receive recent video from the ingestion server and begin playback at the explicit beginning timestamp of the selected Review Window;
8.  locate and mark the AUR while remaining in MCV if desired, including cases where timeline annotations from separate reviews overlap;
9.  enter SCV for any available camera without losing the common Playback Cursor;
10. play, pause, scrub, seek, frame-step, and change playback rate;
11. switch among camera angles and between MCV and SCV without changing the Active Review, Review Window, AUR, RST, or active-review state;
12. use pan and zoom in SCV;
13. interpret timeline camera-state semantics, including broken/gapped intervals for unavailable video;
14. record a Review Result from either MCV or SCV;
15. observe that recording the Review Result stops the Review Response Clock, ends the Active Review, re-enables selection of pending reviews, restores the live timeline right bound, and returns playback to the live edge;
16. refresh/reopen the browser during an Active Review and recover the Active Review and elapsed Review Response Time from server-authoritative state without resetting the clock to zero;
17. receive a clear warning when a camera or requested video interval is unavailable;
18. perform all of the above while camera ingestion and recording continue normally and rapidly enough to demonstrate a realistic path to the 30-second Review Jury decision workflow.

------------------------------------------------------------------------

# 8. Requirements Traceability Notes

The most important rules-driven requirements are:

<table>
  <thead>
    <tr>
      <th>Rules Concept</th>
      <th>IVR Implication</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Review limited to one action within five seconds of coach request</td>
      <td>Preserve a precise request timestamp and explicit ruleset-derived Review Window bounds; current coach configuration is five seconds ending at RM</td>
    </tr>
    <tr>
      <td>Review Jury performs the video review</td>
      <td>UI must be optimized for a dedicated review operator/jury workflow</td>
    </tr>
    <tr>
      <td>Decision within 30 seconds</td>
      <td>RST-driven Review Response Clock, low interaction cost, and low replay startup/seek/camera/view-switch latency</td>
    </tr>
    <tr>
      <td>Review Jury may need to compare multiple camera angles rapidly</td>
      <td>MCV and SCV share one timeline and Playback Cursor and may be switched freely during review</td>
    </tr>
    <tr>
      <td>Referee may independently request IVR in specified situations</td>
      <td>Support review origins other than coach appeals</td>
    </tr>
    <tr>
      <td>Certain errors may be corrected during the round</td>
      <td>Stored/indexed video must remain addressable by timestamp beyond only the most recent few seconds</td>
    </tr>
    <tr>
      <td>Review Jury decision is final</td>
      <td>Review event metadata/auditability is desirable</td>
    </tr>
    <tr>
      <td>Successful coach appeal retains appeal right</td>
      <td>If quota tracking is implemented, decision outcome must feed appeal state</td>
    </tr>
    <tr>
      <td>Technical Review Request is distinct from video replay</td>
      <td>Do not conflate technical-card workflow with ordinary IVR video review</td>
    </tr>
  </tbody>
</table>

------------------------------------------------------------------------

# 9. Terminology

For this specification:

**AUR** --- Action Under Review.

**Chung** --- Blue contestant (or coach)

**Hong** --- Red contestant (or coach)

**IVR** --- Instant Video Replay/Review.

**PSS** --- Protective Scoring System.

**PSSEL** --- Protective Scoring System Event Listener.

**Review Jury** --- The official(s) responsible for reviewing the
instant video replay and informing the Center Referee of the final
decision.

**Request Mark (RM)** --- The server-authoritative timestamp recorded immediately when the IVR operator marks that a coach or the Center Referee has initiated a potential review request. A Request Mark may initially be uncommitted/pending; it becomes part of a formal IVR event when the referee addresses the request and the operator proceeds with formal review.

**Request timestamp** --- The timestamp of the Request Mark associated with a formal IVR event.

**Review point** --- The logical time around which the operator is
reviewing the contested action.

**Pending Review** --- A Request Mark/Review Window that exists but has not yet been started as a formal review.

**Selected Review** --- The one pending Review Window chosen by the operator as the next review to process. Selection alone does not create an RST or start the Review Response Clock.

**Active Review** --- The Selected Review after **Start Review** has been activated. At most one review may be Active in a ring/client workflow at a time. Other pending reviews remain visible but cannot be selected until the Active Review is completed.

**Retrieved Media Range** --- The time range retrieved from the server for playback or review. This is an implementation/navigation range and is distinct from the rules-defined Review Window.

**Review Window** --- The explicit start/end interval associated with a Request Mark and used to define the rules/operations-relevant review scope. Its duration is supplied by the applicable ruleset/configuration rather than hard-coded in the client. The current defaults are five seconds ending at RM for Coach origin and ten seconds ending at RM for Referee origin.

**RST** --- Review Start Time; the server-authoritative timestamp recorded when the operator activates **Start Review**. RST starts the Review Response Clock.

**MCV** --- Multi Camera View; the synchronized view in which all available camera feeds for the ring are displayed simultaneously against the same common timeline and Playback Cursor.

**SCV** --- Single Camera View; the synchronized view in which one selected camera is displayed at the common Playback Cursor with detailed replay navigation, frame stepping, pan, and zoom.

**Pre-roll / post-roll** --- Additional video before/after a target time
supplied for navigation and context.

**Common timeline** --- The server-authoritative time domain used to
align multiple camera recordings.

**GOP** --- Group of Pictures; an H.264 sequence beginning at a keyframe
and containing dependent pictures until the next suitable random-access
boundary.

**Keyframe / I-frame / sync frame** --- A video picture suitable as a
decoding entry point without depending on earlier inter-predicted
pictures.

**fMP4** --- Fragmented MP4; the recording/media container approach used
by the FreePlay server to make continuously recorded H.264 suitable for
indexed playback.

**HID** --- Human Interface Device. The planned Contour ShuttleXpress is
a HID that will eventually provide physical jog/shuttle/buttons through
Chrome WebHID.

------------------------------------------------------------------------

# 10. Review Status

This document is a **draft requirements baseline**.

The intended process is iterative:

``` text
Draft requirements
      |
      v
Project-owner edits
      |
      v
Requirements baseline
      |
      +------------------------------+
      |                              |
      v                              |
UI/UX mock-ups <----> Use-case narratives
      |                              |
      +--------------> Workflow examples
                         |
                         v
                 Requirements refinement
                         |
                         v
               Server-to-IVR protocol design
                         |
                         v
                   Implementation
```

# 11. Authorship

As per OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/), the content generated presented herein is assigned to Mike Wong. This document has been manually edited, making authorship blended in any case.

Copyright (c) 2026 Mike Wong, All Rights Reserved


