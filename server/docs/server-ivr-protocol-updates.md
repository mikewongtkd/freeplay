# Prompt for Gemini in Visual Studio: FreePlay Server / IVR Protocol Updates

## System Architect's Attention Required

The existing replay endpoint resolves indexed GOP rows but does not define a complete browser media-delivery contract or durable IVR workflow API. Decide the following before production implementation.

### 1. Replay media transport

**Choice A — Versioned HTTP fMP4 range/segment API (recommended for the first production IVR):** return a metadata manifest with opaque initialization/media-fragment URLs, then fetch media fragments over HTTP.

- Pros: simplest Chrome integration; cacheable; debuggable; separates metadata and bytes; works with Media Source Extensions; avoids a permanent replay WebSocket.
- Cons: requires fragment-token/URL lifecycle design; reverse review still needs client-side decoded-frame caching or repeated seeks; many small requests must be managed.

**Choice B — Replay WebSocket carrying multiplexed fMP4 fragments:** open a replay session and push binary media plus control messages.

- Pros: low request overhead; explicit cancellation/backpressure; convenient server push for adjacent media.
- Cons: more client/server state; harder HTTP caching and diagnostics; reconnect/recovery is more complex; multiplexing three cameras needs a new binary envelope.

**Choice C — Generated per-request MP4 clips:** assemble downloadable/playable files for requested windows.

- Pros: simple `<video>` usage and archival sharing.
- Cons: startup and file-generation latency; artificial clip boundaries; weak fit for continuous navigation; additional disk/CPU churn. Do not choose this as the primary 30-second IVR path.

### 2. Recent RAM versus disk retrieval ownership

**Choice A — Node owns one replay API for RAM and disk (recommended):** Node resolves live cache and indexed storage and exposes one source-neutral contract to PHP/browser.

- Pros: one timeline/retrieval implementation; recent-cache access is direct; source transitions can be transparent.
- Cons: expands the Node service surface and requires safe concurrent file access.

**Choice B — PHP handles disk and proxies recent requests to Node:** preserve the current PHP endpoint for historical disk rows.

- Pros: smaller change to existing administration APIs.
- Cons: duplicated range/quality logic; difficult seamless RAM-to-disk transitions; greater risk that clients observe inconsistent response shapes.

### 3. IVR workflow persistence

**Choice A — Add server-authoritative IVR resources to SQLite/API (recommended):** persist Request Mark, Review Window, RST, AUR, result, linkage, annotation, and integrity snapshot.

- Pros: refresh recovery, auditability, deterministic multi-client behavior, and immutable results.
- Cons: requires schema migration, authorization model, and concurrency/version handling.

**Choice B — Keep workflow in the IVR browser:** use the server only for media.

- Pros: minimal server work for demonstrations.
- Cons: violates the requirements for authoritative timestamps, refresh recovery, auditability, and deterministic state. Suitable only for the existing prototype.

### 4. PSSEL ownership

**Choice A — Server webhook plus normalized query API (recommended):** adapters post events to the server, which filters/normalizes and maps them to the FreePlay timeline.

- Pros: authoritative correlation and shared results for all IVR clients; adapters remain isolated.
- Cons: requires clock-mapping/error handling and source authentication.

**Choice B — Direct client integration:** browser connects to a PSS adapter.

- Pros: less initial server code.
- Cons: violates server abstraction, complicates trust/CORS, duplicates mapping, and weakens auditability. Do not select for production.

## Your task

You are working in the existing FreePlay server repository in Visual Studio. Implement the architect-approved choices without changing camera-to-server FPV1 semantics unless strictly necessary. Preserve continuous camera ingestion and recording. Do not expose filesystem paths, SQLite rows, or raw Android monotonic timestamps to the browser.

Read these files before editing:

- `docs/server-protocol.md`, especially Sections 38–41;
- `docs/ivr-review/system-requirements.md`, especially FR-020–028, FR-040–052, FR-080–097 and the NFRs;
- `docs/ivr-review/use-cases.md`;
- `public/review/README.md`;
- `public/api/replay.php`;
- the replay cache, GOP index, fragmented-MP4 writer, database schema, and API routing code under `src/` and `public/api/`.

## Required protocol behavior

### A. Version and capabilities

Provide `GET /api/ivr/capabilities` with a stable response including:

```json
{
  "apiVersion": "1",
  "serverTimeEpochUs": "1788298642354913",
  "features": {
    "multiCameraReplay": true,
    "adjacentRanges": true,
    "reviewPersistence": true,
    "pssel": true
  },
  "media": {
    "container": "video/mp4",
    "codec": "avc1",
    "transport": "http-fmp4-mse"
  }
}
```

Represent epoch-microsecond values as decimal strings in JSON so JavaScript does not lose integer precision.

### B. Source-neutral multi-camera replay manifest

Replace or version the current conceptual `GET /api/replay.php?ring=...` contract with:

```text
GET /api/ivr/v1/replay?ring=6&timeEpochUs=<decimal>&beforeSeconds=8&afterSeconds=4
```

The manifest must:

- resolve exactly the expected cameras for the ring;
- distinguish the requested logical interval from the earlier decodable start;
- return opaque media URLs or tokens, never database rows or file paths;
- work identically when media comes from RAM, disk, or crosses their boundary;
- include initialization data/resource identity required after codec-configuration changes;
- expose ordered fragments with exact common-timeline start/end times;
- expose completeness, gaps, sequence-loss estimates, session discontinuities, codec changes, and sync-quality metadata;
- report unavailable ranges explicitly per camera;
- include a bounded continuation mechanism for earlier/later adjacent media;
- allow request cancellation and prevent unbounded server/client buffering;
- remain read-only and not pause ingestion.

Suggested shape:

```json
{
  "apiVersion": "1",
  "ring": 6,
  "requested": {
    "timeEpochUs": "1788298642354913",
    "logicalStartEpochUs": "1788298634354913",
    "logicalEndEpochUs": "1788298646354913"
  },
  "retainedRange": {
    "startEpochUs": "1788298000000000",
    "liveEdgeEpochUs": "1788298647000000"
  },
  "cameras": [
    {
      "camera": 1,
      "streamId": "ring6_cam1",
      "available": true,
      "decodableStartEpochUs": "1788298634000000",
      "logicalAvailableStartEpochUs": "1788298634354913",
      "logicalAvailableEndEpochUs": "1788298646354913",
      "initialization": {"id": "init-17", "url": "/api/ivr/v1/media/init-17"},
      "fragments": [
        {"id": "frag-92", "startEpochUs": "1788298634000000", "endEpochUs": "1788298635000000", "url": "/api/ivr/v1/media/frag-92", "complete": true}
      ],
      "gaps": [],
      "quality": {"complete": true, "sequenceGapCount": 0, "estimatedMissingBuffers": 0, "syncOffsetMs": 12}
    }
  ],
  "adjacent": {"previous": "opaque-token", "next": "opaque-token"}
}
```

Validate ring, timestamp, duration, token scope, and maximum response size. Use prepared SQL. Preserve camera ordering. Add cache-control suitable for immutable historical fragments and no-store for live manifests.

### C. Browser media responses

Implement the selected media transport with:

- `Content-Type: video/mp4`;
- byte ranges if resources can be large;
- opaque identifiers mapped server-side to safe approved media extents;
- no arbitrary path parameter;
- cancellation/disconnect cleanup;
- correct initialization segment whenever codec configuration changes;
- immutable ETag/cache headers for closed historical media;
- explicit errors distinguishing expired media, camera unavailable, lookup failure, corrupt/incomplete media, and authorization failure.

Document Media Source Extensions append order and timestamp mapping. Do not transcode during normal replay.

### D. Server-authoritative IVR workflow API

Add versioned resources/actions equivalent to:

```text
POST  /api/ivr/v1/reviews                 create RM/window
POST  /api/ivr/v1/reviews/{id}/start      create RST
POST  /api/ivr/v1/reviews/{id}/aur        create/replace AUR
POST  /api/ivr/v1/reviews/{id}/resolve    Resolved without Review, pending only
POST  /api/ivr/v1/reviews/{id}/result     Accepted/Rejected/Rejected: IVR Issue, active only
PATCH /api/ivr/v1/reviews/{id}/annotation post-result detail
GET   /api/ivr/v1/reviews?ring=6&match=... history/recovery
GET   /api/ivr/v1/reviews/{id}
```

Enforce these state rules atomically:

- RM and coach Review Window are created before formal review;
- coach window is exactly RM−5 seconds through RM;
- Start Review records a new RST and begins an active review without selecting a camera;
- Resolved without Review is valid only before RST and creates no RST;
- formal results are valid only for an active review and immediately record decision time/end it;
- annotations remain editable after the timed result without changing decision duration;
- one review has at most one active AUR; replacement is recorded/audited;
- out-of-window coach AUR is warned/recorded, not rejected by the API;
- a two-action request stores two issue records but one RM/window/RST/clock/AUR;
- a permitted second review is a distinct record with its own RM/RST/result and a `linkedReviewId`; it never overwrites the first;
- finalized decision timestamps/results are immutable except through an explicit privileged administrative correction workflow;
- referee/official requests do not change coach quota;
- `Rejected: IVR Issue` remains distinct from ordinary rejection and its quota policy is configuration metadata, not hard-coded rules text.

Use optimistic concurrency (`version` or ETag/If-Match) so two browsers cannot silently overwrite a review.

### E. PSSEL webhook and query

Implement:

```text
POST /api/ivr/v1/pssel/events
GET  /api/ivr/v1/pssel/events?ring=6&startEpochUs=...&endEpochUs=...
```

Adapters must normalize and the server must accept for the IVR timeline only:

- match start/stop;
- pause/resume;
- scoring events;
- penalty events.

Store source timestamp, mapped FreePlay epoch timestamp, match/round identifiers, display time, event type, side, scores, and penalties when available. Deduplicate retried webhook events. Report clock-mapping confidence/uncertainty. Treat events as advisory navigation context; never modify authoritative scoring from this API.

### F. Tests and documentation

Add automated tests for:

1. JavaScript-safe timestamp serialization;
2. all-three-camera resolution and stable ordering;
3. RAM-only, disk-only, RAM/disk boundary, physical-file boundary, and session boundary retrieval;
4. decodable-start/keyframe and initialization association;
5. explicit per-camera gaps and partial-camera success;
6. adjacent previous/next retrieval without duplication or gaps;
7. expired/unavailable/corrupt media errors;
8. continuous ingestion while multiple replay requests run;
9. review lifecycle state transitions and invalid transition rejection;
10. result immutability, annotation-after-result, second-review linkage, and two-action semantics;
11. PSSEL allow-list filtering, timestamp mapping, deduplication, and advisory-only behavior;
12. resource bounds, authorization boundaries, path traversal rejection, and concurrent clients.

Update `docs/server-protocol.md` with the approved versioned wire contract, error schema, examples, state machine, media lifecycle, limits, and security assumptions. Update the IVR client adapter while keeping its controller interfaces unchanged.

## Completion criteria

- The production IVR client can replace the prototype mock service without changing review, camera, playback, timeline, or input-controller semantics.
- Chrome can begin recent replay in under the current one-second engineering target on a healthy tournament LAN.
- Camera switching preserves one common logical cursor.
- Playback can request adjacent retained media across GOP, file, session, and RAM/disk boundaries without operator-visible storage boundaries.
- Missing or impaired media is never silently represented as complete.
- Review records survive browser refresh and are deterministically shared across authorized clients.
- No browser endpoint exposes server filesystem paths or internal SQLite rows.
- Existing FPV1 ingestion, recording, and ingestion test suites remain passing.
