# FreePlay ingestion protocol

Current implementation reference, November 11, 2026. This document covers camera-to-server FPV1 ingestion, recording/indexing, ingestion administration, and operations. Browser replay delivery and the review workflow are covered in [IVR protocol](ivr-protocol.md). Source code is authoritative; performance targets and future work below are not guarantees of implemented behavior.

## Components and entry points

| Component | Implementation |
| --- | --- |
| Node ingest, HTTP routing, live state, statistics | `src/freeplay.js` |
| FPV1 parsing and hello validation | `src/protocol.js` |
| GOP assembly and RAM retention | `src/gop.js` |
| H.264 configuration parsing and fMP4 remuxing | `src/recorder.js` |
| SQLite schema | `deploy/db/schema.sql` |
| PHP administration APIs | `public/api/` |

Run Node from `src/` with `npm start`; `npm test` runs `test/*.test.js`. Node uses `ws` and `better-sqlite3`. PHP serves the web UI separately. The default Node listener is `0.0.0.0:9000`, serving camera WebSockets and HTTP on the same server. There is no dedicated WebSocket path check in the ingest handler.

The design baseline is 14 rings × 3 cameras, H.264, typically 1080p/30 fps/6 Mb/s with a one-second keyframe interval and no audio. These are deployment targets, not enforced encoding settings or demonstrated capacity guarantees. At 42 × 6 Mb/s the aggregate is 252 Mb/s, about 1.134 TB of payload over ten hours.

## Camera connection and hello

Camera control messages are JSON text WebSocket messages. Video is binary FPV1 framing plus encoded H.264, not Base64 or JSON-wrapped bytes. The first message must be a valid hello; binary data before acceptance is rejected.

```json
{
  "type": "hello",
  "protocol": "freeplay-ingest",
  "version": 1,
  "streamId": "ring6_cam2",
  "ring": 6,
  "camera": 2,
  "device": "SM-X110",
  "manufacturer": "Samsung",
  "androidVersion": "15",
  "appVersion": "1.0.0",
  "codec": "h264",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "bitrate": 6000000,
  "keyframeInterval": 1,
  "encoder": "c2.mtk.avc.encoder"
}
```

Validation in `validateHello`:

- `type`, `protocol`, and numeric `version` must match the example.
- `streamId` is 1–128 characters from letters, digits, underscore, period, and hyphen. The server requires `ring{ring}_cam{camera}`. The validator has an opt-out option, but the running server does not set it.
- Ring/camera are integers in the configured ranges (defaults 1–14 and 1–3).
- Codec is case-insensitively `h264`; width and height are integers 1–16384.
- FPS, bitrate, and keyframe interval must convert to finite positive numbers. Device/encoder metadata is optional and normalized to strings.

Acceptance registers/updates the camera, opens a new session, and returns:

```json
{"type":"hello_ack","accepted":true,"streamId":"ring6_cam2","serverTime":1788298642.354}
```

`serverTime` is floating-point epoch seconds. If configured, acceptance also requests a keyframe. A duplicate active stream receives `{"type":"hello_ack","accepted":false,"reason":"duplicate_stream"}` and is closed after approximately 100 ms with code 1008. The old owner is retained.

## FPV1 binary message

Each message contains exactly a 32-byte header followed by `payloadLength` bytes. Multibyte fields use big-endian order.

| Offset | Bytes | Field | Parser type |
| --- | --- | --- | --- |
| 0 | 4 | ASCII `FPV1` | Magic bytes |
| 4 | 8 | Presentation time in microseconds | Signed 64-bit BigInt |
| 12 | 4 | Sequence number | Unsigned 32-bit |
| 16 | 4 | MediaCodec flags | Unsigned 32-bit |
| 20 | 4 | Payload length | Unsigned 32-bit |
| 24 | 8 | Tablet monotonic timestamp in nanoseconds | Unsigned 64-bit BigInt |
| 32 | variable | Encoded H.264 buffer | Bytes |

Flags: keyframe `1`, codec configuration `2`, end of stream `4`. Flags are bit masks. The parser checks minimum length, magic, and exact header/payload length. WebSocket `maxPayload` is 32 MiB, including framing bytes. There is no legacy 20-byte framing mode.

Sequence arithmetic is `(current - previous) >>> 0`, so normal wraparound works. Delta other than one increments the stream's sequence-gap counter and requests a keyframe. Estimated missing buffers are zero for a duplicate sequence and otherwise delta minus one; this is not a separate reordering or retransmission protocol. GOP incompleteness uses nonzero missing-buffer estimates, so duplicate-sequence stream counters and GOP quality need not match.

## Timing, GOPs, and codec configuration

Node records receive epoch microseconds as `BigInt(Date.now()) * 1000n` and receive monotonic nanoseconds with `process.hrtime.bigint()`. Epoch timestamps therefore have millisecond clock resolution despite their microsecond representation. GOP boundaries on the shared replay timeline use server receive time; sample timing inside fMP4 uses camera PTS. Raw tablet monotonic timestamps are retained in memory for observations but are not the cross-camera alignment clock. There is no implemented clock-offset estimation protocol between tablets and server.

A GOP begins only on a keyframe. Non-keyframe video before that is discarded and triggers a rate-limited keyframe request. A subsequent keyframe finalizes the preceding GOP. Disconnect finalizes the current GOP as incomplete; end-of-stream finalizes it and closes with code 1000. Only finalized GOPs are cached/indexed, so the currently accumulating GOP is not immediately replayable.

The codec tracker accepts SPS/PPS from configuration buffers and in-band parameter sets. Recorder helpers recognize Annex B, length-prefixed NAL units, and AVC decoder-configuration records. Partial SPS/PPS can accumulate until configuration is complete. Changed configuration finalizes the current GOP as incomplete, closes the recorder file, increments the configuration version, persists SPS/PPS/avcC, and requests another keyframe. Identical configuration is not versioned again. A configuration-flagged message returns after configuration handling rather than being added as an ordinary video sample.

## RAM cache, files, and indexing

Each stream has a completed-GOP cache, bounded by both age and bytes: defaults 60 seconds and 67,108,864 bytes. Pruning compares GOP end times against the newest cached end time and runs on additions. This is a retention bound on completed cached GOPs, not an independent bound on the accumulating current GOP or all process memory.

The recorder remuxes encoded samples without decoding/transcoding during ingest. It writes initialization boxes and `moof`/`mdat` fragments synchronously. File rotation occurs at a GOP boundary when the incoming GOP start reaches the configured duration (default 60 seconds). Codec changes and disconnect also close files. Paths use UTC:

```text
<video directory>/YYYY-MM-DD/ring06/cam2/HH-MM-SS.mp4
```

Existing names get a numeric suffix. SQLite stores file references and fragment byte offsets/lengths, server epoch GOP boundaries, decimal-string PTS, sequence ranges, completeness, and gap estimates. Configuration is stored in `codec_configurations` by session/version. Consult `deploy/db/schema.sql` for exact tables/constraints; the old suggested table definitions are not the deployed schema.

GOPs are cached before disk writes. A recorder error marks writer health false, increments writer errors, and marks that GOP incomplete; ingest/cache can continue, but the stream does not automatically recover disk writing. Guarded database errors mark database health false. This is degraded operation, not a transactional guarantee that video and all metadata survive failures.

## Control messages and errors

After hello, the accepted text types are:

| Message | Behavior |
| --- | --- |
| `ping` with `id` | Reply `{"type":"pong","id":...}` |
| `pong` | Update application pong time |
| `status` | Retain the supplied status object and emit a test observation |

Status telemetry is not validated as an authoritative server configuration update. Unknown types produce `unknown_message`. There is no implemented `set_bitrate` command/API.

Server keyframe requests have shape `{"type":"request_keyframe","reason":"connect"}`; other reasons include `sequence_gap`, `waiting_for_keyframe`, and `codec_config_changed`. Requests are limited to one per stream per second.

The server also sends WebSocket protocol pings. Heartbeat interval is the smaller of 5 seconds and half the stale timeout (default 15 seconds). Missing protocol pong or an accepted stream's message timeout terminates the socket.

Errors use `{"type":"error","error":{"code":"...","message":"..."}}`. Codes include `expected_hello`, `unsupported_protocol`, `unsupported_version`, `invalid_hello`, `unsupported_codec`, `invalid_json`, `hello_required`, `frame_too_short`, `invalid_magic`, `payload_length_mismatch`, `unknown_message`, and `internal_error`. Errors before registration and specified binary framing errors close with code 1008; other registered-stream errors can leave the connection open. Duplicate rejection is handled separately as described above.

## HTTP services

| Route | Current behavior |
| --- | --- |
| Node `GET /health` | Stream count, uptime, counters, aggregate bitrate, RAM cache bytes, disk free bytes, hostname, database/writer health |
| Node `GET /api/live` | Current connected streams and live telemetry |
| Node `/api/tests...` | Test-manager routes; see test-manager source and test plan |
| PHP `/api/cameras.php`, `camera.php`, `sessions.php`, `stats.php`, `files.php` | Dashboard/history queries |
| PHP `/api/events.php`, `config.php`, `health.php` | Event/configuration/health administration |

Replay manifests, media byte delivery, the legacy replay routes, and review actions are specified in [IVR protocol](ivr-protocol.md). They share the Node listener but are a separate application contract from the camera WebSocket. General PHP administration responses can expose file paths and database-shaped records; they do not promise the opaque-resource contract of versioned replay.

## Thumbnail integration

The optional [thumbnail service](thumbnail-service.md) derives JPEGs from finalized, indexed GOPs. It shares the Node HTTP listener but adds no FPV1 fields or camera messages. Planning/cache/filesystem work occurs in a separate worker; bounded lower-priority FFmpeg children perform decoding. Active replay and high ingest event-loop delay defer new thumbnail jobs. Ingestion remains available if thumbnails are disabled, overloaded, or missing FFmpeg. Background scheduling reads the existing index rather than decoding in GOP callbacks. JPEG creation never modifies source recordings.

## Configuration and operations

| Setting | Default / source |
| --- | --- |
| Node port | `FREEPLAY_PORT`, then `FREEPLAY_WS_PORT`, then 9000 |
| Node SQLite path | `FREEPLAY_DB`, default `/data/freeplay.sqlite` |
| Node recording directory | `FREEPLAY_VIDEO_DIR`, default `/data/video` |
| Node RAM age | `FREEPLAY_RAM_REPLAY_SECONDS`, then `ram_replay_seconds` = 60 |
| Node file duration | `FREEPLAY_FILE_SECONDS`, then `record_file_seconds` = 60 |
| Per-stream cache bytes | SQLite `ram_replay_max_bytes` = 67,108,864 |
| Statistics interval | SQLite `stats_flush_seconds` = 1 |
| Stale timeout | SQLite `stale_socket_seconds` = 15 |
| Ring/camera limits | SQLite `max_rings` = 14, `cameras_per_ring` = 3 |
| Keyframe on connect | SQLite `request_keyframe_on_connect` = 1 |
| Ingestion test mode | `FREEPLAY_TEST_MODE=1` |

Node reads configuration at startup. General PHP administration uses `/data/freeplay.sqlite` and `/data/live-status.json`; those paths do not follow Node's `FREEPLAY_DB` override. PHP's Node-request helper uses `FREEPLAY_NODE_URL` (default `http://127.0.0.1:9000`). Configure each relevant component rather than assuming overrides propagate across processes.

Statistics are periodically persisted and `/data/live-status.json` is rewritten for PHP consumers. `/health` obtains disk free space with `statfsSync` when available. Configurable disk low-watermark shutdown, automatic retention deletion, and automatic writer recovery are not implemented. The startup schema uses `CREATE ... IF NOT EXISTS` and selected additive migrations; it is not a general migration framework.

SIGINT/SIGTERM stop timers, close the WebSocket server and clients, and close HTTP/SQLite on shutdown. Stream close handlers finalize GOPs, recorder files, and session rows. A five-second fallback exits with failure, so this is best-effort graceful shutdown, not an unlimited flush guarantee.

## Security, targets, and verification

The camera WebSocket and ingestion administration endpoints have no application authentication or authorization. The application relies on deployment on a controlled LAN; TLS/authentication must be provided separately if needed. Replay-specific CORS, bearer-token, and file-access boundaries are documented in [IVR protocol](ivr-protocol.md).

The 42-camera capacity remains an engineering target, not a measured guarantee. Relevant code tests include `src/test/protocol.test.js` and `src/test/recorder.test.js`, plus protocol/timing/stream/recording/resilience/load suites used by the test manager. See the [camera/server test plan](camera-server-protocol-test-plan.md) for suite background. Test coverage is not a claim that a particular deployment passed a load or endurance run. Replay and browser workflow verification references are in [IVR protocol](ivr-protocol.md).

## Implementation references

- `src/freeplay.js`: camera lifecycle, WebSocket controls, health/live routes, statistics, configuration, shutdown.
- `src/protocol.js`: hello validation, FPV1 framing, sequence arithmetic.
- `src/gop.js`: GOP boundaries, completeness, completed-GOP RAM retention.
- `src/recorder.js`: SPS/PPS handling, fMP4 remuxing, file rotation and fragment extents.
- `deploy/db/schema.sql`: ingestion and application database schema.
- `public/api/`: dashboard, camera/session/file/event/configuration administration.
- `src/test/test-manager.js`: ingestion test-service routing and execution.
