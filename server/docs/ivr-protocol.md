# FreePlay IVR protocol

Current implementation reference, November 11, 2026. This document covers browser replay delivery, media resources, the review workflow API, and their operational boundaries. It describes implemented behavior rather than proposed production APIs. See [ingestion protocol](ingestion-protocol.md) for FPV1, recording, and ingestion operations and [current operator workflow](../ivr-review/workflow.md) for review UI details.

## Implemented ownership and transport

Node owns camera ingestion, completed-GOP RAM retention, disk/index lookup, and browser fMP4 delivery. PHP owns match/configuration administration and the session-backed review API. The browser uses HTTP manifests and tokenized media with Media Source Extensions (MSE); no replay WebSocket or generated per-request MP4 clip transport is implemented.

The browser's `ReplayApi` defaults to `<page scheme>://<page hostname>:9000/api/ivr/v1`. `window.FREEPLAY_IVR.config.replayApiBase` overrides that base. This must be the full API base, not just a hostname. The PHP prototype config defaults the override to null. Camera switching and the multi-camera coordinator issue separate per-camera requests.

## Runtime configuration and administration boundary

The Node listener defaults to port 9000 (`FREEPLAY_PORT`, then `FREEPLAY_WS_PORT`). Node uses `FREEPLAY_DB` (default `/data/freeplay.sqlite`) and `FREEPLAY_VIDEO_DIR` (default `/data/video`) for the shared replay index and recording files. Ingestion retention/file settings are documented in [ingestion configuration](ingestion-protocol.md#configuration-and-operations).

IVR PHP's database helper independently supports `FREEPLAY_DB` and `FREEPLAY_SCHEMA` (default schema `/deploy/db/schema.sql`). The general PHP administration APIs instead use fixed `/data/freeplay.sqlite` and `/data/live-status.json` paths. Configure both processes explicitly; overrides do not automatically propagate between components. Node's startup schema and selected additive migrations are not a general migration framework.

Match and camera configuration are administered through `/review/api/match.php` and `/review/api/camera-config.php`. The database-backed report is `/review/report.php`. Operator controls and annotation fields are described in [the workflow](../ivr-review/workflow.md); their persistence boundary is specified below.

## Capabilities

```text
GET /api/ivr/v1/capabilities
```

Actual response shape:

```json
{
  "ok": true,
  "apiVersion": "1",
  "serverTimeEpochUs": "1788298642354000",
  "features": {
    "multiCameraReplay": false,
    "adjacentRanges": false,
    "reviewPersistence": false,
    "pssel": false
  },
  "media": {"container":"video/mp4","codec":"avc1","transport":"http-fmp4-mse"},
  "limits": {"maximumRangeSeconds":60}
}
```

These false flags are intentional descriptions of the API: there is no single multi-camera manifest, opaque continuation API, durable review resource service, or production PSSEL service. The UI nevertheless coordinates three independent replay players.

## Replay manifest

```text
GET /api/ivr/v1/replay?ring=6&camera=2&timeEpochUs=1788298642354000&beforeSeconds=5&afterSeconds=5
```

| Parameter | Current handling |
| --- | --- |
| `ring` | Required integer 1–14; this replay bound is hard-coded independently of ingestion's configurable maximum |
| `camera` | Default 1; integer within configured cameras per ring |
| `timeEpochUs` | Required digits-only decimal epoch-microsecond string |
| `beforeSeconds`, `afterSeconds` | Default 5 each; finite, nonnegative, at most 30 each; total at most 60 |

HTTP parsing uses `searchParams.get(...) || default`, so a literal `"0"` is accepted while an empty duration parameter falls back to its default. Responses are JSON with `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`. Epoch-microsecond and PTS fields in this versioned manifest are decimal strings. This does not apply universally to PHP workflow JSON, which uses floating-point epoch seconds.

The top-level response is:

```text
ok: true
apiVersion: "1"
ring
requested: { camera, timeEpochUs, logicalStartEpochUs, logicalEndEpochUs }
retainedRange: { startEpochUs, liveEdgeEpochUs }
camera: { ...one camera, not an array... }
adjacent: { previous, next }
```

The `camera` object contains:

- `camera`, deterministic `streamId`, `available`, `codec`, `mimeType`, `width`, `height`, `fps`;
- `decodableStartEpochUs`: first returned GOP start, which may precede the logical request;
- `initialization`: first initialization resource or null;
- `initializations`: resources `{id, key, url, codec}`, grouped by session/configuration version;
- `fragments`: ordered `{id, url, initializationId, initializationKey, source, startEpochUs, endEpochUs, startPtsUs, endPtsUs, complete, sequenceGapCount, estimatedMissingBuffers}`;
- `gaps`: `{startEpochUs, endEpochUs}` between successive fragments when the separation exceeds 100,000 microseconds;
- `quality`: `{complete, sequenceGapCount, estimatedMissingBuffers}` aggregated over returned fragments.

Disk lookup selects overlapping indexed GOPs, ordered by start, with a 2,048-row limit. Safe file extents are combined with overlapping live RAM GOPs; RAM replaces disk when both have the same start/end pair. Resources without usable extent or initialization configuration are skipped. Each returned fragment refers to a decodable GOP; no transcode is performed.

`available` means at least one deliverable fragment exists. It does not guarantee coverage of the requested interval. `quality.complete` is true when at least one fragment exists and all returned fragments are marked complete; it does not incorporate the gap list or missing leading/trailing coverage. Gaps do not include uncovered request edges. Retained bounds come from the database and/or finalized RAM cache, not a promise that every point between the bounds is available.

`adjacent.previous` and `adjacent.next` are decimal timestamps equal to the logical interval's start/end. They are not opaque tokens or pagination handles. Clients request subsequent manifests explicitly; the capability `adjacentRanges` remains false. New manifests create new resource tokens, while initialization `key`/fragment timestamps support client deduplication.

## Initialization and media bytes

```text
GET /api/ivr/v1/media/{token}
OPTIONS /api/ivr/v1/...
```

Tokens are random 18-byte base64url identifiers, held in Node process memory. They expire after two minutes, can be evicted when the 10,000-token limit is reached, and disappear on restart. Initialization resources are generated in memory. RAM GOPs are remuxed in memory; disk fragments stream the indexed byte extent under the configured video directory. URLs do not take an arbitrary filesystem path and manifests do not expose SQL rows or file paths.

Successful media returns `Content-Type: video/mp4` and `Content-Length`. Initialization and closed-file extents receive `public, max-age=31536000, immutable`; RAM fragments and open-file extents receive `no-store`. Resource URLs still have the short token lifecycle above. There is no ETag/If-Match or HTTP byte-range/206 implementation. Media clients fetch complete token resources. A disconnected disk response destroys its input stream.

MSE playback appends the corresponding initialization before a fragment. The browser tracks stable initialization keys across manifests and sets `SourceBuffer.timestampOffset` from the fragment's server epoch start and camera PTS relative to the playback range. It maintains a common logical cursor across camera changes. Live playback polls every 400 ms; old buffered media is removed using a 30-second live buffer target. Fetches use AbortSignal for cancellation. Multi-camera live playback has independent players and bounded drift correction; it is client coordination, not a multi-camera server session.

### Errors

JSON errors have shape `{"ok":false,"error":{"code":"...","message":"..."}}`.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_ring`, `invalid_camera`, `invalid_time`, `invalid_duration` | Invalid replay parameters |
| 500 | `replay_lookup_failed` | Unexpected manifest lookup failure |
| 404 | `media_token_expired` | Unknown, evicted, or expired token |
| 409 | `fragment_incomplete` | Indexed disk extent exceeds current file size |
| 404 | `media_unavailable` | File/stat failure |
| 500 | `media_read_failed` | Disk stream failure before headers; after headers the response is destroyed |
| 404 | `not_found` | Unknown versioned resource/method |

An unavailable camera/range normally yields HTTP 200 with `available:false` and no fragments, not a dedicated camera-unavailable error. OPTIONS returns 204 with allowed methods GET/OPTIONS. Authorization/corrupt-media error categories proposed in the former document are not implemented as distinct contracts.

## Legacy replay routes

PHP `/api/replay.php` returns HTTP 410 `replay_api_moved`, directing callers to `/api/ivr/v1/replay` on the ingestion service.

Node legacy `/api/replay` uses `ring`, epoch-microsecond `time`, `before` (default 8), and `after` (default 4). It reports cached GOP metadata for configured cameras. A `source: "disk"` value when RAM has no rows does not mean disk was queried: that handler does not retrieve disk fragments. Use the versioned service for source-neutral delivery.

## PHP review workflow API

```text
GET  /review/api/review.php?ring=6
POST /review/api/review.php
Content-Type: application/json
```

POST uses an `action` discriminator, not REST resources under `/api/ivr/v1/reviews`. Common fields are `ring` (default 1, clamped 1–14) and, for record actions, `reviewId`.

| Action | Inputs / implemented effect |
| --- | --- |
| `create-request` | `side`, `origin`, `issueType`, `reason`, optional `issues` (up to two strings), `timestamp`, `matchNumber`, `round`, `preserveSelection`, `linkedReviewId`; creates RM |
| `select` | Pending/selected record only; demotes any other selected record to pending; rejects while a formal review is active |
| `deselect` | Demotes selected records to pending; rejects while a formal review is active |
| `start` | Selected record only, and no other active review; creates RST and sets Active |
| `mark-aur` | Active/completed only; `time` replaces AUR and appends the old value with replacement time to history |
| `resolve-without-review` | Pending/selected only; records disposition without RST |
| `set-result` | Active only; `result` is `accepted`, `rejected`, or `ivr_issue`; records decision and duration |
| `annotate` | Completed/resolved only; merges `annotation` fields and adds `updatedAt` |
| `delete-request` | Removes the matching request; UI limits the button to unfinished records, but the API itself does not enforce that status restriction |
| `reset` | Clears this ring's session reviews and review-number sequence |

Successful responses have `ok:true` and `data:{reviews, workflow:{selectedReviewId, activeReviewId}}`; mutations can additionally include `review` and `serverTime`. The server time anchor is `{epochSeconds, epochUs, iso}`. Records use floating-point epoch seconds for `rm`, `rst`, `aur`, and `decisionAt`, with additional decimal microsecond strings for some timestamps. `reviewDurationSeconds` is decision time minus RST, floored at zero.

Invalid transitions return HTTP 409 `invalid_state` or `active_review_locked`; missing records return 404 `review_not_found`; invalid request timestamps return 400 `invalid_timestamp`; unknown actions return 400 `invalid_action`. UI validation is stronger than parts of the API: reason option membership, required Other details, AUR replacement confirmation, and playback limits are browser behavior, not equivalent server authorization/validation rules.

### Current workflow semantics

- No review window is created. The old five/ten-second calculations, overlap moves, and outside-window warnings are removed.
- The UI captures server-anchored RM when Chung/Hong is pressed, opens the origin/type/reason modal, and saves only on submission. Cancel discards the provisional marker. API callers can supply their own valid positive timestamp.
- New requests auto-select only when no selected/active review exists and `preserveSelection` is false. The UI sets preservation for an already displayed request, including completed requests.
- IDs contain a sequence and suffix; display names hide the suffix (`R001`, etc.). The ring-session sequence is retained across deletion and cleared by reset.
- Requests carry match number and round. The Review Queue filters session records by these fields; legacy records without them use timeline start as a fallback. All statuses, including finalized ones, appear in the queue.
- Formal review records RST and freezes the displayed timeline there. Browser playback while reviewing is limited to RM. Results return live and clear display selection. Recording/ingestion continues independently.
- Unselect can clear browser display selection during formal review without calling the rejecting PHP deselect action. The formal clock/lock and RM bound remain active. This is distinct from changing server workflow status.
- AUR replacement history and post-result annotations exist; no optimistic concurrency, administrative correction API, automatic quota policy, or server enforcement of exactly-two-action review semantics exists. Optional `issues` and linkage are data fields, not a full rules engine.
- Start Round persists match details/start through `/review/api/match.php`. Stop Round freezes browser timeline/playback and can advance the page's round number; it is not a camera stop command or server end-round API. Round advancement is persisted when the next Start Round saves the match. Round three stops without the advance dialog.

### Persistence and later annotation limitation

Reviews, AUR history, decisions, and annotations are stored in PHP session data by ring, not written by this API to the `ivr_review_*` SQLite tables. Match details and ring camera configuration use SQLite through their own PHP APIs. Review data can survive a page refresh while its PHP session remains available, but durable recovery across sessions/dates and synchronized independent-client state are not implemented.

The database-backed `/review/report.php` reads separate persisted review tables and links to a match/round. It does not load a specific database review into the interactive session-backed API. Completing annotations at a later date across sessions is a forthcoming need; the presence of SQLite review tables is not evidence that this recovery path works.

## PSSEL and notifications

`GET /review/api/pssel.php?ring=6` returns mock events filtered to `match_start`, `match_stop`, `pause`, `resume`, `score`, and `penalty`, with `advisoryOnly:true`. No `/api/ivr/v1/pssel/events` webhook/query service or durable adapter deduplication/clock mapping is implemented.

The browser notification controller accepts `freeplay:server-notification` events or an externally configured EventSource (`notificationUrl` defaults null). It handles `camera-start-recording`, `camera-stop-recording`, and `pssel-event`, anchors time from supplied server timestamps, and deduplicates PSSEL IDs in browser state. This client hook is not an implemented ingestion-server SSE endpoint.

## Remaining boundaries and source references

Authentication, per-user resource authorization, durable workflow recovery, concurrency/version control, opaque continuation tokens, full requested-range completeness, and production PSSEL integration remain unimplemented. Versioned replay sets wildcard CORS and has no application authentication or authorization. Process-local bearer tokens are not user-bound grants and assume a controlled deployment. Disk extent containment is checked lexically against the configured video directory; it is not a full symlink security policy. General administration APIs may expose file paths or database-shaped records; the opaque-resource guarantee applies specifically to versioned replay manifests/media. No measured sub-second startup or 42-camera load guarantee is implied.

Primary references: `src/replay-service.js`, `src/freeplay.js`, `src/recorder.js`, `public/api/replay.php`, `public/review/api/review.php`, `match.php`, `camera-config.php`, `pssel.php`, `public/review/includes/api-common.php`, and the browser modules `replay-api.js`, `media-controller.js`, `mcv-live-controller.js`, `review-controller.js`, `request-reasons.js`, `round-controller.js`, `notification-controller.js`, and `server-clock.js` under `public/review/assets/js/`.

Relevant tests are `src/test/replay-service.test.js`, `recorder.test.js`, `protocol.test.js`, `ivr-client-rendering.test.js`, and `ivr-workflow.test.js`. For ingest/load suite operation, see [camera/server test plan](camera-server-protocol-test-plan.md). This document records source inspection, not a new runtime qualification run.
