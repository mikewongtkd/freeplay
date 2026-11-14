# FreePlay FPV1 Ingestion Server

Node.js/WebSocket ingestion and PHP/SQLite replay administration for FreePlay cameras. The ingest path validates FPV1, preserves 64-bit timestamps, builds GOPs without decoding, retains a bounded RAM replay window, and continuously remuxes completed GOPs into fragmented MP4 files.

## Run

Requires Node.js 20+, PHP 8+ with PDO SQLite, and npm.

```bash
cd src
npm install
npm test
npm start
```

From the repository root, serve the dashboard separately:

```bash
php -S 0.0.0.0:80 -t public
```

Cameras connect to `ws://SERVER_IP:9000`. Node endpoints include `GET /health`, `GET /api/live`, and the versioned IVR media API under `/api/ivr/v1`. PHP APIs live under `/api/*.php`.

For the first IVR media milestone, request a single-camera manifest with `GET /api/ivr/v1/replay?ring=1&camera=1&timeEpochUs=<epoch-us>&beforeSeconds=5&afterSeconds=5`. The response contains opaque fMP4 initialization and fragment URLs suitable for Chrome Media Source Extensions. It resolves both the bounded live RAM cache and indexed disk recordings without exposing storage paths. `GET /api/ivr/v1/capabilities` describes the currently implemented production features.

## Ingestion validation

Open `http://SERVER_IP:80/tests/` for the test-suite index, then select **Ingestion Tests**. The ingestion report provides protocol, codec/GOP, timing, recording, replay/cache, resilience, synchronization, endurance, backpressure, and capacity tests. Automatic tests use production parsers and indexes; live tests observe the real ingest event stream.

Fault-injection, backpressure, and capacity controls are disabled by default. Explicitly enable them only on a test server:

```bash
FREEPLAY_TEST_MODE=1 npm start
```

Test API routes are under `/api/tests`, including run, stop, evaluate, operator action, live status, historical runs, and JSON results. Long-running state belongs to the Node process and completed results are retained in SQLite.

## FPV1

The first frame must be the version-1 `freeplay-ingest` JSON `hello` described in [ingestion protocol](docs/ingestion-protocol.md). Accepted clients receive `hello_ack` followed by `request_keyframe`. Binary messages contain the exact 32-byte, big-endian `FPV1` header followed by the declared H.264 payload. Video before registration, malformed frames, unsupported clients, and duplicate stream ownership are rejected.

## Configuration

Node reads `src/config.json` at startup, falling back to `src/config-default.json` if the local file is absent:

```json
{"fp_conf":{"video_dir":"/data/video","db":"/data/freeplay.sqlite","port":9000}}
```

Copy `src/config-default.json` to `src/config.json` and edit the local values. Relative paths resolve against the JSON file's directory. Use `node freeplay.js --config=/path/to/config.json` for an explicit configuration file (missing explicit files are errors). The previous Node environment settings `FREEPLAY_VIDEO_DIR`, `FREEPLAY_DB`, `FREEPLAY_PORT`, and `FREEPLAY_WS_PORT` are no longer used. Other settings remain in SQLite's `configuration` table, with existing `FREEPLAY_RAM_REPLAY_SECONDS` and `FREEPLAY_FILE_SECONDS` overrides. PHP database configuration is unchanged.

The schema is applied idempotently. Startup adds missing protocol-era columns to the original prototype database without deleting data. Back up `data/freeplay.sqlite` before a production upgrade.

Recordings are placed under `data/video/YYYY-MM-DD/ringNN/camN/`. The ingest path does not decode or transcode video. The optional thumbnail service decodes derived JPEGs in isolated, bounded FFmpeg workers; it does not re-encode the archive.

## Timeline thumbnails

The server exposes `GET /api/ivr/v1/thumbnails?ring=1&camera=1&startEpochUs=<epoch-us>&endEpochUs=<epoch-us>` and opaque JPEG URLs on the existing Node port. Install FFmpeg for asynchronous generation; use `THUMBNAILS_ENABLED=false` to disable the service without affecting ingest/replay. Initial deployment settings: `THUMBNAIL_WORKERS=1` on Pi 5, `THUMBNAIL_WORKERS=2` on Mac mini. Missing FFmpeg produces explicit unavailable samples and a startup diagnostic.

See [thumbnail API and operations](docs/thumbnail-service.md) for sampling, configuration, limits, metrics, tests, and the benchmark command. The IVR thumbnail UI is a separate future integration.
