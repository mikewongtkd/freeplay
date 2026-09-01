# FreePlay Server Prototype

Prototype server for the FreePlay Taekwondo instant replay system.

## Stack

- Node.js + `ws`: long-running binary WebSocket video ingest on port 9000
- SQLite: cameras, sessions, one-second statistics, configuration, events
- PHP: JSON APIs and browser pages
- Bootstrap + jQuery + Chart.js: dashboard UI
- `data/video/`: optional raw H.264 recording storage

## Requirements

- Node.js 20+ recommended
- PHP 8+ with PDO SQLite enabled
- npm

## Install and initialize

From this directory:

```bash
npm install
npm start
```

`freeplay.js` automatically creates/opens `data/freeplay.sqlite` and applies `data/sql/schema.sql`.

In another terminal, run the PHP development server:

```bash
php -S 0.0.0.0:8080 -t public
```

Open:

```text
http://SERVER_IP:8080/
```

The Android tablet should connect to:

```text
ws://SERVER_IP:9000/
```

## Android protocol expected by this prototype

The first WebSocket message must be JSON, for example:

```json
{
  "type": "hello",
  "streamId": "ring1_cam1",
  "ring": 1,
  "camera": 1,
  "device": "SM-X110",
  "resolution": "1920x1080",
  "fps": 30,
  "codec": "h264",
  "bitrate": 6000000
}
```

Each following WebSocket message is binary with a 20-byte big-endian header followed by an H.264 payload:

```text
0..7    signed int64   presentation timestamp in microseconds
8..11   uint32         sequence number
12..15  uint32         MediaCodec BufferInfo.flags
16..19  uint32         H.264 payload length
20..    bytes          H.264 encoded payload
```

Sequence gaps are counted as dropped/missing frames. Bit 0 of MediaCodec flags is treated as a keyframe indicator.

## Enable raw H.264 recording

By default the ingest server measures traffic but does not save every payload. To enable raw recording:

```bash
sqlite3 data/freeplay.sqlite "UPDATE configuration SET value='1' WHERE key='record_raw_h264';"
```

Restart `freeplay.js`. Files will appear under:

```text
data/video/<stream_id>/<timestamp>.h264
```

## Important prototype notes

- Node keeps live statistics in memory and persists summaries once per second.
- PHP reads live state from `data/live-status.json` and historical state from SQLite.
- Do not expose this prototype directly to the public Internet; authentication/TLS are not implemented yet.
- The next production step is typically fMP4 segmentation and replay indexing rather than raw `.h264` files.
