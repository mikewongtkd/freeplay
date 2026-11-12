# FreePlay Thumbnail Timeline API

**Target:** VS Code, existing FreePlay ingestion-server repository  
**Task:** Implement an iMovie-style, timestamp-indexed video thumbnail API for the FreePlay IVR client.  
**Scope:** Server only; do not edit Android camera or IVR client repositories.  
**Platforms:** Apple Silicon Mac mini and Raspberry Pi 5 (64-bit Linux) with NVMe storage.

Implementation status: the server extension is implemented. This document retains the feature brief; [thumbnail API and operations](thumbnail-service.md) specifies the delivered behavior, limits, and qualification boundaries. Follow the current [ingestion protocol](ingestion-protocol.md) and [IVR protocol](ivr-protocol.md); the additions below are limited to thumbnail generation and delivery.

## Your assignment

You are Codex working in the existing FreePlay ingestion-server codebase. **Implement, test, and document** an asynchronous, cached thumbnail service that returns sampled visual frames for a specified camera and server-authoritative time range. Do not merely propose an architecture. First inspect the repository to determine the actual file layout, Node.js server, SQLite schema, GOP/fMP4 media representation, camera registry, HTTP routes, authentication, logging, and test infrastructure. Adapt the solution to the real code. Do not invent filenames, database columns, endpoints, or existing capabilities.

Before changing code:

1. Read the server README, protocol specification, architecture documents, package manifest, and existing tests.
2. Identify the exact port-9000 HTTP/WebSocket entry point and the existing IVR API routing conventions.
3. Trace how a `streamId` maps to ring/camera, recorded GOPs, their **server-authoritative timestamps**, session/configuration boundaries, codec initialization data, segment/file paths, and retention.
4. Identify how fMP4 initialization segments, SPS/PPS, keyframes, and partial/active files are handled.
5. Identify existing configuration, observability, HTTP/CORS/token conventions, and storage-cleanup mechanisms. Do not assume authentication or automatic source-video retention already exists.
6. Record the current git status and preserve all unrelated user changes. Do not reset, overwrite, or broadly refactor unrelated code.
7. Present a concise implementation plan and list any blocking unknowns, then implement unless genuinely blocked.

### Non-negotiable invariants

- Preserve existing **FPV1 32-byte binary header**, ingest WebSocket, H.264 buffer handling, GOP index, fMP4 recording, replay, camera registration, and existing IVR hooks. Do not add camera remote start/stop or production PSSEL services; these are not existing server protocol capabilities.
- Do not perform H.264 decoding, image resizing, image encoding, filesystem scans, or blocking child-process execution on the Node.js ingest event loop.
- **Recording and active replay always have priority over thumbnail creation.** Thumbnails are optional derived data; they may be delayed, skipped, or shed under load.
- Do not transcode or re-encode the recorded video archive.
- Do not require a GPU or hardware H.264 decoder. Raspberry Pi 5 must work with a supported software-decoding fallback.
- Do not add a second externally required port; expose APIs through the existing ingestion server, normally TCP **9000**.
- Avoid unbounded process creation, CPU work, queues, memory, image dimensions, and cache growth.
- Do not assume a one-second GOP is an exact wall-clock interval; use the actual GOP/keyframe index and source timestamps.
- Keep media and thumbnails from different camera identities, recording sessions, and **stream generations** isolated.
- Do not infer continuous recording across missing GOPs, camera stops, reconnects, PTS resets, or generation boundaries.
- Prefer existing libraries, dependencies, service patterns, and security conventions; introduce new dependencies only with a clear justification.

## Feature requirements

### 1. API contract

Implement a metadata endpoint using the existing versioned replay route style:

```http
GET /api/ivr/v1/thumbnails?ring=6&camera=2&startEpochUs=1790365100000000&endEpochUs=1790365160000000&intervalMs=5000&width=240
```

Identify the camera with validated `ring` and `camera` query parameters, as in `/api/ivr/v1/replay`, never a browser-provided filesystem path or socket identifier. Serve these routes through the existing port-9000 HTTP router; do not add camera WebSocket messages or another port.

**Parameters:**

- `startEpochUs`, `endEpochUs`: decimal-string Unix epoch microseconds on the FreePlay **server timeline**, inclusive start, exclusive end; parse safely with `BigInt` or an existing lossless timestamp abstraction. Do not silently round through JavaScript `Number` at microsecond precision.
- `intervalMs`: positive integer requested sampling spacing; default **5000 ms**. Initial configurable minimum **1000 ms**, maximum **60000 ms**. A client may request 1000 ms for a short zoomed-in review and 5000–10000 ms for longer spans.
- `width`: positive integer thumbnail width; default **240 px**; configurable bounds, e.g. **80–480 px**. Preserve aspect ratio, typically 16:9. Never trust arbitrary image dimensions.
- Cap sample count per request (initial default **120**, configurable). Reject excessive requests with structured `400` rather than silently allocating enormous work.
- Validate range ordering, duration, camera existence, and timestamps. Distinguish an unknown camera from a known camera with no recording in the requested interval.

Return deterministic, ordered sample slots with **both the requested sample timestamp and actual decoded frame timestamp**. The sample selection policy must be documented: choose the nearest eligible independently decodable indexed frame within a configurable tolerance, preferably at/before the sample to avoid using future action imagery. Never claim the requested time is the exact frame time if it is not.

Successful metadata responses use HTTP **200**, including when all samples are pending, and the existing top-level `ok` and `apiVersion` convention (no additional `data` wrapper):

```json
{
  "ok": true,
  "apiVersion": "1",
  "ring": 6,
  "camera": 2,
  "streamId": "ring6_cam2",
  "startEpochUs": "1790365100000000",
  "endEpochUs": "1790365160000000",
  "intervalMs": 5000,
  "width": 240,
  "samples": [
    {
      "requestedEpochUs": "1790365100000000",
      "actualEpochUs": "1790365099866000",
      "sessionId": "4",
      "status": "ready",
      "imageUrl": "/api/ivr/v1/thumbnails/opaque-token.jpg"
    },
    {
      "requestedEpochUs": "1790365105000000",
      "actualEpochUs": "1790365104987000",
      "sessionId": "4",
      "status": "pending",
      "imageUrl": null
    },
    {
      "requestedEpochUs": "1790365110000000",
      "actualEpochUs": null,
      "sessionId": null,
      "status": "unavailable",
      "reason": "recording_gap",
      "imageUrl": null
    }
  ]
}
```

Use stable statuses at least `ready`, `pending`, and `unavailable`; include safe, machine-readable reasons for unavailable/failed work. An in-progress thumbnail should not cause the metadata request to wait for a full decode. Do not introduce HTTP 202 or a separate job-status API. Clients poll this same metadata endpoint to observe completed work. A GET may populate the internal derived-data cache, but must not modify source recordings or review records; repeated requests must coalesce identical jobs.

Implement a separate image-byte endpoint, following the existing opaque media-resource approach:

```http
GET /api/ivr/v1/thumbnails/{token}.jpg
```

- Serve only validated cache entries, not arbitrary paths.
- Return `Content-Type: image/jpeg` and an appropriate `Content-Length`. Use `Cache-Control: no-store` initially; do not introduce ETags, Last-Modified validators, conditional GET, or byte-range handling in this implementation.
- Return a controlled `404`/`410` for purged or unavailable images.
- Never leak absolute disk paths. Resolve opaque tokens server-side to validated thumbnail cache entries.
- Reuse the existing process-local resource-token conventions and bounds (currently two-minute lifetime and a 10,000-token registry). Tokens may expire, be evicted, or disappear on restart; they are not durable image identifiers. Polling metadata can issue replacement tokens for existing cached images without decoding again. Do not change existing replay-token behavior.


Metadata and JSON image errors must use the existing error envelope:

```json
{
  "ok": false,
  "error": {"code": "invalid_request", "message": "Describe the invalid thumbnail request."}
}
```

Use HTTP 400 for invalid parameters, including excessive sample counts; retain controlled 429/503 overload responses where applicable. Match replay's cross-origin behavior: `Access-Control-Allow-Origin: *` on thumbnail metadata, images, and errors, and OPTIONS support for GET/OPTIONS. Metadata responses use `Cache-Control: no-store`. Do not add authentication, authorization scopes, login flows, signed URLs, or a new capabilities endpoint as part of this feature. The current server has no IVR authentication layer; thumbnail access inherits its controlled-LAN deployment boundary and opaque bearer-token limitations. These are explicit current limitations, not claims of access enforcement.

### 2. Sampling and indexing

Build sample selection on the **existing SQLite GOP/keyframe index**, not by scanning the whole video directory on each request. Find the actual indexed frame/GOP near each requested sample time. Keep the mapping between tablet PTS and server epoch time consistent with the current ingestion/replay implementation.

Critical details:

- Distinguish *H.264 keyframes/IDR access units* from browser-displayable JPEG/WebP thumbnails.
- Some H.264 keyframes are not independently decodable without codec configuration; provide the correct SPS/PPS or fMP4 initialization segment to the decoder.
- Handle GOPs that straddle file/segment boundaries and cases where an indexed frame is not immediately decodable from a standalone file. Use the existing media abstraction to reconstruct a valid input rather than guessing offsets.
- Do not assume all keyframes occur precisely at integer seconds.
- Preserve gaps as `unavailable`, not as thumbnails borrowed from another recording interval.
- When a recording is currently active, do not read partially written media unsafely. Generate from a completed/indexed GOP or a stable finalized segment, or explicitly mark the sample `pending` until it is safe.
- Session/reconnect and codec-config changes are hard decoding/cache boundaries. Use existing session IDs and configuration versions to represent source generations; do not add an Android stream-generation field or a new camera protocol.
- If a requested sample has no suitable keyframe within tolerance, report unavailable; do not seek arbitrarily far and misrepresent the timeline.
- A video keyframe is not necessarily a complete GOP; `mediaReady` for live replay and thumbnail-decodability are related but separate conditions.

### 3. Asynchronous thumbnail generation

Introduce a bounded thumbnail job service with:

- one queue shared across requests, configurable worker concurrency;
- **initial defaults: Raspberry Pi 5 = 1 worker, Mac mini = 2 workers** (configuration-driven, not brittle machine-name detection);
- queue capacity and per-client/request admission limits;
- duplicate-job coalescing: identical camera/generation/frame/size requests share one job;
- timeout and cancellation for child processes or worker tasks;
- safe cleanup of temporary files and partially generated images;
- retries only for transient failures, with bounded attempts/backoff;
- priority lower than video ingest and time-critical replay;
- overload behavior that returns `pending`/`unavailable` or controlled `429`/`503`, without dropping recording buffers;
- graceful shutdown and restart handling; incomplete jobs must not masquerade as ready cache entries.

Use a supported FFmpeg executable/library in a **separate worker process or bounded subprocess pool**, or another existing proven decoder already used by the server. Do not spawn one unconstrained FFmpeg process per sample. Batch frames where advantageous; choose a maintainable first implementation rather than prematurely building a custom H.264 decoder. Use software decoding on Pi 5 if necessary. Document FFmpeg dependency/version checks and actionable startup diagnostics when missing. Thumbnail extraction must not rely on frame-perfect seek semantics unsupported by the media layout.

Generate **JPEG initially** for broad Chrome compatibility; WebP may be added if the existing stack supports it. Resize with preserved aspect ratio; initial default 240 px wide. Strip unnecessary metadata; never embed private paths or device information in images.

### 4. Cache on NVMe / video storage

Cache images on the existing configured video/data storage volume, in a dedicated thumbnail subtree. Do not place high-volume thumbnails in SQLite BLOBs. Store only small metadata/index records in SQLite if justified by the existing schema.

Cache key must uniquely account for at least:

- logical camera/stream identity;
- recording session or source-file identity where needed;
- stream generation;
- actual source frame timestamp / indexed GOP identity;
- requested output dimensions and image format;
- thumbnail extraction algorithm/version if output changes could invalidate old images.

Use safe deterministic or opaque hashed paths; do not interpolate untrusted route values directly into filesystem paths. Write temporary images and atomically rename only after successful validation. Avoid serving incomplete files.

Invalidate/delete thumbnail entries when their source video is no longer available, using bounded reconciliation and independent thumbnail-cache eviction. Automatic source-video retention/deletion is not implemented in the current server; do not add a source-video retention service as a prerequisite. Never allow thumbnail cleanup to delete source video.

Cache storage examples at 12 KB per 240px JPEG, every 5 seconds for 10 hours:

| Rings | Cameras | Approximate thumbnail storage |
|---:|---:|---:|
| 1 | 3 | 86 MB |
| 4 | 12 | 346 MB |
| 8 | 24 | 691 MB |
| 14 | 42 | 1.21 GB |

These are **planning estimates**, not image-size guarantees. Make cache size observable and configurable. Provide bounded cache eviction if source-video retention is not sufficient.

### 5. Background pre-generation and on-demand behavior

Support two complementary modes:

**A. Default background generation:** schedule one sample approximately every **5 seconds per active camera** after the corresponding GOP/segment is safely available. Do not decode in the ingest callback. Scheduling must be bounded and may skip work under load; avoid building an ever-growing backlog.

**B. On-demand detail generation:** when IVR requests a zoomed-in interval (e.g. **1-second** samples across a 30-second review), return existing cached images immediately and queue missing samples. The client can retry the metadata endpoint or receive a completion notification if an existing IVR WebSocket event channel makes that easy. Do not make WebSocket notifications a mandatory prerequisite for the MVP.

Prefer to generate an existing cached 5-second sample only once regardless of how many IVR clients request it. Ensure a request for one camera cannot starve other cameras indefinitely; use fair scheduling or a simple bounded per-camera quota.

### 6. Performance and operational safeguards

Target normal deployment profiles:

| Platform | Normal ring capacity | Initial workers | Default sampling |
|---|---:|---:|---:|
| Raspberry Pi 5, 8 GB, NVMe | 1–4 rings | 1 | 5 seconds |
| Mac mini M2/M2 Pro class | 7–8 rings per node | 2 | 5 seconds |

These are deployment/qualification targets, **not guaranteed measured throughput**.

At 6 Mb/s, 1080p30, three cameras per ring, default 5-second sampling implies:

- 4 rings / 12 cameras: average **2.4 thumbnails/sec**;
- 8 rings / 24 cameras: average **4.8 thumbnails/sec**;
- 14 rings / 42 cameras: average **8.4 thumbnails/sec**.

Do not assume these rates will be sustained without testing. Ensure the thumbnail service has configurable CPU/process concurrency, timeout, queue depth, and cache size limits. When overloaded, reduce or defer thumbnail generation before ingest is affected. Avoid aggressive disk reads during critical replay operations if existing metrics permit detecting them.

Suggested acceptance targets (measure and report; do not claim achieved without benchmarks):

- cached metadata response: **< 200 ms** on a local LAN under normal load;
- cached image delivery: low-latency local response, measured separately;
- uncached 30-second timeline: **< 1 second on Mac mini**, **< 2 seconds on Pi 5** as aspirational targets, not hard guarantees;
- **zero video ingest drops attributable to thumbnail processing**;
- bounded queue depth and memory growth during 12–24-hour endurance testing.

Instrument at least:

- cache hit/miss ratio;
- queued/running/completed/failed thumbnail jobs;
- queue wait time and generation duration;
- per-worker CPU or process runtime if practical;
- current thumbnail cache bytes;
- failures by reason;
- dropped/skipped background samples;
- impact on ingest queue age, event-loop delay, and GOP finalization latency.

Use existing logging/metrics conventions and avoid high-volume per-thumbnail logs at normal severity.

### 7. Security and failure behavior

- Follow the current replay service’s controlled-LAN and wildcard-CORS access model. No authentication or per-user authorization is implemented today, and adding either is outside this task.
- Validate logical camera/ring identifiers and opaque tokens; never treat an opaque token as proof of user authorization.
- Validate numeric bounds and image sizes before queuing work.
- Never accept arbitrary file paths, FFmpeg options, shell fragments, or filter expressions from the browser.
- Invoke FFmpeg with an argument array and no shell interpolation.
- Limit subprocess CPU/memory/time exposure as supported by the platform.
- Do not return absolute filesystem paths, raw FFmpeg stderr, stack traces, or sensitive internal details to IVR clients.
- Handle missing FFmpeg, missing video, malformed/corrupt H.264, absent codec config, stale GOP index, partial files, permission failures, storage full, camera disconnect, and cache deletion gracefully.
- The thumbnail feature must be **feature-flagged** so the entire service can be disabled without changing normal ingest/replay behavior.

### 8. Tests — implement, not just describe

Add tests using existing repository conventions. At minimum:

**API validation**

- valid range/interval/width and ordered samples;
- invalid or reversed range, malformed/unsafe microsecond values, excessive samples, width out of range;
- unknown camera, invalid camera/ring, no video, and recording gaps;
- exact requested versus actual frame timestamps and tolerance behavior;
- no unsafe precision loss with epoch-microsecond strings.

**Media and generation**

- one-second GOPs sampled at 5-second intervals;
- non-integer keyframe timestamps;
- codec configuration needed to decode a keyframe;
- stream stop/restart and PTS reset;
- two stream generations covering one requested time range;
- missing/corrupt GOP and partially written active segment;
- no cross-camera or cross-generation image reuse;
- no future-frame substitution when policy requires at/before sampling.

**Jobs/cache**

- duplicate concurrent requests coalesce;
- queue saturation and worker timeout;
- process failure does not poison cache;
- atomic image publish and cleanup of temporary files;
- cache hit avoids FFmpeg invocation;
- cache eviction and video-retention cleanup;
- service disabled does not alter ingest;
- restart recovers safely from pending jobs.

**Integration**

- build a tiny **synthetic H.264/fMP4 fixture** using FFmpeg or a checked-in redistributable test fixture; no real tournament footage required;
- index the fixture using the existing ingestion/index logic when possible;
- call the actual port-9000 metadata endpoint;
- fetch and verify image content type, nonempty image dimensions, and cache headers;
- request again and verify cache reuse;
- simulate simultaneous ingest/replay activity and assert thumbnail workers cannot block the Node event loop or grow queues without bound;
- verify compatibility with Mac ARM64 and Raspberry Pi ARM64 runtime expectations.

Do not claim actual Mac mini or Pi hardware benchmarks unless those devices were tested. Provide an executable benchmark command or script that runs against each deployed platform and measures throughput, latency, and ingest interference.

### 9. Documentation and configuration

Document the actual route names, response schema, image endpoint, timestamp selection semantics, interval/width bounds, status meanings, FFmpeg prerequisite, cache directory, feature flag, worker settings, retention behavior, and client retry strategy.

Suggested configurable names (adapt to the project's configuration scheme):

```text
THUMBNAILS_ENABLED=true
THUMBNAIL_DEFAULT_INTERVAL_MS=5000
THUMBNAIL_MIN_INTERVAL_MS=1000
THUMBNAIL_MAX_INTERVAL_MS=60000
THUMBNAIL_DEFAULT_WIDTH=240
THUMBNAIL_MAX_WIDTH=480
THUMBNAIL_MAX_SAMPLES_PER_REQUEST=120
THUMBNAIL_WORKERS=1                  # Pi; set 2 on Mac
THUMBNAIL_QUEUE_MAX=256
THUMBNAIL_JOB_TIMEOUT_MS=10000
THUMBNAIL_CACHE_DIR=<configured video volume>/thumbnails
```

These are **illustrative** names and defaults, not instructions to introduce an incompatible second configuration system.

Document how an IVR developer should render a strip of thumbnails, poll `pending` samples, represent `unavailable` gaps, and map actual image timestamps to the existing server timeline. Do not implement the IVR UI in this task.

### 10. Implementation order

1. Inspect repository, media index, API patterns, and tests; report assumptions.
2. Add timestamp-safe sample planner backed by the real GOP index.
3. Add cache identity, safe pathing, and image metadata.
4. Implement bounded worker/process management and FFmpeg extraction.
5. Implement metadata and image APIs on the existing port-9000 server.
6. Implement optional background 5-second scheduling and on-demand 1-second detail jobs.
7. Integrate source-video retention and generation invalidation.
8. Add configuration, metrics, and operational failure handling.
9. Add unit/integration tests and benchmark script.
10. Run existing tests, lint, typecheck, build/startup smoke tests, and new tests.
11. Update documentation and provide a precise final report.

### 11. Precision-change discipline

**Do not** refactor FPV1 framing, replace the existing media index, change camera protocols, alter WebSocket routes unnecessarily, migrate SQLite wholesale, rewrite the replay API, or modify UI files merely to make thumbnail generation convenient. Prefer additive, testable modules and small integrations at existing extension points. If a necessary change touches a sensitive ingest/replay path, explain why and add regression tests around it.

When the repository's actual capabilities differ from assumptions in this prompt, **do not fabricate compatibility**. Identify the mismatch, use the smallest sound implementation, and document any deferred item. If there is no trustworthy mapping from indexed GOP timestamps to actual server epoch time, stop and report that blocker before exposing misleading thumbnail timestamps.

### 12. Final report format

When done, provide:

1. **Implemented behavior** and actual endpoint URLs on port 9000.
2. **Files changed**, with brief rationale.
3. **Sample selection policy** and actual-vs-requested timestamp treatment.
4. **Decoder strategy**, FFmpeg invocation pattern, Pi software-decoding compatibility.
5. **Worker limits, queue behavior, cache layout, and retention cleanup**.
6. **Input/path safety, CORS, token lifecycle**, and inherited controlled-LAN access limitations.
7. **Tests and commands executed**, with pass/fail results; clearly mark tests not run.
8. **Benchmark results**, if measured, or exact instructions to run them on Mac mini and Pi 5.
9. **Remaining integration work** for the IVR thumbnail strip.
10. **Unresolved risks** or architecture assumptions.

**Completion criteria:** An IVR client on the controlled LAN can request a bounded timestamp range on port 9000, promptly receive ordered `ready`/`pending`/`unavailable` sample metadata, fetch cached JPEG thumbnails through the opaque-token image endpoint, and obtain newly generated thumbnails asynchronously without compromising existing FPV1 recording and replay. Both Mac mini and Raspberry Pi 5 use the same API, with configurable resource limits.
