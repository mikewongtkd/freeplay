**FreePlay**

**Instant Video Replay (IVR)**  
**Use Cases**

*Working Draft for UI/UX and Prototype Validation*

Prepared for Mike Wong / OpenTKD.net  
September 2026

# **1\. Purpose and Source Hierarchy**

This document translates the current FreePlay System Requirements into operator-centered use cases for validating the Multi Camera View (MCV), Single Camera View (SCV), timeline, review controls, and supporting replay behavior before implementation of the PHP/Bootstrap/jQuery prototype.

USATKD Kyorugi Rules 2026, Article 21 remains the rule reference. The 2026 USATKD Kyorugi Referee Development Program — IVR presentation is treated here as soft operational guidance: it is useful for examples and current interpretations, but it is not authoritative rule text and may change frequently. Where the presentation adds an interpretation beyond Article 21, this document labels it as current guidance rather than a fixed FreePlay rule.

## **Frequency Scale and Ordering**

The frequency scale is shown below from least frequent to most frequent. Use cases in this document are ordered from most frequent to least frequent (Usually → Often → Sometimes → Rarely → Seldom):

* Seldom  
* Rarely  
* Sometimes  
* Often  
* Usually

Frequency values are design estimates for workflow prioritization, not statistics supplied by Article 21 or the referee-development presentation.

# **2\. Shared Concepts and Assumptions**

* Request Mark (RM): server-authoritative timestamp marking a potential request.  
* Review Window: for a coach challenge, RM − 5 seconds through RM.  
* Action Under Review (AUR): operator-selected timestamp identifying the action being adjudicated.  
* Review Start Time (RST): server-authoritative timestamp created by Start Review; it starts the Review Response Clock.  
* A formal review is active from RST until the Review Result is annotated.  
* MCV and SCV are viewing modes, not review states. The operator may switch freely between them during review.  
* Chung Review Request and Hong Review Request are the UI labels used to create coach Request Marks.  
* MCV displays all available ring cameras synchronously; SCV displays one selected camera at the same common Playback Cursor.  
* Before Start Review, the request disposition control shall show only Resolved without Review. After Start Review, Resolved without Review shall be hidden and the three formal Review Result choices — Accepted, Rejected, and Rejected: IVR Issue — shall be shown in both MCV and SCV.  
* Light solid camera tracks indicate displayed/available video; darker solid tracks indicate available but not displayed video; broken/gapped tracks indicate unavailable video.

PSSEL adapters filter external events before they reach the IVR client. The timeline receives only match start, stop, pause, resume, scoring, and penalty events.

* Current referee-development guidance emphasizes showing video immediately when the referee signals review, checking multiple angles, reviewing only the requested action, and deciding within 30 seconds.

# **UC-01 — Coach Requests Review**

| Expected Frequency | Usually |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator, Review Jury; coach and center referee |
| **Trigger** | A Chung or Hong coach stands and raises the challenge card to request immediate review. |
| **Rules / Guidance Basis** | Article 21.2, 21.3, 21.6–21.8; current referee-development IVR process guidance |
| **Requirements** | FR-010–018, FR-020–028, FR-030–052, FR-060–076, FR-080–084 |

## **Preconditions**

* The ring is assigned and at least one camera is available.  
* The match is being recorded.  
* The request is presented to the center referee.

## **Main Success Flow**

1\. The operator remains in MCV and activates Chung Review Request or Hong Review Request as soon as the raised card is recognized; RM and Review Window appear.

2\. The operator continues showing live/replay-ready video while the referee identifies the request.

3\. When the referee formally signals video replay, the operator selects the relevant Review Window if necessary and activates Start Review.

4\. FreePlay records RST, starts the Review Response Clock, retrieves context, and positions playback at RM − 5 seconds.

5\. The operator uses synchronized MCV to locate the AUR and marks it.

6\. The operator selects the best SCV angle and uses reverse, speed controls, frame stepping, pan/zoom as needed.

7\. The operator may switch among cameras or return to MCV without losing AUR, RST, Review Window, or Playback Cursor.

8\. The Review Jury decides and the operator selects one of the three formal Review Result choices: Accepted, Rejected, or Rejected: IVR Issue.

9\. FreePlay immediately timestamps the selected result, stops the Review Response Clock, ends active review, and preserves the result. Detailed IVR Sheet annotation may be completed afterward and is not part of the 30-second decision workflow.

## **Alternate / Exception Flows**

* Accepted challenge: card/quota retained under Article 21/current procedure.  
* Ordinary rejection: card/quota lost.  
* Current guidance says clear video evidence is required to accept; unclear evidence is rejected, and multiple camera angles should be checked.  
* Only the requested action is reviewed; unrelated observations do not automatically expand the request.  
* PSSEL may provide advisory event correlation but does not decide the appeal.

## **Postconditions**

* RM, Review Window, AUR, RST, result, timestamps, camera/media references, and quota state are recorded.  
* The client returns to ordinary MCV after the result is recorded.

## **Example Narratives**

* Chung steps out of bounds without a Gam-jeom; Hong coach requests Chung Crossing the Boundary Line.  
* Hong grabs Chung, scores a head kick, receives a Gam-jeom for grabbing, but the points are not invalidated; Chung coach requests invalidation of points following the Gam-jeom.  
* A coach requests technical points for a turning kick; the jury checks the complete turn, base score, and which kick actually scored before deciding.

## **UI/UX Implications to Validate**

* Chung/Hong Review Request must be fast and prominent.  
* Start Review must remain distinct from RM creation.  
* Start Review must not force SCV; MCV is valuable for locating AUR and choosing the best angle.  
* Mark AUR and the three formal Review Result choices must be available during active review.  
* Accepted, Rejected, and Rejected: IVR Issue must be reachable in both MCV and SCV after Start Review.  
* The 30-second clock must remain visible without obscuring video.

# **UC-02 — Request Marked but Resolved Without Formal Review**

| Expected Frequency | Often |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator; coach, center referee, judges |
| **Trigger** | A coach raises a card, but the issue is corrected or otherwise resolved before the Review Jury begins formal review. |
| **Rules / Guidance Basis** | Article 21.3; current referee-development operational guidance |
| **Requirements** | FR-010, FR-018, FR-051, FR-080 |

## **Preconditions**

* The operator is monitoring in MCV.

## **Main Success Flow**

1\. The operator activates Chung Review Request or Hong Review Request and FreePlay records RM/Review Window.

2\. Start Review remains available but is not activated.

3\. The referee/judges/system resolves the matter before formal review, and the operator selects Resolved without Review.

4\. FreePlay records the pre-review disposition Resolved without Review against the RM; no formal review is opened.

5\. No RST is created and the Review Response Clock never starts. The three formal Review Result choices remain hidden because Start Review was never activated.

## **Alternate / Exception Flows**

* If the request is then sent to the Review Jury, the existing RM proceeds into the normal coach-review case.  
* Current guidance/examples recognize situations where judges correct the issue, the referee corrects it, or delayed PSS display self-corrects; quota handling can depend on current event interpretation.

## **Postconditions**

* The RM and Resolved without Review disposition are preserved as operational/audit metadata, but no formal review session or RST is created.  
* Live MCV continues.

## **Example Narratives**

* A judge immediately stands and corrects technical points before the referee asks the coach for the request; the coach is satisfied and no formal review begins.  
* PSS points appear after a short display delay before the referee identifies the request; the matter is resolved without replay.  
* The referee recognizes a scoreboard issue and corrects it before sending the request to the jury.

## **UI/UX Implications to Validate**

* RM creation must be visually different from Start Review. Before Start Review, Resolved without Review is the only visible result/disposition choice.  
* Pending/uncommitted marks must not look like an active 30-second review. Activating Start Review hides Resolved without Review and reveals Accepted, Rejected, and Rejected: IVR Issue.

# **UC-03 — AUR Cannot Be Located Inside the Coach Review Window**

| Expected Frequency | Often |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator, Review Jury |
| **Trigger** | The requested action cannot be found within RM − 5 seconds through RM, or the best-estimate AUR lies outside that interval. |
| **Rules / Guidance Basis** | Article 21.3; current guidance requiring coach to stand within five seconds |
| **Requirements** | FR-012–014, FR-026–027, FR-052 |

## **Preconditions**

* A formal coach review is active.  
* Review Window is visible.

## **Main Success Flow**

1\. The operator searches the initial context.

2\. The best-estimate AUR is marked if identifiable.

3\. FreePlay warns if it is outside the Review Window.

4\. The operator may inspect surrounding context without expanding the rules-defined window.

5\. The jury makes the procedural decision and the operator records the result.

## **Alternate / Exception Flows**

* If no action can be located because of system failure, use the IVR/system-failure case.  
* If the action is found within the window, replacing AUR clears the warning.

## **Postconditions**

* AUR and Review Window remain preserved in the audit record.

## **Example Narratives**

* Hong coach asks for technical points on a back kick, but no back kick exists within the Review Window; the request is rejected.  
* The requested action is visible six seconds before the coach stood; the jury can inspect it for context, but it lies outside the five-second Review Window.

## **UI/UX Implications to Validate**

* Review Window versus surrounding playback context must remain visually obvious.  
* Warn rather than prevent out-of-window AUR marking.

# **UC-04 — Judge Requests Addition or Removal of Technical Points**

| Expected Frequency | Often |
| :---- | :---- |
| **Primary Actor(s)** | Judge, center referee, Review Jury/operator as applicable |
| **Trigger** | A judge asks to add or remove technical points during the round. |
| **Rules / Guidance Basis** | Article 21.11; current referee-development technical-points guidance |
| **Requirements** | FR-016, FR-064, FR-076, FR-080–084 |

## **Preconditions**

* The round is active.

## **Main Success Flow**

1\. The request is recognized as judge-originated, not a coach challenge.

2\. If video is requested, the operator immediately displays it and locates the scoring action.

3\. The jury checks whether the turn was complete, whether base points scored, and whether the turning kick was the scoring kick, per current guidance.

4\. The correction is recorded.

## **Alternate / Exception Flows**

* Judge requests do not consume coach quota.  
* If several kicks occur close together, the operator must identify which kick actually scored before technical points are changed.

## **Postconditions**

* Coach quota remains unchanged.

## **Example Narratives**

* Hong throws a spin hook kick that misses, then a roundhouse that scores; the judge initially presses technical points but requests removal after realizing the scoring kick was not the turning kick.  
* Chung scores as Hong counters with a back kick; the judge presses technical for the wrong contestant and requests removal from Chung plus addition to Hong.

## **UI/UX Implications to Validate**

* Provide fast official/judge origin selection.  
* Frame stepping and PSSEL event correlation are valuable for identifying which kick scored. When PSSEL data are available, correlated events shall appear directly on the common timeline.

# **UC-05 — Coach Requests Punch Misidentification Review**

| Expected Frequency | Often |
| :---- | :---- |
| **Primary Actor(s)** | Coach, center referee, Review Jury, IVR operator |
| **Trigger** | A coach challenges the identification/processing of a punch that registered on punch PSS. |
| **Rules / Guidance Basis** | Article 21.2 as applicable; current referee-development punch-misidentification guidance |
| **Requirements** | FR-006, FR-010–018, FR-064 |

## **Preconditions**

* Punch PSS is in use and the punch registered on the system under current guidance.  
* Coach raises the appropriate challenge card.

## **Main Success Flow**

1\. The operator creates Chung/Hong Review Request and starts review when referred.

2\. The scoring moment is located using video and, when available, PSSEL event markers displayed directly on the common timeline.

3\. The jury determines whether the judge identified the wrong player, pressed technical instead of punch, or missed the timing window under current guidance.

4\. The result is recorded.

## **Alternate / Exception Flows**

* Current guidance says a punch that did not register on punch PSS is not reviewable through this punch-misidentification path.

## **Postconditions**

* Challenge quota follows normal accepted/rejected behavior.

## **Example Narratives**

* Chung's punch registers, but the judge awards it to Hong; Chung coach requests punch misidentification.  
* The punch registers but the judge presses the technical control rather than punch; the coach requests correction.  
* A visible punch never registered on punch PSS; current guidance does not allow this punch-misidentification review.

## **UI/UX Implications to Validate**

* PSSEL events shall appear directly on the common timeline so a registered punch or other correlated scoring event can be located quickly. Adapters provide only match start, stop, pause, resume, scoring, and penalty events.  
* Reason list should distinguish wrong player, wrong button/type, and missed timing if those remain current.

# **UC-06 — Referee Requests Review — Last Five Seconds / Last Action**

| Expected Frequency | Sometimes |
| :---- | :---- |
| **Primary Actor(s)** | Center referee, Review Jury, IVR operator |
| **Trigger** | In the last five seconds of a round, the referee requests IVR for Falling Down, Crossing Boundary, Attack After Kal-yeo, or Attacking the Fallen Opponent. |
| **Rules / Guidance Basis** | Article 21.4.1–21.4.1.4; current referee-development guidance |
| **Requirements** | FR-015–017, FR-050–052, FR-064, FR-076 |

## **Preconditions**

* The round is in its final five seconds or has just ended.  
* Relevant video is retained.

## **Main Success Flow**

1\. The operator creates a referee RM.

2\. Start Review records RST and begins the clock.

3\. MCV locates the last action and AUR.

4\. SCV/camera switching determines whether the prohibited act occurred.

5\. The result is recorded.

6\. Related points are identified for invalidation when applicable.

## **Alternate / Exception Flows**

* Current guidance says the referee should request before issuing the penalty and use the card corresponding to the contestant who may have committed it.

## **Postconditions**

* Coach quota is unchanged.

## **Example Narratives**

* At 0:02, Hong steps out but time expires before the referee is sure; the referee requests IVR before issuing the Gam-jeom.  
* A kick lands after Kal-yeo in the final seconds and appears to score; the referee requests review of the prohibited act and related points.

## **UI/UX Implications to Validate**

* Referee windows must be distinct from Chung/Hong coach windows.  
* Make last-action navigation extremely fast.

# **UC-07 — Coach Technical Review Request**

| Expected Frequency | Sometimes |
| :---- | :---- |
| **Primary Actor(s)** | Coach, center referee, Review Jury/technical officials, IVR operator |
| **Trigger** | A coach uses the technical card for a technical issue such as PSS test, phantom points, time, or scoreboard entry. |
| **Rules / Guidance Basis** | Article 21.5–21.5.5; current referee-development technical-card guidance |
| **Requirements** | FR-017, FR-051, FR-064 |

## **Preconditions**

* A technical issue is alleged.

## **Main Success Flow**

1\. The operator identifies a Technical Review Request rather than a normal challenge.

2\. Relevant video/system evidence is displayed if useful.

3\. Officials resolve the technical issue.

4\. FreePlay records the issue and outcome if assigned audit responsibility.

## **Alternate / Exception Flows**

* The technical card is separate from the coach challenge quota.  
* Current guidance states the referee retains the technical card; if rejected, the athlete receives the applicable Gam-jeom under current procedure.

## **Postconditions**

* Technical-review metadata remains distinct from coach challenge consumption.

## **Example Narratives**

* A phantom point appears with no corresponding valid scoring event; the coach uses the technical card.  
* The scoreboard operator fails to apply a referee-signaled score correction; the coach raises the technical card.  
* A coach requests a PSS test because the system appears not to register correctly.

## **UI/UX Implications to Validate**

* Technical issues retain the distinct green visual treatment.  
* Do not imply every technical request creates a coach five-second Review Window.

# **UC-08 — Referee Requests Technical Review**

| Expected Frequency | Sometimes |
| :---- | :---- |
| **Primary Actor(s)** | Center referee, technical officials, IVR operator |
| **Trigger** | The referee identifies a technical problem such as phantom points, time management, PSS test, or scoreboard entry. |
| **Rules / Guidance Basis** | Article 21.9 family as applicable; current referee-development guidance |
| **Requirements** | FR-006, FR-016–017, FR-064, FR-080–084 |

## **Preconditions**

* The contest is active.

## **Main Success Flow**

1\. The referee initiates the technical review using the appropriate official process.

2\. The operator creates an official/referee annotation.

3\. Video/system evidence is displayed if relevant.

4\. The technical correction is determined and applied.

5\. The outcome is recorded.

## **Alternate / Exception Flows**

* Some issues can be resolved from scoreboard/PSS data without video.  
* If an uncorrected error later affects the winner, use the post-round correction case.

## **Postconditions**

* No coach quota is affected.

## **Example Narratives**

* The referee signals Kye-sok but the computer operator fails to restart time; the referee initiates technical correction.  
* Phantom PSS points appear and the referee asks for technical review.

## **UI/UX Implications to Validate**

* Official technical review must be distinct from coach challenge.  
* Display filtered PSSEL events directly on the common timeline and support jumping to their timestamps when available. Adapter output is limited to match start, stop, pause, resume, scoring, and penalty events.

# **UC-09 — Coach Makes an Inadmissible or Wrong-Type Request**

| Expected Frequency | Sometimes |
| :---- | :---- |
| **Primary Actor(s)** | Coach, center referee, Review Jury, IVR operator |
| **Trigger** | A coach raises a challenge for an issue that current rules/guidance do not permit as an ordinary IVR challenge. |
| **Rules / Guidance Basis** | Article 21.2 limitations; current referee-development 'What Coaches Cannot Appeal' guidance |
| **Requirements** | FR-010–018, FR-064, FR-075 |

## **Preconditions**

* A coach has raised a card and an RM may already exist.

## **Main Success Flow**

1\. The operator marks the coach request immediately so the event is not lost.

2\. The center referee identifies the stated reason.

3\. The request is classified as inadmissible/wrong request type before unnecessary video review where procedure allows.

4\. If the matter is actually a technical-card issue, it is redirected to the technical workflow.

5\. The disposition and quota effect are recorded according to current rules/procedure.

## **Alternate / Exception Flows**

* Current guidance lists PSS-scored/not-scored kicks, removing PSS points, ordinary punch scored/not-scored disputes, reversal of a previous IVR decision, and certain illegal-action point invalidations as non-appealable coach challenges.  
* FreePlay should assist classification but not autonomously adjudicate admissibility.

## **Postconditions**

* The request record preserves what was asked and how it was disposed.

## **Example Narratives**

* A coach challenges a trunk kick that did not score on PSS; the request is not a permitted ordinary IVR challenge.  
* A coach asks the jury to reverse an earlier video-review decision; current guidance does not permit it.  
* A coach complains of phantom points; the issue is redirected to the technical-card workflow rather than treated as a normal challenge.

## **UI/UX Implications to Validate**

* Reason menus should distinguish challenge-card and technical-card issues.  
* Avoid forcing the operator to watch video for a request that procedure resolves administratively.

# **UC-10 — Referee Requests Review After Count**

| Expected Frequency | Rarely |
| :---- | :---- |
| **Primary Actor(s)** | Center referee, Review Jury, IVR operator |
| **Trigger** | After an 8- or 10-count for a strong head kick that did not score on the PSS, the referee requests IVR. |
| **Rules / Guidance Basis** | Article 21.4.2; current referee-development head-kick guidance |
| **Requirements** | FR-015–018, FR-030–039, FR-064, FR-076 |

## **Preconditions**

* A count has occurred in the qualifying situation.  
* Relevant video is available.

## **Main Success Flow**

1\. The operator marks the referee request and starts review.

2\. MCV locates the kick and AUR.

3\. The clearest SCV angle is examined with slow motion/frame stepping.

4\. The Review Jury determines whether the qualifying head contact occurred.

5\. The result and awarded-point recommendation, if any, are recorded.

## **Alternate / Exception Flows**

* Current guidance says to consider any foot contact to the head in this specific review and, if in doubt, trust the referee.  
* Current guidance also says a clear preceding Falling Down, Crossing Boundary, Attack After Kal-yeo, or Attacking Fallen Opponent causes rejection even if the referee did not give that Gam-jeom.

## **Postconditions**

* Coach quota is unchanged.

## **Example Narratives**

* After a strong head kick and 8-count, no PSS points appear; replay clearly shows foot-to-head contact and the review is accepted.  
* Replay shows the head kick, but immediately beforehand the attacker clearly crossed the boundary; under current guidance the request is rejected.

## **UI/UX Implications to Validate**

* Reverse 0.5× and frame-step must be immediate.  
* Detailed metadata must not delay showing video.

# **UC-11 — Referee Requests Review for Pretending Injury**

| Expected Frequency | Rarely |
| :---- | :---- |
| **Primary Actor(s)** | Center referee, Review Jury, IVR operator |
| **Trigger** | The referee requests IVR before declaring a Gam-jeom for pretending injury. |
| **Rules / Guidance Basis** | Article 21.4.3; current referee-development pretending-injury guidance |
| **Requirements** | FR-015–018, FR-026–027, FR-064, FR-076, FR-080–084 |

## **Preconditions**

* The referee has not finalized the pretending-injury Gam-jeom.

## **Main Success Flow**

1\. The operator creates the referee RM and starts review.

2\. The entire relevant action is inspected and the AUR marked.

3\. The operator checks whether the athlete is actually injured and, if so, the cause.

4\. The Review Jury communicates the appropriate outcome.

5\. The operator records the result and closes review.

## **Alternate / Exception Flows**

* Current guidance distinguishes: prohibited-act injury; actual pretending; and accidental/no-prohibited-act injury.  
* If the medic says the athlete cannot continue, current guidance calls for escalation to the Referee Chair before outcome.

## **Postconditions**

* No coach quota is affected.

## **Example Narratives**

* An athlete stays down after a legal knee clash; replay shows no prohibited act, so the pretending-injury request is rejected and the match continues without that Gam-jeom.  
* Replay shows the athlete was hurt by an illegal below-waist attack; the jury instructs the appropriate Gam-jeom and rejects the pretending-injury allegation.  
* Replay shows no injury-causing action and clear simulation; the request is accepted and Misconduct is applied under current guidance.

## **UI/UX Implications to Validate**

* Allow contextual viewing of the whole action.  
* Reason/outcome annotation should capture the cause, not merely Accept/Reject.

# **UC-12 — One Camera Unavailable or Video Gap Exists**

| Expected Frequency | Rarely |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator, Review Jury |
| **Trigger** | One camera is disconnected, paused, missing media, or has a gap during the requested interval. |
| **Rules / Guidance Basis** | Project requirement |
| **Requirements** | FR-004, FR-028, FR-047, FR-050, FR-084 |

## **Preconditions**

* At least one other camera remains usable.

## **Main Success Flow**

1\. The timeline displays the unavailable interval as a broken/gapped track.

2\. MCV clearly marks the affected camera tile.

3\. Review continues using remaining cameras.

4\. The operator may use SCV on any usable angle.

5\. The result is recorded normally if evidence is sufficient.

## **Alternate / Exception Flows**

* If all useful angles fail, use the unusable-video case.  
* If the camera recovers, the resumed track becomes solid without hiding the prior gap.

## **Postconditions**

* Partial failure does not block the other cameras.

## **Example Narratives**

* CAM 2 disconnects just before the request, but CAM 1 and CAM 3 clearly show the AUR; review proceeds normally.  
* CAM 1 has a two-second recording gap exactly at the AUR; the operator switches to CAM 3\.

## **UI/UX Implications to Validate**

* Broken-line semantics must be obvious.  
* Unavailable camera controls should be disabled/marked.

# **UC-13 — Review Requires Older Retained Media or Crosses Storage Boundaries**

| Expected Frequency | Rarely |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator, replay service |
| **Trigger** | The operator navigates well before the RM or revisits a prior review. |
| **Rules / Guidance Basis** | Project requirement |
| **Requirements** | FR-026–028, FR-044, FR-083, FR-090–096 |

## **Preconditions**

* Requested media remain within retention bounds.

## **Main Success Flow**

1\. The operator seeks to an earlier logical time or reopens a stored review.

2\. The server retrieves media by logical time, not filenames.

3\. Adjacent fragments are supplied transparently.

4\. Camera switches preserve the common Playback Cursor.

5\. Inspection continues without exposing storage boundaries.

## **Alternate / Exception Flows**

* If media have expired, clearly report the unavailable range.  
* Single-camera gaps follow the partial-camera case.

## **Postconditions**

* Older retained media remain reproducible while available.

## **Example Narratives**

* The jury needs context 20 seconds before the RM to understand which athlete initiated a sequence; FreePlay retrieves it without exposing file boundaries.

## **UI/UX Implications to Validate**

* No GOP/file terminology in the jury UI.  
* Seeking should feel continuous.

# **UC-14 — Review Cannot Be Decided Because of True IVR/System Failure**

| Expected Frequency | Rarely |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator, Review Jury |
| **Trigger** | The request cannot be fairly resolved because recording/system failure prevents review. |
| **Rules / Guidance Basis** | Current referee-development guidance; project IVR Issue handling |
| **Requirements** | FR-028, FR-047, FR-064, FR-075, FR-084 |

## **Preconditions**

* A formal coach review is active.

## **Main Success Flow**

1\. The operator checks all camera angles and system status.

2\. The failure is classified as a qualifying IVR/system issue rather than merely unclear evidence.

3\. The Review Jury applies current event procedure.

4\. FreePlay records Rejected: IVR Issue, stops the clock, and records the failure cause.

5\. Quota-card handling follows configured current policy.

## **Alternate / Exception Flows**

* Current guidance identifies camera malfunction, all cameras completely blocked, and computer operator failure to start time as situations where a rejected request may have the card returned.  
* Current guidance explicitly distinguishes poor video quality or an action that is simply difficult to see: those are ordinary rejections, not IVR Issue.

## **Postconditions**

* Technical limitation is auditable and distinct from ordinary rejection.

## **Example Narratives**

* All three cameras failed to record the AUR because of a recording malfunction; the request is rejected but the card is returned under current guidance.  
* Every camera is completely blocked by the referee/athletes at the AUR; the technical-failure outcome is used.  
* The video exists but the contact is blurry and inconclusive; this is an ordinary rejection, not an IVR Issue.

## **UI/UX Implications to Validate**

* IVR Issue must be semantically distinct from Rejected.  
* Failure reason should be quick to select.

# **UC-15 — Coach Makes a Two-Action Request Within Five Seconds**

| Expected Frequency | Rarely |
| :---- | :---- |
| **Primary Actor(s)** | Coach, center referee, Review Jury, IVR operator |
| **Trigger** | A coach requests two qualifying actions within the same five-second interval. |
| **Rules / Guidance Basis** | Current referee-development 'Two Requests' guidance |
| **Requirements** | FR-010–018, FR-052, FR-064, FR-080–084 |

## **Preconditions**

* Both requested actions fall within the relevant five-second period.  
* The combination is one permitted by current guidance.

## **Main Success Flow**

1\. The operator creates one coach Review Request and starts review.

2\. The two requested issues are recorded distinctly within the same review context.

3\. The operator uses MCV/SCV to locate the two temporally or causally connected actions and places one AUR marker on the first action.

4\. The jury evaluates each requested issue without expanding into unrelated events.

5\. The combined result and any separate consequences are recorded.

## **Alternate / Exception Flows**

* Current guidance permits combinations involving adding/removing technical points or removing a Gam-jeom plus one of four opponent Gam-jeom cases: Crossing Boundary, Falling Down, Attack After Kal-yeo, Attacking Fallen Opponent.  
* Because this is interpretation-sensitive, the UI should support two issues but not hard-code eligibility beyond configurable reason lists.

## **Postconditions**

* One review record preserves both requested issues and their outcome.

## **Example Narratives**

* Within five seconds, Hong appears to fall and Chung also appears to earn turning-kick technical points; the coach requests both permitted issues in the same challenge.

## **UI/UX Implications to Validate**

* Request annotation must support two reasons without creating two independent 30-second clocks.  
* The review shall use one AUR marker placed on the first action. The two requested issues remain distinct annotations within the same review record because the actions must be temporally or causally connected.

# **UC-16 — Post-Round TD/CSB Correction Affecting the Result**

| Expected Frequency | Seldom |
| :---- | :---- |
| **Primary Actor(s)** | Technical Delegate (TD), Competition Supervisory Board (CSB), IVR operator |
| **Trigger** | An uncorrected scoring-calculation or athlete-identification error is discovered after the round and affected the winner. |
| **Rules / Guidance Basis** | Article 21.9.3.1 |
| **Requirements** | FR-026, FR-080–084; retention policy |

## **Preconditions**

* The event qualifies for post-round correction.  
* The issue is identified within the applicable correction period.  
* Relevant media/system records remain retained.

## **Main Success Flow**

1\. Authorized officials identify the suspected error.

2\. The operator reopens/retrieves the relevant media and event data.

3\. The earliest relevant error is located and documented.

4\. TD/CSB determines the correction.

5\. FreePlay preserves the timestamp/media reference and final correction for audit.

## **Alternate / Exception Flows**

* If multiple errors exist, officials identify the first relevant error point.  
* This is not a coach challenge and does not consume coach quota.

## **Postconditions**

* Original video remains immutable.  
* The correction is reproducible while records are retained.

## **Example Narratives**

* After a round, officials discover that a scoreboard-entry error changed the winner; retained video and event data are reopened to establish the correct point of correction.

## **UI/UX Implications to Validate**

* Provide an administrative/reopen path without cluttering the live IVR screen.  
* Retention must support the rule-defined correction window where applicable.

# **UC-17 — TD/Referee Chair Intervention in a Difficult Match-Deciding Review**

| Expected Frequency | Seldom |
| :---- | :---- |
| **Primary Actor(s)** | Review Jury, Referee Chair, TD/CSB, IVR operator |
| **Trigger** | A difficult review near the end of a round may determine the match outcome and the Review Jury cannot make a clear decision. |
| **Rules / Guidance Basis** | Article 21.4.4; current referee-development guidance on difficult decisions |
| **Requirements** | FR-016, FR-083; review/audit requirements |

## **Preconditions**

* A formal review is active.  
* The situation qualifies for elevated consultation under current procedure.

## **Main Success Flow**

1\. The operator preserves the existing RM/RST/AUR and review media.

2\. The Review Jury escalates to the appropriate senior official.

3\. The same synchronized media are made available without altering original timestamps.

4\. The senior official/CSB determines the outcome under current procedure.

5\. The final result and elevated authority are recorded.

## **Alternate / Exception Flows**

* Current guidance also calls for Referee Chair consultation if a pretending-injury review coincides with a medic declaring the athlete unable to continue.

## **Postconditions**

* The original review context remains intact.  
* Audit data identifies the elevated decision authority.

## **Example Narratives**

* With seconds remaining, the Review Jury cannot clearly resolve a review that will determine the winner; the Referee Chair is called before the outcome is declared.  
* During a pretending-injury review, the medic says the athlete cannot continue; the Review Jury escalates before declaring the outcome.

## **UI/UX Implications to Validate**

* Do not create a second coach-style Review Window.  
* Support escalation metadata without interrupting video navigation.

# **UC-18 — Camera Synchronization Warning During Review**

| Expected Frequency | Seldom |
| :---- | :---- |
| **Primary Actor(s)** | IVR operator, Review Jury |
| **Trigger** | FreePlay detects that camera timelines are outside accepted synchronization tolerance. |
| **Rules / Guidance Basis** | Project requirement; not specified by Article 21 |
| **Requirements** | FR-022, FR-048, FR-084; NFR-020–022 |

## **Preconditions**

* Two or more camera feeds are available.

## **Main Success Flow**

1\. The client displays a synchronization warning.

2\. The operator continues in MCV with awareness of imperfect simultaneity.

3\. The operator may rely on a trusted SCV angle and frame-step.

4\. The Review Jury decides if evidence is adequate.

5\. Sync quality is preserved with the result.

## **Alternate / Exception Flows**

* If sync uncertainty makes evidence unusable, use the unusable-video case.

## **Postconditions**

* Review can complete without hiding the synchronization defect.

## **Example Narratives**

* CAM 2 is reported roughly three frames out of alignment; the operator uses CAM 1 and CAM 3 for the decisive sequence and records the result.

## **UI/UX Implications to Validate**

* Warning must be conspicuous but not cover video.  
* Never imply frame-exact cross-camera alignment when degraded.

# **UC-19 — Second Review of the Same Video — Narrow Exception**

| Expected Frequency | Seldom |
| :---- | :---- |
| **Primary Actor(s)** | Coach, center referee, Review Jury, IVR operator |
| **Trigger** | A second coach requests review of an action that has already been reviewed, under the narrow current-guidance exception. |
| **Rules / Guidance Basis** | Current referee-development guidance: video normally reviewed only once; exception for certain Falling Down / Crossing Boundary wrong-player situations |
| **Requirements** | Review history / event-linking requirements; FR-080–084 |

## **Preconditions**

* A prior review of the same action exists.  
* The second request is asserted to qualify for the current exception.

## **Main Success Flow**

1\. With the prior Review Window selected, the operator identifies the opposing coach's second request and creates the appropriate Chung Review Request or Hong Review Request.

2\. A new request mark/window appears in the appropriate Chung/Hong color and on the appropriate side of the timeline, linked to the previously reviewed action. Because this is a subsequent review rather than a continuation of the first, activating Start Review creates a new RST and starts a new independent 30-second Review Response Clock.

3\. The operator starts review and shows the same relevant media.

4\. The Review Jury considers only the newly requested issue.

5\. The second result is recorded and linked to the first.

## **Alternate / Exception Flows**

* A request merely seeking reversal of the prior IVR decision is inadmissible under current guidance.  
* Because this exception is interpretation-sensitive, FreePlay should record rather than automatically decide eligibility.

## **Postconditions**

* Both decisions remain independently auditable and cross-linked.

## **Example Narratives**

* Hong coach successfully requests a Gam-jeom because Chung crossed the boundary. Chung coach then requests 'Gam-jeom given to the wrong player,' arguing the crossing was caused by Hong's pushing.  
* Chung coach gets a Falling Down Gam-jeom added to Hong; Hong coach then requests wrong-player because the fall was caused by Chung's grabbing.

## **UI/UX Implications to Validate**

* Show both review annotations on the timeline in their appropriate side/color. When annotation details are available, distinguish the first review from the second review explicitly.  
* Do not let the second request overwrite the first review's RM, Review Window, AUR, RST, result, or annotations.

# **3\. Frequency-Ordered Index**

The document is intentionally numbered in descending expected frequency: Usually → Often → Sometimes → Rarely → Seldom.

UC-01: Usually • UC-02–05: Often • UC-06–09: Sometimes • UC-10–15: Rarely • UC-16–19: Seldom

# **4\. Cross-Cutting UI/UX Findings from Current Referee Guidance**

* Video should be displayed as soon as the referee signals for replay; the operator should not be required to locate the AUR before showing replay.  
* MCV is strongly supported by current guidance because Review Juries are encouraged to check multiple camera angles.  
* The software should reinforce 'review only the requested action' by keeping request reason and Review Window/AUR context continuously visible.  
* Accept requires clear evidence under current guidance. Poor-quality or difficult-to-see video is an ordinary rejection, while true recording/system failures may have different quota-card treatment.  
* Within the 30-second workflow, review completion requires only selection of the formal Review Result. Detailed IVR Sheet fields — match/round, action time, player, request reason, Review Jury identity, explanation, and other annotations — may be completed after the timed decision.  
* Interpretation-sensitive items — especially technical-card penalties, eligibility of two-action requests, second-review exceptions, and card-return circumstances — should be configurable or recorded as metadata rather than hard-coded as immutable logic. The result label Rejected: IVR Issue itself is fixed.

# **5\. Resolved Prototype Decisions and Remaining Questions**

* Resolved — Result/disposition controls have four total choices with mutually exclusive visibility. Before Start Review: only Resolved without Review is visible. After Start Review: Resolved without Review is hidden and Accepted, Rejected, and Rejected: IVR Issue are revealed.  
* Resolved — A two-action request uses one AUR marker placed on the first action. The two requested issues are stored separately within the same review because the actions must be temporally or causally connected.  
* Resolved — If the prior Review Window is selected and the opposing coach invokes the narrow second-review exception, the new review mark/window appears in the appropriate Chung/Hong color and on the appropriate side of the timeline. When annotations are available, they distinguish the first review from the second.  
* Resolved — PSSEL events appear directly on the common timeline.  
* Resolved — Rejected: IVR Issue is a fixed result label and is not configurable.  
* Resolved — Only selection of the formal Review Result is within the 30-second workflow. Detailed IVR Sheet annotation may continue after the timed decision.

# **6\. Additional Resolved Prototype Decisions**

* Resolved — After Resolved without Review is selected, its RM/Review Window remains normally visible on the timeline for the rest of the match.  
* Resolved — A subsequent review creates its own RST and independent 30-second Review Response Clock. It remains linked to the first review for context and audit, but it is not a continuation of the first review.  
* Resolved — PSSEL adapters perform event filtering upstream. Only match start, stop, pause, resume, scoring, and penalty events are delivered for display on the common timeline.