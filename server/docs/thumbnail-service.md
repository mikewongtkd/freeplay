# Thumbnail service: API and operations

Implemented server-only extension to the HTTP listener (normally port 9000). Camera FPV1, archive encoding, review workflow, and the IVR UI are unchanged. See [the implementation brief](thumbnail-generation.md), [IVR protocol](ivr-protocol.md), and [ingestion protocol](ingestion-protocol.md).

## Prerequisites and startup

Use the existing supported Node runtime and install `src/package.json` dependencies, including a `better-sqlite3` native build for that runtime/platform. Install FFmpeg with software H.264 decoding and MJPEG encoding; no GPU is required. Verify it with `ffmpeg -version`. `THUMBNAIL_FFMPEG` can name an absolute executable path. The service checks it asynchronously at startup and reports an actionable `thumbnail_decoder_unavailable` diagnostic if it cannot run. Missing FFmpeg does not prevent ingestion or replay startup.

```sh
cd src
THUMBNAILS_ENABLED=true THUMBNAIL_WORKERS=1 npm start
```

Use one FFmpeg worker for an initial Raspberry Pi 5 deployment, or explicitly set `THUMBNAIL_WORKERS=2` for a Mac mini. The default is conservatively one on every platform; there is no machine-name detection. ARM64 software decoding uses the same code and API. These settings are initial qualification profiles, not capacity guarantees.

## HTTP contract

```text
GET /api/ivr/v1/thumbnails?ring=6&camera=2&startEpochUs=1790365100000000&endEpochUs=1790365160000000&intervalMs=5000&width=240
GET /api/ivr/v1/thumbnails/{token}.jpg
OPTIONS /api/ivr/v1/thumbnails...
```

The metadata interval is `[startEpochUs, endEpochUs)`. Timestamps are positive decimal strings within signed SQLite 64-bit integer bounds. Planning/query bindings use BigInt without converting through Number. Ring/camera are required validated integers; unknown registered cameras return 404 `unknown_camera`, while known cameras with no eligible recording return unavailable sample slots.

Metadata uses HTTP 200, `Cache-Control: no-store`, and this envelope:

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
    }
  ]
}
```

A sample is `ready`, `pending`, or `unavailable`. Pending/unavailable samples have a null image URL; unmatched slots also have null actual time/session. Unavailable samples include a safe `reason`, such as `recording_gap`, `codec_configuration_missing`, `incomplete_gop`, `keyframe_unavailable`, `queue_full`, `source_pending`, `source_unavailable`, `source_too_large`, `source_dimensions_exceeded`, `decoder_unavailable`, `decoder_timeout`, `decode_failed`, `invalid_image`, `cache_capacity`, or `generation_failed`. OS/filesystem details and decoder stderr are not returned. Failure reasons are negative-cached for 30 seconds, except incomplete disk extents (`source_pending`) for one second; a subsequent metadata request can retry. There is no autonomous retry loop or separate job-status API.

Invalid parameters return 400 `invalid_request`; admission overload returns 429 `thumbnail_busy`; startup/disabled/worker failure returns 503 `thumbnail_unavailable`. A metadata timeout returns 503 `thumbnail_busy`. Images return 404 `image_unavailable` when their token, cached image, or source is unavailable. Wrong methods return 405 `method_not_allowed`. JSON errors follow `{"ok":false,"error":{"code":"...","message":"..."}}`.

JPEG responses include `Content-Type: image/jpeg`, `Content-Length`, and `Cache-Control: no-store`. OPTIONS returns 204 and GET/OPTIONS methods. All thumbnail routes/errors use replay's wildcard CORS. There are no ETags, conditional GET, signed URLs, HTTP range responses, or new authentication/capability endpoints.

Image URLs share the existing replay service's process-local token registry: random tokens, two-minute lifetime, 10,000-resource cap shared with replay, restart/eviction invalidation. Polling ready samples issues new tokens without decoding again. Thumbnail tokens cannot be used to read arbitrary files or served as replay MP4 resources. Tokens are bearer references, not user authorization; deployment remains a controlled-LAN service.

## Sample selection and time meaning

For each requested timestamp, query the existing camera/GOP index for the latest GOP whose start is at/before that timestamp and whose recorded end still covers it. Require the keyframe start to lie within the configured tolerance (default 1,500 ms). Never substitute a later GOP, cross an uncovered interval, or borrow from another camera/session. Incomplete GOPs, absent configuration, and non-keyframe starts are unavailable.

Decode **the first frame of that GOP**, using its own session/file codec configuration and indexed fragment extent. `actualEpochUs` is the GOP keyframe's recorded **server-receive epoch**, not a claim of physical camera capture time or exact equality to the requested timestamp. This is the existing trustworthy keyframe-to-server mapping; arbitrary non-keyframe frame-time interpolation is not introduced. A sparse/long GOP can be unavailable beyond tolerance even while it has decodable video. Small gaps between the last recorded sample and next GOP also remain gaps.

The current accumulating GOP is not indexed; it is unavailable until finalized and written. Complete indexed extents in an actively growing file are eligible after verifying current file size. Truncated extents produce `source_pending`, retried by polling. RAM-only GOPs without a disk/index extent are not decoded by this implementation. Session IDs and codec versions represent generation boundaries; no camera protocol fields are added.

## Worker, cache, and resource lifecycle

`thumbnail-service.js` handles bounded HTTP admission and opaque tokens. A separate `worker_threads` worker owns a read-only source SQLite connection, planning, filesystem work, cache SQLite metadata, queue, and background scheduling. Source SQL, directory traversal, decoding, scaling and JPEG encoding do not execute on the ingest event loop. No thumbnail images are stored in SQLite BLOBs.

Each decode reconstructs a valid in-memory MP4 input from `initSegment` plus the indexed `moof`/`mdat` extent, then sends it to a bounded FFmpeg subprocess using an argument array, no shell, `-hwaccel none`, one decoder/filter/encoder thread, first-frame-only output, preserved aspect ratio, stripped metadata, and JPEG output. Child niceness is lowered where supported. Input/output sizes, source pixels, output height, process concurrency, and runtime are bounded. This is not a portable hard RSS/CPU sandbox; deploy OS/container resource limits where required.

Active replay responses pause admission of new thumbnail decodes. Existing child processes finish within their limits rather than being preempted. High ingest event-loop delay also defers new work. On-demand jobs precede optional background jobs; a per-camera admission cap bounds one camera's backlog. Shared identical jobs coalesce. Disconnected metadata clients do not cancel shared cache-filling jobs; work remains bounded and shutdown kills decoder children.

Background scheduling runs every configured default interval (normally five seconds) and considers each camera's latest indexed GOP, skipping unchanged/too-recent samples and overload rather than backfilling a growing history. It processes cameras in bounded batches and does not decode in the ingest callback. It can also cover the final safely indexed GOP of a stopped camera. There is no mandatory notification channel.

Cache files live in `<video directory>/thumbnails/<SHA256>.jpg`. Keys cover algorithm version, camera, session, file, codec version, GOP identity/time/PTS/extent and requested width. Source real paths must remain inside the configured recording directory. Source file identity and extent availability are rechecked on cache use; finalized-file size/mtime changes invalidate old images. A dedicated small `index.sqlite` tracks bytes and LRU use, not JPEG payloads.

JPEG output is validated and atomically renamed from `.jpg.tmp` before publication. Startup removes temporary/orphaned images in the cache directory. Background reconciliation checks at most 64 indexed cache entries per pass; missing sources remove their thumbnails. Cache eviction enforces independent byte/entry limits and never deletes recordings. The source server still has no automatic video-retention service. Image tokens do not survive restart, but validated disk cache entries do. Thumbnail failures never mark ingestion health as failed.

## Configuration

Environment variables override matching lowercase SQLite configuration keys, using the existing configuration lookup; no source-schema migration is required. The generic PHP config editor has not been expanded. FFmpeg/cache paths are environment-only.

| Environment variable | Default | Allowed bounds / purpose |
| --- | --- | --- |
| `THUMBNAILS_ENABLED` | true | `1`/`true` enable; other values disable |
| `THUMBNAIL_FFMPEG` | `ffmpeg` | Executable name or absolute path |
| `THUMBNAIL_CACHE_DIR` | `<videoDir>/thumbnails` | Dedicated writable cache directory |
| `THUMBNAIL_DEFAULT_INTERVAL_MS` | 5000 | 1000–60000 |
| `THUMBNAIL_MIN_INTERVAL_MS` | 1000 | 100–60000 |
| `THUMBNAIL_MAX_INTERVAL_MS` | 60000 | 1000–60000 |
| `THUMBNAIL_DEFAULT_WIDTH` | 240 | 80–480 |
| `THUMBNAIL_MIN_WIDTH` | 80 | 16–480 |
| `THUMBNAIL_MAX_WIDTH` | 480 | 80–960 |
| `THUMBNAIL_MAX_SAMPLES_PER_REQUEST` | 120 | 1–240 |
| `THUMBNAIL_TOLERANCE_MS` | 1500 | 0–5000, keyframe age limit |
| `THUMBNAIL_WORKERS` | 1 | 1–4; initially use 2 on Mac, 1 on Pi |
| `THUMBNAIL_QUEUE_MAX` | 256 | 1–1024 waiting jobs |
| `THUMBNAIL_PER_CAMERA_QUEUE` | 32 | 1–256 queued/running per camera |
| `THUMBNAIL_JOB_TIMEOUT_MS` | 10000 | 100–30000 |
| `THUMBNAIL_CACHE_MAX_BYTES` | 1073741824 | 1024–17179869184 |
| `THUMBNAIL_CACHE_MAX_ENTRIES` | 100000 | 1–1000000 |
| `THUMBNAIL_MAX_INPUT_BYTES` | 16777216 | 1024–67108864 per GOP |
| `THUMBNAIL_MAX_SOURCE_PIXELS` | 8294400 | 1–33177600 |

Fixed safeguards: at most 512 KiB JPEG output, output height at most four times configured maximum width, 16 in-flight thumbnail HTTP/worker operations, two per remote address, a 15-second metadata operation timeout, a 128 MiB worker JS heap limit, and at most 1,024 negative-cache entries. A job overrun is killed. Invalid thumbnail configuration disables the feature with a diagnostic instead of preventing ingestion startup.

## Observability and qualification

`GET /health` contains `thumbnails` metrics: enabled/ready/decoder status, hits/misses, queued/running/completed/failed/skipped counts, failures by safe reason, cumulative queue-wait/generation milliseconds, cache bytes/entries, and sampled ingest event-loop p99 milliseconds. Existing ingest metrics remain, with cumulative finalized-GOP count/time added. CPU/process runtime is approximated by bounded child wall time; ingest queue age is not available in the existing server.

```sh
cd src
npm test
node scripts/benchmark-thumbnails.js --base=http://SERVER:9000 --ring=1 --camera=1 --start=EPOCH_US --end=EPOCH_US --interval=5000 --width=240
```

Run benchmarks with active ingestion and replay on both deployment platforms. The script reports cold/polled/cached metadata latency, individual image latency/bytes, sample outcomes, thumbnail metrics, and ingest counter changes. Run baseline comparisons and 12–24-hour endurance tests separately. No Mac-mini/Pi hardware capacity or sub-second uncached timeline guarantee follows from unit/integration tests.

Tests synthesize a redistributable H.264 fixture with FFmpeg/libx264, run it through the existing recorder/index shape, fetch real JPEGs, and exercise the production router with simultaneous FPV1 ingestion and replay. FFmpeg with `libx264` is required for this test fixture; production only needs H.264 decode and MJPEG encode.

The IVR thumbnail strip is deliberately not implemented here. A future client should render ready URLs, poll metadata (for example every 250–500 ms) while samples are pending, back off on queue/HTTP overload, show unavailable gaps explicitly, refresh expired URLs through metadata, and position images using `actualEpochUs` while retaining each requested slot's position/context.
