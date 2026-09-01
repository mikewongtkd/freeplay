# FreePlay Ingestion Server and Replay Backend

You are working in the existing **FreePlay instant replay server** project in Visual Studio.

The goal is to upgrade the current Node.js/PHP/SQLite prototype into a protocol-compatible ingestion server for the **FreePlay Camera Android app**.

The implementation must cover:

- `freeplay.js` Node.js ingestion server
- `freeplay.sqlite` SQLite schema
- PHP REST/API endpoints
- PHP/JS/CSS dashboard and camera views
- GOP-aware ingest
- bounded RAM replay cache
- continuously written fragmented MP4 recording
- replay-oriented indexing
- telemetry and health
- compatibility with the formal **FreePlay FPV1 WebSocket ingestion protocol**

Do not redesign the entire application unnecessarily. Preserve the existing prototype structure where practical.

---

# 1. Existing Project Shape

The current project is approximately:

```text
freeplay_server/
├── README.md
├── freeplay.js
├── package.json
├── data/
│   ├── sql/
│   │   └── schema.sql
│   └── video/
│       └── ...
└── public/
    ├── index.php
    ├── camera.php
    ├── api/
    │   ├── common.php
    │   ├── cameras.php
    │   ├── sessions.php
    │   └── stats.php
    ├── css/
    │   └── app.css
    └── js/
        ├── dashboard.js
        └── camera.js
```

Keep this general layout unless a small structural change is clearly beneficial.

Primary server technologies:

- Node.js
- `ws`
- `better-sqlite3`
- PHP
- Bootstrap
- jQuery
- Chart.js
- SQLite

The intended server is a Mac mini on a controlled, isolated Gigabit/10GbE LAN.

---

# 2. Scale and Performance Target

The system must support:

```text
up to 14 rings
3 cameras per ring
42 concurrent camera streams
```

Baseline per camera:

```text
H.264 / AVC
1920×1080
30 fps
6,000,000 bps
1-second keyframe interval
no audio
```

Aggregate baseline ingest:

```text
42 × 6 Mb/s = ~252 Mb/s
```

The server must not decode or transcode video during ingest.

The intended flow is:

```text
Android Camera
    ↓
WebSocket / TCP
    ↓
freeplay.js
    ↓
protocol parser
    ↓
GOP builder
    ↓
┌───────────────┬──────────────────┐
│ RAM replay    │ fMP4 disk writer │
│ cache         │                  │
└───────────────┴──────────────────┘
    ↓
SQLite timeline index
    ↓
PHP replay/admin API
```

The design should comfortably handle all 42 streams with headroom.

---

# 3. Transport Protocol

Use:

```text
H.264
  ↓
FreePlay FPV1 framing
  ↓
WebSocket
  ↓
TCP
  ↓
IP
  ↓
Ethernet
```

Default WebSocket ingest endpoint:

```text
ws://SERVER_IP:9000
```

The Node server should also expose:

```text
GET /health
```

on the same HTTP server if practical.

---

# 4. WebSocket Message Types

There are exactly two categories:

```text
TEXT frames   → JSON control/status
BINARY frames → encoded H.264 MediaCodec output buffers
```

Do not expect Base64 video.

Do not expect JSON-wrapped video.

Each connected Android tablet represents one camera stream.

---

# 5. Connection Lifecycle

Expected lifecycle:

```text
Tablet                              freeplay.js
   │                                     │
   │──── WebSocket connect ─────────────►│
   │                                     │
   │──── TEXT hello ────────────────────►│
   │                                     │
   │◄─── TEXT hello_ack ─────────────────│
   │                                     │
   │──── BINARY H.264 buffer ───────────►│
   │──── BINARY H.264 buffer ───────────►│
   │──── BINARY H.264 buffer ───────────►│
   │                                     │
   │──── TEXT status ───────────────────►│
   │                                     │
   │◄─── TEXT request_keyframe ──────────│
```

Do not process binary video until a valid `hello` has been accepted.

---

# 6. `hello` Message

Expected example:

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

Validate at least:

```text
type == "hello"
protocol == "freeplay-ingest"
version == 1
streamId present
ring valid
camera valid
codec == "h264"
width > 0
height > 0
fps > 0
bitrate > 0
```

Prefer configurable maximum ring/camera values rather than hard-coding 14 if possible.

Deterministic stream IDs look like:

```text
ring1_cam1
ring1_cam2
ring1_cam3
...
```

---

# 7. Duplicate Stream Handling

Only one active connection may own a given `streamId`.

If a second client attempts to register the same stream ID:

Return:

```json
{
  "type": "hello_ack",
  "accepted": false,
  "reason": "duplicate_stream"
}
```

Then either close the new socket after a short delay or leave it rejected but non-streaming.

Do not silently replace an active camera unless explicitly configured to do so.

---

# 8. `hello_ack`

On successful registration, return:

```json
{
  "type": "hello_ack",
  "accepted": true,
  "streamId": "ring6_cam2",
  "serverTime": 1788298642.354
}
```

`serverTime` should be Unix epoch seconds as a floating-point number.

Also initialize the per-camera live state and begin a new recording/session record.

---

# 9. FPV1 Binary Header

Every binary WebSocket message is:

```text
32-byte FPV1 header
+
H.264 payload
```

All multibyte integers are **big-endian / network byte order**.

Layout:

```text
Offset  Size   Field
------  ----   ---------------------------------------------
0       4      Magic ASCII "FPV1"
4       8      presentationTimeUs
12      4      sequenceNumber
16      4      MediaCodec BufferInfo flags
20      4      payloadLength
24      8      tabletMonotonicTimestampNs
32      ...    H.264 payload
```

The header size is exactly:

```text
32 bytes
```

Magic bytes are:

```text
46 50 56 31
 F  P  V  1
```

---

# 10. FPV1 Parser

Implement a single dedicated parser/helper.

Conceptually:

```javascript
const FP_HEADER_SIZE = 32;
const FP_MAGIC = Buffer.from('FPV1');

function parseFpv1Binary(buf) {
    if (!Buffer.isBuffer(buf)) throw ...
    if (buf.length < FP_HEADER_SIZE) throw ...

    if (!buf.subarray(0, 4).equals(FP_MAGIC)) throw ...

    const ptsUs = buf.readBigInt64BE(4);
    const sequence = buf.readUInt32BE(12);
    const flags = buf.readUInt32BE(16);
    const payloadLength = buf.readUInt32BE(20);
    const tabletTimestampNs = buf.readBigUInt64BE(24);

    if (buf.length !== FP_HEADER_SIZE + payloadLength)
        throw ...

    return {
        ptsUs,
        sequence,
        flags,
        payloadLength,
        tabletTimestampNs,
        payload: buf.subarray(FP_HEADER_SIZE)
    };
}
```

Do not scatter binary offsets throughout `freeplay.js`.

Put protocol constants and parsing helpers together.

---

# 11. Sequence Tracking

Track sequence number per active connection.

Detect gaps:

```text
expected = previous + 1 modulo 2^32
```

Maintain counters:

```text
receivedMessages
sequenceGaps
missingMessagesEstimated
lastSequence
```

A gap on WebSocket/TCP typically indicates application-side dropping, reconnection/session reset, or sender logic issues, not ordinary IP packet loss.

On a new accepted `hello`, sequence state starts fresh.

---

# 12. PTS

Preserve:

```text
presentationTimeUs
```

as a 64-bit value.

Do not coerce to JavaScript Number if precision might be lost.

Use `BigInt` internally.

For APIs/JSON, serialize as decimal string where necessary, for example:

```json
{
  "startPtsUs": "1283736721"
}
```

Use integer-safe handling consistently.

---

# 13. Tablet Monotonic Timestamp

Preserve:

```text
tabletMonotonicTimestampNs
```

as `BigInt`.

Important:

Different Android devices do **not** share a common monotonic epoch.

Therefore:

- never compare raw tablet monotonic timestamps across cameras as if they were synchronized;
- do not use raw tablet monotonic timestamps alone for cross-camera alignment;
- use them for diagnostics and for mapping within each individual tablet timeline;
- record server receive timestamps separately.

Future clock-offset synchronization may be added later.

---

# 14. Server Receive Timestamp

For each binary message, record a server receive time as close to arrival as practical.

Maintain:

```text
serverReceiveEpochUs
serverReceiveMonotonicNs
```

or equivalent.

Use monotonic time for latency/interval measurements.

Use wall-clock epoch time for event/replay lookup.

Do not rely on wall-clock alone for duration calculations.

---

# 15. MediaCodec Flags

Preserve all `flags`.

At minimum recognize:

```text
BUFFER_FLAG_KEY_FRAME
BUFFER_FLAG_CODEC_CONFIG
BUFFER_FLAG_END_OF_STREAM
```

Do not assume numeric values without checking Android semantics, but server-side H.264 handling should support the values transmitted by the Android app.

Codec config buffers are not ordinary display frames.

---

# 16. H.264 Codec Configuration

Capture SPS/PPS or equivalent AVC decoder configuration from buffers flagged as codec config.

Requirements:

- store the latest valid codec configuration per active stream;
- associate it with the current encoder/session;
- persist enough information to initialize fMP4 output;
- do not count codec config as a normal video frame;
- do not start a self-contained recording file without the necessary AVC initialization metadata.

If encoder configuration changes:

```text
resolution
profile/level
SPS/PPS
```

force a recording boundary and start a new file/session segment as appropriate.

---

# 17. GOP Builder

The server must build logical GOPs without decoding H.264.

A GOP begins at a keyframe.

Typical 1-second GOP:

```text
I P P P P ... P
```

At approximately 30 fps.

Maintain one GOP builder per camera.

A GOP object should contain metadata similar to:

```javascript
{
    streamId,
    startPtsUs,
    endPtsUs,
    startServerEpochUs,
    endServerEpochUs,
    keyframePtsUs,
    sequenceStart,
    sequenceEnd,
    encodedBufferCount,
    byteLength,
    codecConfigVersion,
    complete,
    buffers: [...]
}
```

Avoid unnecessary data duplication.

The server should not decode video.

---

# 18. GOP Boundary Behavior

When a new keyframe arrives:

1. finalize the previous GOP;
2. start a new GOP with the new keyframe;
3. send finalized GOP metadata/data to:
   - RAM replay cache;
   - fMP4 writer;
   - GOP index persistence.

Handle the first GOP after connection specially if it begins without a keyframe.

Prefer requesting a keyframe from the tablet after `hello_ack`.

---

# 19. Server `request_keyframe`

After a successful new connection or reconnection, send:

```json
{
  "type": "request_keyframe"
}
```

This encourages the stream to resume from a clean decoding boundary.

The server may also send this if:

- sequence discontinuity is detected;
- GOP continuity is suspect;
- fMP4 writer needs a clean restart;
- codec configuration changes.

Rate-limit repeated requests.

---

# 20. RAM Replay Cache

Maintain an in-memory bounded ring buffer per camera.

Target:

```text
~60 seconds of completed GOPs per camera
```

At 6 Mb/s:

```text
~45 MB per camera
```

Across 42 cameras:

```text
~1.9 GB
```

This is acceptable on the intended server.

The cache must be bounded.

Do not allow unbounded growth.

Suggested abstraction:

```javascript
class GopReplayCache {
    add(gop)
    query(startTime, endTime)
    prune()
    getStats()
}
```

Use time-based pruning and optionally byte-based safety limits.

RAM is an acceleration layer, not the only recording copy.

---

# 21. Disk Recording Strategy

Do **not** create one file per 1-second GOP.

Use:

```text
1-second GOP logical granularity
60-second physical fMP4 files
```

Each camera continuously writes to a current file.

At ~6 Mb/s:

```text
~45 MB per 60-second file per camera
```

For 42 cameras over 10 hours:

```text
25,200 physical files
```

which is much more manageable than hundreds of thousands or millions of 1-second files.

---

# 22. fMP4 Requirements

Implement fragmented MP4 recording suitable for browser replay and random access.

Preferred conceptual structure:

```text
ftyp
moov
moof + mdat
moof + mdat
moof + mdat
...
```

Each physical 60-second file should be independently usable where practical.

If implementation is cleaner with:

```text
init segment
+
media fragments
```

that is acceptable, but keep browser replay simple.

Do not transcode.

Remux the already-encoded H.264.

If using an external library, prefer a well-maintained lightweight dependency.

Do not spawn one ffmpeg process per frame.

Avoid using ffmpeg as a permanent heavy middle layer unless clearly justified.

If native fMP4 muxing in Node is too fragile, structure the code cleanly so the muxer is replaceable.

---

# 23. Continuous Write Behavior

Do not hold a whole minute in RAM before writing.

Expected behavior:

```text
incoming encoded buffers
      ↓
GOP finalize
      ↓
append/write to current fMP4
      ↓
continue
```

The file should be continuously written.

Rotate approximately every 60 seconds at a clean GOP boundary.

Crash behavior should lose at most a small tail, not an entire minute.

---

# 24. Video File Layout

Use a hierarchical layout.

Example:

```text
data/video/
└── 2026-09-12/
    ├── ring01/
    │   ├── cam1/
    │   │   ├── 09-00-00.mp4
    │   │   ├── 09-01-00.mp4
    │   │   └── ...
    │   ├── cam2/
    │   └── cam3/
    ├── ring02/
    └── ring14/
```

Use stable, sortable file names.

Also include session/date metadata in SQLite.

Do not depend on filenames alone for replay lookup.

---

# 25. SQLite Database

Use:

```text
data/freeplay.sqlite
```

Enable WAL mode.

Set reasonable busy timeout.

Keep transactions short.

Do not write every video frame into SQLite.

Persist metadata and periodic statistics only.

---

# 26. Required Tables

Design or upgrade the schema to include at least:

```text
cameras
sessions
statistics
files
gop_index
events
configuration
```

You may add supporting tables if justified.

---

# 27. `cameras` Table

Suggested fields:

```sql
id INTEGER PRIMARY KEY
stream_id TEXT UNIQUE NOT NULL
ring INTEGER NOT NULL
camera INTEGER NOT NULL

device TEXT
manufacturer TEXT
android_version TEXT
app_version TEXT
encoder TEXT

codec TEXT
width INTEGER
height INTEGER
fps REAL
bitrate INTEGER
keyframe_interval REAL

last_seen_at TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

Use ISO timestamps or Unix epoch consistently.

---

# 28. `sessions` Table

A session represents one accepted transport/encoder connection period.

Suggested fields:

```sql
id INTEGER PRIMARY KEY
camera_id INTEGER NOT NULL
stream_id TEXT NOT NULL

started_at TEXT NOT NULL
ended_at TEXT

remote_address TEXT

codec TEXT
width INTEGER
height INTEGER
fps REAL
bitrate INTEGER
keyframe_interval REAL

encoder TEXT
codec_config_version INTEGER

disconnect_reason TEXT

FOREIGN KEY(camera_id) REFERENCES cameras(id)
```

A reconnect should create a new session row.

---

# 29. `statistics` Table

Persist summary samples, not per-frame data.

Suggested cadence:

```text
once per second per active camera
```

Fields may include:

```sql
id INTEGER PRIMARY KEY
camera_id INTEGER NOT NULL
session_id INTEGER NOT NULL
sample_time TEXT NOT NULL

fps REAL
bitrate_bps INTEGER

bytes_received INTEGER
buffers_received INTEGER

keyframes INTEGER
codec_config_buffers INTEGER

sequence_gaps INTEGER
estimated_missing_buffers INTEGER

ram_cache_seconds REAL
ram_cache_bytes INTEGER

FOREIGN KEY(camera_id) REFERENCES cameras(id)
FOREIGN KEY(session_id) REFERENCES sessions(id)
```

Use indexes on:

```text
camera_id
session_id
sample_time
```

---

# 30. `files` Table

Suggested:

```sql
id INTEGER PRIMARY KEY
camera_id INTEGER NOT NULL
session_id INTEGER NOT NULL

path TEXT UNIQUE NOT NULL

started_at TEXT NOT NULL
ended_at TEXT

start_pts_us TEXT
end_pts_us TEXT

byte_size INTEGER NOT NULL DEFAULT 0
gop_count INTEGER NOT NULL DEFAULT 0

codec_config_version INTEGER

complete INTEGER NOT NULL DEFAULT 0

FOREIGN KEY(camera_id) REFERENCES cameras(id)
FOREIGN KEY(session_id) REFERENCES sessions(id)
```

PTS values should be stored as text decimal strings if needed for exact 64-bit precision.

---

# 31. `gop_index` Table

This table is central to replay.

Suggested:

```sql
id INTEGER PRIMARY KEY
camera_id INTEGER NOT NULL
session_id INTEGER NOT NULL
file_id INTEGER

start_time_epoch_us INTEGER NOT NULL
end_time_epoch_us INTEGER NOT NULL

start_pts_us TEXT NOT NULL
end_pts_us TEXT NOT NULL
keyframe_pts_us TEXT NOT NULL

sequence_start INTEGER
sequence_end INTEGER

byte_size INTEGER NOT NULL
buffer_count INTEGER NOT NULL

file_offset INTEGER
file_length INTEGER

complete INTEGER NOT NULL DEFAULT 1

sequence_gap_count INTEGER NOT NULL DEFAULT 0
estimated_missing_buffers INTEGER NOT NULL DEFAULT 0

FOREIGN KEY(camera_id) REFERENCES cameras(id)
FOREIGN KEY(session_id) REFERENCES sessions(id)
FOREIGN KEY(file_id) REFERENCES files(id)
```

Indexes:

```text
(camera_id, start_time_epoch_us)
(camera_id, end_time_epoch_us)
(file_id)
```

If actual byte offsets are not practical with the selected fMP4 muxer, store fragment identifiers instead.

The important goal is fast time-range lookup.

---

# 32. `events` Table

Support IVR/replay events.

Suggested:

```sql
id INTEGER PRIMARY KEY
ring INTEGER NOT NULL

event_time_epoch_us INTEGER NOT NULL

pre_roll_ms INTEGER NOT NULL DEFAULT 8000
post_roll_ms INTEGER NOT NULL DEFAULT 4000

label TEXT
notes TEXT

created_at TEXT NOT NULL
```

Do not physically cut video when an event is created.

An event should be a reference to a time window.

---

# 33. `configuration` Table

Store key/value config.

Suggested defaults:

```text
stats_flush_seconds = 1
ram_replay_seconds = 60
record_file_seconds = 60
max_rings = 14
cameras_per_ring = 3
request_keyframe_on_connect = 1
```

Keep configuration simple.

---

# 34. Live In-Memory State

`freeplay.js` should remain the authoritative owner of live camera state.

Maintain something like:

```javascript
const liveStreams = new Map();
```

Each stream should include:

```text
socket
camera/session IDs
hello metadata
connection state
last message time
last sequence
frame/buffer counters
byte counters
keyframe counters
codec config
current GOP
RAM replay cache
active file writer
statistics accumulator
error state
```

Do not use SQLite as inter-process memory for every live update.

---

# 35. PHP and Node Responsibility Split

Node owns:

```text
live connections
video ingest
binary parsing
GOP assembly
RAM cache
disk recording
live stream telemetry
```

PHP owns:

```text
admin/API pages
configuration
historical queries
replay lookup
event creation
dashboard rendering
```

For live status, PHP may:

1. read a Node-produced `live-status.json`, or
2. query an internal Node HTTP endpoint.

Prefer a clean Node HTTP JSON endpoint if practical.

Example:

```text
GET /api/live
```

But do not expose it publicly beyond the isolated LAN.

---

# 36. Node HTTP Endpoints

At minimum implement:

```text
GET /health
GET /api/live
```

Suggested `/health` response:

```json
{
  "ok": true,
  "service": "freeplay",
  "version": 1,
  "activeStreams": 37,
  "uptimeSeconds": 38291
}
```

Suggested `/api/live` returns per-camera live state.

---

# 37. PHP REST/API Endpoints

Create/update endpoints such as:

```text
GET  /api/cameras.php
GET  /api/camera.php?streamId=ring6_cam2
GET  /api/sessions.php
GET  /api/stats.php
GET  /api/files.php
GET  /api/events.php
POST /api/events.php
GET  /api/replay.php
GET  /api/config.php
POST /api/config.php
GET  /api/health.php
```

Keep the API small and coherent.

Return JSON with consistent error format.

---

# 38. Replay API

Core endpoint example:

```text
GET /api/replay.php?ring=6&time=<epoch-us>&before=8&after=4
```

Response should resolve all three cameras for the ring.

Example shape:

```json
{
  "ring": 6,
  "requestedTimeEpochUs": 1788298642354913,
  "beforeSeconds": 8,
  "afterSeconds": 4,
  "cameras": [
    {
      "streamId": "ring6_cam1",
      "source": "ram",
      "available": true,
      "startTimeEpochUs": 1788298634354913,
      "endTimeEpochUs": 1788298646354913,
      "fragments": []
    },
    {
      "streamId": "ring6_cam2",
      "source": "disk",
      "available": true,
      "fragments": []
    },
    {
      "streamId": "ring6_cam3",
      "available": false
    }
  ]
}
```

The replay API should abstract whether data comes from RAM or disk.

PHP does not need direct access to Node RAM if this complicates architecture; Node may expose a replay metadata endpoint or PHP may use disk/index for older clips.

Design this cleanly.

---

# 39. Replay Timeline Semantics

Use server-authoritative common time for replay lookup.

Replay query semantics are:

```text
ring
event timestamp
pre-roll
post-roll
```

All three camera angles should resolve against the same server timeline.

Do not use raw Android monotonic timestamps for cross-camera replay alignment.

---

# 40. Replay Latency Goal

For recent 15–30 second replay:

```text
target start latency < 1 second on healthy LAN
```

The RAM GOP cache exists primarily to make recent replay fast.

A 20-second clip at 6 Mb/s is approximately:

```text
~15 MB per camera
~45 MB for three cameras
```

This is easy on the LAN.

---

# 41. Camera Quality/Completeness Metadata

Track whether GOPs are complete.

A GOP may be marked incomplete if:

```text
sequence discontinuity occurs
stream reconnect occurs mid-GOP
codec state changes unexpectedly
writer fails
```

Expose quality metadata to replay clients.

Example:

```json
{
  "complete": false,
  "sequenceGapCount": 1,
  "estimatedMissingBuffers": 1
}
```

This allows the UI to prefer another camera angle if one angle is compromised.

---

# 42. Status Control Messages from Tablet

After `hello`, accept JSON messages such as:

```text
status
ping
pong
```

Example status:

```json
{
  "type": "status",
  "streamId": "ring6_cam2",
  "uptimeMs": 382921,
  "encodedFrames": 11487,
  "keyframes": 383,
  "bytesSent": 287432991,
  "currentBitrate": 5984000,
  "averageBitrate": 5969000,
  "measuredFps": 29.98,
  "droppedFrames": 0,
  "transportQueueBytes": 0,
  "reconnectCount": 0,
  "network": "ethernet",
  "deviceTemperatureC": 41.2,
  "encoder": "c2.mtk.avc.encoder"
}
```

Store only selected status values as needed.

Do not write every status field every frame.

---

# 43. Ping/Pong

Support application-level:

```json
{
  "type": "ping",
  "id": 12345
}
```

Respond:

```json
{
  "type": "pong",
  "id": 12345
}
```

Also use WebSocket ping/pong if supported.

Track:

```text
lastMessageAt
lastPongAt
connectionHealthy
```

Close stale sockets after a configurable timeout.

---

# 44. Error Handling

Malformed input must not crash the server.

Handle:

```text
invalid JSON
invalid hello
unsupported version
invalid FPV1 magic
too-short binary message
payload length mismatch
unexpected binary before hello
unknown text message
duplicate stream
database error
writer error
```

For protocol errors:

- log concise diagnostic;
- increment error counters;
- optionally send JSON error;
- close the offending connection when necessary.

---

# 45. Logging

Use structured, readable logs.

Important events:

```text
server start
database open
WebSocket connect
hello accepted
hello rejected
stream registered
stream disconnected
codec config received
first keyframe
sequence gap
GOP finalized
file opened
file rotated
file closed
RAM cache prune
writer error
protocol error
database error
```

Do not log every frame/buffer.

---

# 46. File/Database Failure Behavior

If disk writing fails:

- mark stream unhealthy;
- retain bounded RAM replay if possible;
- continue ingest only if safe;
- expose critical health status;
- do not silently pretend recording is healthy.

If SQLite metadata writes fail:

- log error;
- avoid crashing all streams;
- preserve video recording if possible;
- expose degraded state.

---

# 47. Dashboard UI

Update `public/index.php` and `public/js/dashboard.js`.

Use Bootstrap cards or a compact table for all cameras.

Show at least:

```text
ring
camera
stream ID
connection state
resolution
configured FPS
measured FPS
bitrate
last seen
sequence gaps
RAM cache seconds
recording state
current file
reconnect/session info
health indicator
```

Color/status semantics:

```text
green  = healthy
yellow = degraded
red    = disconnected/error
gray   = never seen/inactive
```

Avoid excessive animation.

Designed for tournament operations.

---

# 48. Camera Detail Page

Update `camera.php` and `camera.js`.

Show:

```text
device identity
encoder
resolution
FPS
bitrate
session
connection time
last seen
current sequence
sequence gaps
keyframes
codec config state
RAM cache usage
active file
recent files
recent errors
```

Charts:

```text
FPS over time
bitrate over time
```

Use Chart.js.

Do not over-chart.

---

# 49. Events / IVR Page

Add or update an events page.

Allow operator to create event:

```text
ring
event time
pre-roll
post-roll
label
notes
```

Show:

```text
event timestamp
ring
available camera angles
quality/completeness
replay action
```

Event creation must not cut video physically.

---

# 50. Replay Page

Create a practical replay UI.

For a selected ring/event:

```text
CAM 1
CAM 2
CAM 3
```

with:

```text
common timeline
play/pause
seek
current time
camera switch
```

Switching cameras should preserve current replay time as closely as possible.

Browser replay should use a compatible delivery method such as:

```text
HTML5 video
or
Media Source Extensions for fMP4 fragments
```

Prefer the simplest implementation that preserves synchronized switching.

---

# 51. CSS

Keep `app.css` clean and small.

Optimize for:

```text
dark or neutral operational UI
high contrast
large touch/click targets
easy ring/camera scanning
clear health colors
desktop/laptop use
```

Do not add large front-end frameworks.

---

# 52. API Error Format

Use a consistent shape:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Missing streamId"
  }
}
```

Success example:

```json
{
  "ok": true,
  "data": {}
}
```

Where practical.

---

# 53. SQL Migration/Initialization

`schema.sql` must be idempotent enough for clean installation.

Prefer:

```sql
CREATE TABLE IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
```

If upgrading an older prototype DB is too complex, document a clean migration path.

Do not silently destroy existing recordings or DB data.

---

# 54. Runtime Configuration

Environment variables should override defaults where useful:

```text
FREEPLAY_PORT=9000
FREEPLAY_DB=data/freeplay.sqlite
FREEPLAY_VIDEO_DIR=data/video
FREEPLAY_RAM_REPLAY_SECONDS=60
FREEPLAY_FILE_SECONDS=60
```

Keep sane defaults.

---

# 55. `package.json`

Keep dependencies minimal.

Likely dependencies:

```text
ws
better-sqlite3
```

Add only what is necessary for fMP4 muxing or utilities.

Avoid heavy frameworks.

The server does not need Express unless it materially simplifies the code.

---

# 56. Code Organization

Refactor `freeplay.js` if useful, but avoid premature microservices.

A reasonable organization is:

```text
server/
├── protocol.js
├── ingest.js
├── gop.js
├── replay-cache.js
├── recorder.js
├── database.js
└── live-state.js
```

with `freeplay.js` as the entry point.

If you keep one file for now, at least separate responsibilities into classes/functions.

---

# 57. No Transcoding

This requirement is strict.

Do not:

```text
decode H.264
run computer vision
re-encode
convert to another codec
```

during ingest.

The server should:

```text
receive
validate
timestamp
index
remux
store
serve
```

---

# 58. Network Assumptions

The network is:

```text
small
isolated
wired
under operator control
< 200 devices
```

Ring switches are Gigabit PoE.

Server uplink is expected to be 10 GbE.

Therefore:

- keep WebSocket/TCP;
- do not add UDP/RTP;
- do not add adaptive bitrate Internet logic;
- do not add cloud assumptions;
- standard Ethernet MTU 1500 is fine.

---

# 59. Security Assumptions

Plain:

```text
ws://
```

is acceptable on the isolated prototype/production LAN.

However:

- keep future TLS possible;
- do not hard-code assumptions that prevent `wss://`;
- do not expose management endpoints to the public Internet.

Authentication can be added later.

---

# 60. Capacity Calculations

Use correct arithmetic.

At 42 cameras × 6 Mb/s × 10 hours:

```text
252 Mb/s aggregate
~31.5 MB/s
~1.134 TB payload over 10 hours
```

Allow additional overhead.

Do not use the previously generated incorrect ~270 GB figure.

---

# 61. Health Metrics

Expose server-wide:

```text
uptime
active streams
accepted streams
rejected streams
total bytes received
aggregate bitrate
database health
disk free space
recording writer health
RAM replay cache total bytes
protocol error count
```

Expose per-stream:

```text
connected
last message
FPS
bitrate
bytes
keyframes
sequence gaps
current GOP state
RAM cache seconds
active file
writer health
session ID
last error
```

---

# 62. Disk Space Monitoring

Monitor free disk space.

Expose warnings at configurable thresholds.

Example:

```text
warning < 500 GB
critical < 100 GB
```

Do not hard-code these values if avoidable.

When critically low:

- stop opening new files safely;
- mark health critical;
- continue bounded RAM ingest only if appropriate;
- never fill the filesystem silently.

---

# 63. Graceful Shutdown

Handle:

```text
SIGINT
SIGTERM
```

On shutdown:

1. stop accepting new connections;
2. finalize current GOPs where possible;
3. flush/close active fMP4 files;
4. finalize file DB rows;
5. end active sessions;
6. close WebSockets;
7. close SQLite cleanly;
8. exit.

---

# 64. Testing

Add tests where practical.

At minimum:

### FPV1 parser

Verify:

```text
correct 32-byte header
correct magic
big-endian parsing
payload length validation
BigInt PTS
BigInt monotonic timestamp
sequence
flags
```

### `hello` validation

Test:

```text
valid hello
wrong protocol
wrong version
missing stream ID
duplicate stream
```

### Sequence arithmetic

Test wrap:

```text
0xFFFFFFFE
0xFFFFFFFF
0x00000000
```

### GOP builder

Test:

```text
codec config
first keyframe
normal P frames
new keyframe finalizes prior GOP
disconnect finalizes/incompletes GOP
```

### Replay cache

Verify:

```text
bounded by time
bounded by bytes if implemented
correct query range
old GOPs pruned
```

### SQL

Verify clean DB creation.

---

# 65. Development Milestones

Implement in this order:

1. Parse FPV1 32-byte frames.
2. Validate `hello`.
3. Return `hello_ack`.
4. Duplicate-stream protection.
5. Per-stream live state.
6. Sequence tracking.
7. Status/ping/pong control messages.
8. Codec config capture.
9. Keyframe recognition.
10. GOP builder.
11. `request_keyframe` after hello/reconnect.
12. SQLite schema update.
13. Session/stat persistence.
14. RAM replay cache.
15. 60-second file writer.
16. `files` + `gop_index` persistence.
17. health/live Node HTTP APIs.
18. PHP camera/session/stats APIs.
19. dashboard UI.
20. camera detail UI.
21. event creation.
22. replay metadata API.
23. replay UI.
24. graceful shutdown.
25. long-duration load test.

---

# 66. Load Test Expectations

Provide a simple way to simulate many streams if practical.

Target:

```text
42 concurrent logical cameras
6 Mb/s nominal each
30 fps
1-second keyframes
```

Verify:

```text
CPU
RAM
event loop lag
aggregate throughput
SQLite latency
disk write rate
RAM cache size
open file count
socket count
```

Do not require 42 physical tablets for basic stress testing.

---

# 67. Important Protocol Separation

The ingestion connection is not the general application API.

Keep:

```text
camera WebSocket
```

focused on:

```text
hello
status
ping/pong
request_keyframe
set_bitrate
binary H.264
```

Do not overload it with:

```text
event management
replay lookup
admin UI commands
database editing
```

Those belong in PHP/HTTP APIs.

---

# 68. Compatibility Goal

The Android app and Node server must share one unambiguous contract.

The server must accept exactly the protocol described here.

Do not retain legacy 20-byte binary framing unless explicitly implemented as an optional compatibility mode.

Default should be:

```text
FPV1
32-byte header
protocol version 1
```

If legacy support is retained, isolate it clearly and do not auto-detect in a fragile way.

---

# 69. Deliverables

Make the actual project changes.

At minimum update/create:

```text
freeplay.js
package.json
README.md

data/sql/schema.sql

public/index.php
public/camera.php

public/api/common.php
public/api/cameras.php
public/api/camera.php
public/api/sessions.php
public/api/stats.php
public/api/files.php
public/api/events.php
public/api/replay.php
public/api/config.php
public/api/health.php

public/js/dashboard.js
public/js/camera.js
public/js/replay.js

public/css/app.css
```

Add additional Node modules/files if useful.

---

# 70. README Requirements

Document:

```text
npm install
npm start
PHP dev server command
default ports
database path
video path
FPV1 protocol summary
hello message
binary header
environment variables
folder layout
health endpoint
dashboard URL
replay API example
load test procedure
shutdown behavior
```

Make it practical for a developer to start the system from a clean checkout.

---

# 71. Final Quality Goal

A healthy live camera should appear approximately as:

```text
RING 6 • CAM 2
ring6_cam2

CONNECTED / RECORDING

1920×1080
30.00 fps
5.98 Mb/s

Sequence gaps      0
Keyframes          ~1/sec
RAM cache          59.8 sec
Current file       14-37-00.mp4
Session            182
Last seen          < 1 sec
```

The overall objective is:

> Build a reliable, low-overhead, GOP-aware FreePlay ingestion server that receives H.264 MediaCodec output over FPV1 WebSockets, preserves timing and sequencing, maintains a bounded recent replay cache, continuously remuxes to durable fragmented-MP4 storage, indexes the timeline in SQLite, and exposes practical PHP/JS/CSS tools for tournament monitoring, IVR events, and fast multi-camera replay.
