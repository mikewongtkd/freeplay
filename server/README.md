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
php -S 0.0.0.0:8080 -t public
```

Cameras connect to `ws://SERVER_IP:9000`. Node endpoints include `GET /health`, `GET /api/live`, and `GET /api/replay`. PHP APIs live under `/api/*.php`.

## Ingestion validation

Open `http://SERVER_IP:8080/tests.php` for the persistent ingestion test report. It provides protocol, codec/GOP, timing, recording, replay/cache, resilience, synchronization, endurance, backpressure, and capacity tests. Automatic tests use production parsers and indexes; live tests observe the real ingest event stream.

Fault-injection, backpressure, and capacity controls are disabled by default. Explicitly enable them only on a test server:

```bash
FREEPLAY_TEST_MODE=1 npm start
```

Test API routes are under `/api/tests`, including run, stop, evaluate, operator action, live status, historical runs, and JSON results. Long-running state belongs to the Node process and completed results are retained in SQLite.

## FPV1

The first frame must be the version-1 `freeplay-ingest` JSON `hello` described in [docs/server-protocol.md](docs/server-protocol.md). Accepted clients receive `hello_ack` followed by `request_keyframe`. Binary messages contain the exact 32-byte, big-endian `FPV1` header followed by the declared H.264 payload. Video before registration, malformed frames, unsupported clients, and duplicate stream ownership are rejected.

## Configuration

Defaults are stored in SQLite's `configuration` table. Environment overrides include `FREEPLAY_PORT`, `FREEPLAY_DB`, `FREEPLAY_VIDEO_DIR`, `FREEPLAY_RAM_REPLAY_SECONDS`, and `FREEPLAY_FILE_SECONDS`.

The schema is applied idempotently. Startup adds missing protocol-era columns to the original prototype database without deleting data. Back up `data/freeplay.sqlite` before a production upgrade.

Recordings are placed under `data/video/YYYY-MM-DD/ringNN/camN/`. No decoding, transcoding, or permanent ffmpeg process is used.
