# FreePlay Camera WebSocket Ingestion Protocol

You are working inside the existing Android Studio project for **FreePlay Camera**.

- Android package: `net.opentkd.freeplay`
- Target device: Samsung Galaxy Tab A9 (`SM-X110`)
- Video source: rear camera using Camera2
- Video encoder: Android `MediaCodec`, H.264/AVC hardware encoder
- Baseline video profile:
  - 1920×1080
  - 30 fps
  - 6,000,000 bps
  - 1-second keyframe / I-frame interval
  - no audio
- Network: isolated, wired Ethernet LAN under full operator control
- Ring topology: 3 camera tablets per ring
- Server: central Mac mini running `freeplay.js`
- Transport: **WebSocket over TCP/IP**
- Default server address: `10.0.0.50`
- Default WebSocket port: `9000`
- Deterministic stream ID: `ring{ringNumber}_cam{cameraNumber}`, e.g. `ring6_cam2`

The current application already contains or is expected to contain abstractions similar to:

```text
net.opentkd.freeplay
├── camera/
│   └── CameraController.kt
├── encoder/
│   ├── VideoEncoder.kt
│   └── EncoderCapabilities.kt
├── network/
│   ├── VideoTransport.kt
│   ├── MockVideoTransport.kt
│   └── TransportState.kt
├── settings/
│   ├── AppSettings.kt
│   └── SettingsRepository.kt
├── status/
│   ├── DeviceStatus.kt
│   └── DeviceStatusManager.kt
└── ...
```

Your task is to implement the production-oriented **WebSocket ingestion transport** while preserving the existing modular architecture.

---

## 1. Architectural Objective

Implement:

```text
Camera2
   ↓
MediaCodec H.264 encoder
   ↓
VideoTransport abstraction
   ↓
WebSocketVideoTransport
   ↓
TCP/IP
   ↓
freeplay.js
```

The Android tablet is responsible for:

1. capturing camera video;
2. hardware encoding to H.264;
3. preserving encoder timestamps and flags;
4. transmitting each encoded MediaCodec output buffer as one FreePlay binary WebSocket message;
5. transmitting low-rate control/status messages as JSON WebSocket text messages;
6. detecting connection loss and reconnecting automatically;
7. maintaining bounded buffering/backpressure behavior;
8. collecting transport statistics.

The tablet must **not decode or re-encode video** for transport.

Do not perform unnecessary frame copies.

The intended video pipeline is:

```text
Camera2 CaptureSession
      │
      ├── Preview Surface
      │
      └── MediaCodec input Surface
                    │
                    ▼
              MediaCodec AVC
                    │
                    ▼
              encoded output
                    │
                    ▼
          WebSocketVideoTransport
```

---

## 2. Transport Choice

Use **WebSocket over TCP/IP**.

For the current controlled LAN, reliability and implementation simplicity are more important than the theoretical latency benefits of UDP.

The default endpoint is:

```text
ws://10.0.0.50:9000
```

The host and port must be configurable through existing app settings.

Design the implementation so that switching to:

```text
wss://
```

in the future does not require redesigning the transport API.

Prefer a mature Android WebSocket implementation such as **OkHttp WebSocket** unless the project already contains another appropriate implementation.

---

## 3. WebSocket Message Types

There are exactly two categories of WebSocket messages:

```text
TEXT frames   → JSON control/status messages
BINARY frames → H.264 encoded MediaCodec output buffers
```

Do not encode video as Base64.

Do not wrap video payloads in JSON.

---

## 4. Connection Lifecycle

The expected lifecycle is:

```text
Tablet                              freeplay.js
   │                                     │
   │──── WebSocket connection ──────────►│
   │                                     │
   │──── TEXT: hello ───────────────────►│
   │                                     │
   │◄─── TEXT: hello_ack ────────────────│
   │                                     │
   │──── BINARY: H.264 access unit ─────►│
   │──── BINARY: H.264 access unit ─────►│
   │──── BINARY: H.264 access unit ─────►│
   │               ...                   │
   │                                     │
   │──── TEXT: status ──────────────────►│
   │                                     │
   │◄─── TEXT: request_keyframe ─────────│
   │                                     │
   │──── BINARY: next keyframe ─────────►│
```

Video transmission must not begin until the WebSocket is open and the initial `hello` has been sent.

Prefer waiting for `hello_ack` before treating the stream as fully connected/healthy.

---

## 5. `hello` Message

Immediately after the WebSocket connection opens, send:

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

Populate fields from runtime values whenever possible.

`streamId` must be deterministically generated:

```kotlin
"ring${ringNumber}_cam${cameraNumber}"
```

Ring and camera number come from persisted settings.

---

## 6. `hello_ack` Message

The server is expected to respond with something similar to:

```json
{
  "type": "hello_ack",
  "accepted": true,
  "streamId": "ring6_cam2",
  "serverTime": 1788298642.354
}
```

Handle rejected registration gracefully, e.g.:

```json
{
  "type": "hello_ack",
  "accepted": false,
  "reason": "duplicate_stream"
}
```

If rejected:

- stop transmitting video;
- set transport state to rejected/error;
- surface the reason in the UI/status model;
- do not enter a rapid reconnect loop.

---

## 7. Binary Video Message Format

Each MediaCodec encoded output buffer must be transmitted as **one WebSocket binary message**.

The message is:

```text
32-byte FreePlay header
+
H.264 encoded payload
```

Use **big-endian / network byte order** for all multibyte integer fields.

```text
Offset  Size   Field
------  ----   ---------------------------------------------
0       4      Magic ASCII: "FPV1"
4       8      presentationTimeUs
12      4      sequenceNumber
16      4      MediaCodec BufferInfo flags
20      4      payloadLength
24      8      tabletMonotonicTimestampNs
32      ...    H.264 encoded payload
```

Total header size is exactly **32 bytes**.

### Magic

The first four bytes are exactly:

```text
46 50 56 31
 F  P  V  1
```

### `presentationTimeUs`

Copy directly from:

```kotlin
MediaCodec.BufferInfo.presentationTimeUs
```

as a signed 64-bit integer.

Do not convert it to wall-clock time.

### `sequenceNumber`

Maintain one monotonically increasing unsigned 32-bit sequence counter per WebSocket transport session.

Increment once for every binary encoded buffer transmitted.

A new WebSocket connection may reset the sequence to zero. The `hello` boundary defines a new transport session.

### `flags`

Preserve:

```kotlin
MediaCodec.BufferInfo.flags
```

verbatim as a 32-bit integer.

The server needs to identify at least:

- keyframe / sync-frame buffers;
- codec-config buffers;
- end-of-stream if used.

Do not throw away codec configuration buffers.

### `payloadLength`

The number of H.264 payload bytes immediately following the 32-byte header.

It must exactly match the number of bytes copied from the corresponding MediaCodec output buffer.

### `tabletMonotonicTimestampNs`

Record a local monotonic timestamp as close as practical to transport handoff using:

```kotlin
SystemClock.elapsedRealtimeNanos()
```

Do not use wall-clock time for this field.

The server separately records its own receive timestamp.

---

## 8. MediaCodec Output Handling

Transmit encoded output exactly as produced by MediaCodec.

Conceptual drain loop:

```kotlin
val outputIndex = codec.dequeueOutputBuffer(bufferInfo, timeoutUs)

if (outputIndex >= 0) {
    val encodedBuffer = codec.getOutputBuffer(outputIndex)

    // Extract bufferInfo.offset .. offset + size
    // Build 32-byte FreePlay header
    // Send header + H.264 payload as one binary WS message

    codec.releaseOutputBuffer(outputIndex, false)
}
```

Requirements:

- honor `bufferInfo.offset`;
- honor `bufferInfo.size`;
- preserve `presentationTimeUs`;
- preserve `flags`;
- release every MediaCodec output buffer promptly;
- never retain a MediaCodec-owned buffer after release;
- do not let slow networking block the MediaCodec drain thread indefinitely;
- avoid unnecessary allocations.

If the WebSocket library requires ownership of an immutable buffer, copy once into a correctly sized outbound message.

---

## 9. H.264 Codec Configuration

MediaCodec may emit SPS/PPS or other codec configuration with:

```kotlin
BUFFER_FLAG_CODEC_CONFIG
```

These buffers must be transmitted.

Do not silently discard codec configuration.

On every fresh encoder session, ensure codec configuration reaches the server before or with the first decodable GOP.

---

## 10. Keyframes and GOPs

Baseline encoder configuration:

```text
30 fps
1-second keyframe interval
```

Expected stream:

```text
I P P P P P ... P
I P P P P P ... P
I P P P P P ... P
```

The Android client does **not** build GOP objects.

Its responsibilities are only to:

- preserve PTS;
- preserve flags;
- transmit encoded buffers;
- maintain the configured keyframe interval.

The server will detect GOP boundaries from keyframe flags.

---

## 11. `request_keyframe`

The server may send:

```json
{
  "type": "request_keyframe"
}
```

Upon receipt, request an immediate sync frame from MediaCodec using the Android-supported mechanism, e.g.:

```kotlin
val params = Bundle()
params.putInt(
    MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME,
    0
)
codec.setParameters(params)
```

Guard with API/support checks and exception handling.

This command is especially important after:

- reconnect;
- detected corruption;
- stream discontinuity.

---

## 12. Optional `set_bitrate`

Support if practical:

```json
{
  "type": "set_bitrate",
  "bitrate": 6000000
}
```

Apply dynamically where MediaCodec supports it.

Validate the requested bitrate against safe bounds.

If unsupported, report an error without crashing.

---

## 13. Status Messages

Send a JSON status message approximately once per second.

Example:

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

Only send metrics that can be measured reliably. Do not fabricate metrics.

Status reporting must never interfere materially with video delivery.

---

## 14. Ping / Pong and Liveness

Use WebSocket-level ping/pong where supported.

Application-level messages may also be used:

```json
{
  "type": "ping",
  "id": 12345
}
```

Response:

```json
{
  "type": "pong",
  "id": 12345
}
```

Suggested behavior:

- heartbeat approximately every 5 seconds;
- declare unhealthy after several missed intervals;
- avoid aggressive reconnect loops.

Centralize timing constants.

---

## 15. Backpressure — Critical Requirement

TCP is reliable, but a slow server or network can make the outbound queue grow.

The app **must not use an unbounded video queue**.

Track at least:

```text
queued messages
queued bytes
oldest queued message age
```

The normal state on the controlled Gigabit LAN should be approximately:

```text
MediaCodec → WebSocket immediately
```

Define documented limits such as:

```text
MAX_QUEUED_VIDEO_BYTES
MAX_QUEUED_VIDEO_MESSAGES
MAX_QUEUE_AGE_MS
```

If limits are exceeded:

1. mark the stream unhealthy;
2. increment congestion/drop metrics;
3. prevent unbounded memory growth;
4. use controlled recovery;
5. do not indefinitely block the encoder drain loop.

Preferred recovery:

```text
queue congestion
      ↓
discard stale unsent encoded video in a controlled manner
      ↓
force a fresh keyframe
      ↓
resume from a clean decoding boundary
```

Do not drop arbitrary reference frames and continue dependent frames without forcing recovery.

If the WebSocket implementation does not expose sufficient queue state, add a small bounded queue and one dedicated sender coroutine/thread.

---

## 16. Threading / Coroutines

Do not perform these on the UI thread:

- MediaCodec drain loop;
- large binary message construction;
- WebSocket sends;
- queue management;
- reconnect delays.

Use coroutines or executors with structured lifecycle management.

UI code should observe immutable state.

Do not leak Activity/Context into long-lived network components.

---

## 17. Reconnection

Assume Ethernet may be unplugged/replugged.

Desired state flow:

```text
STREAMING
   │
   X connection lost
   │
DISCONNECTED
   │
RECONNECTING
   │
WebSocket open
   │
send hello
   │
receive hello_ack
   │
force keyframe
   │
STREAMING
```

Use bounded progressive retry delays such as:

```text
1 s
2 s
5 s
5 s
5 s
...
```

On reconnect:

- send a new `hello`;
- start a new sequence-number session;
- keep encoder running if practical;
- force a keyframe after acceptance;
- resume from a clean decoding boundary;
- increment `reconnectCount`.

---

## 18. Transport State Model

Expose a clear state model, for example:

```kotlin
sealed interface TransportState {
    data object Disconnected : TransportState
    data object Connecting : TransportState
    data object AwaitingHelloAck : TransportState
    data object Streaming : TransportState
    data class Reconnecting(val attempt: Int) : TransportState
    data class Rejected(val reason: String) : TransportState
    data class Error(val message: String) : TransportState
}
```

Integrate it with the existing app status/UI architecture.

---

## 19. `VideoTransport` Interface

Preserve the transport abstraction.

A suitable API may resemble:

```kotlin
interface VideoTransport {
    val state: StateFlow<TransportState>
    val stats: StateFlow<TransportStats>

    suspend fun connect(config: TransportConfig)

    fun sendEncodedBuffer(
        data: ByteBuffer,
        bufferInfo: MediaCodec.BufferInfo
    )

    suspend fun disconnect()
}
```

Adapt to the existing project rather than unnecessarily rewriting it.

Provide:

```text
MockVideoTransport
WebSocketVideoTransport
```

Do not couple `VideoEncoder` directly to OkHttp.

---

## 20. Transport Configuration

Create or extend something similar to:

```kotlin
data class TransportConfig(
    val serverHost: String,
    val serverPort: Int,
    val useTls: Boolean,
    val ringNumber: Int,
    val cameraNumber: Int,
    val streamId: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val bitrate: Int,
    val keyframeIntervalSeconds: Int
)
```

Persist configurable values through the existing DataStore/settings layer.

---

## 21. Statistics

Track at least:

```text
connection start time
uptime
encoded buffer count
keyframe count
bytes generated
bytes transmitted
current bitrate
average bitrate
measured encoded FPS
sequence number
reconnect count
transport queue bytes
transport queue depth
last successful send time
last server message time
last error
```

Aggregate UI-facing values about once per second.

Do not trigger Compose recomposition for every encoded buffer.

---

## 22. Measured FPS

Calculate actual encoder FPS using PTS deltas and/or rolling encoded-frame counts.

At 30 fps, expected PTS spacing is approximately:

```text
33,333 microseconds
```

Expose both configured FPS and measured FPS.

This is important for long-duration validation of the Galaxy Tab A9.

---

## 23. Ethernet / Network Health

Where Android exposes reliable information, report:

```text
network type
Ethernet connected/disconnected
local IP
link properties
```

Do not depend on Wi-Fi-specific APIs.

The intended production network is wired Ethernet.

Network availability callbacks should assist reconnect behavior.

---

## 24. Error Handling

Never crash because of:

- unavailable server;
- malformed server JSON;
- unknown control message;
- broken WebSocket;
- encoder output anomaly;
- invalid settings;
- timeout;
- server rejection.

Unknown control messages should be logged and safely ignored.

Keep a concise rolling error/status history.

---

## 25. Logging

Use structured tags such as:

```text
FreePlay/Transport
FreePlay/WebSocket
FreePlay/Encoder
FreePlay/Network
```

Log important lifecycle events:

```text
connecting
connected
hello sent
hello acknowledged
stream accepted
stream rejected
first encoded buffer
first keyframe
codec config sent
connection lost
reconnect attempt
keyframe requested
queue congestion
transport error
disconnect
```

Do not log every encoded buffer during normal operation.

---

## 26. Android Manifest

Ensure:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<uses-feature
    android:name="android.hardware.camera"
    android:required="true" />
```

Do not add unrelated permissions.

---

## 27. Security Assumptions

The current deployment is an isolated LAN controlled by the operator.

For the prototype:

```text
ws://
```

is acceptable.

However:

- keep `wss://` architecturally possible;
- do not hard-code plaintext assumptions;
- do not globally disable Android security;
- scope any cleartext-network exception narrowly.

---

## 28. Server Expectations

Assume `freeplay.js` will:

1. accept WebSocket clients on port `9000`;
2. parse JSON text control messages;
3. validate `hello`;
4. associate connection with `streamId`;
5. return `hello_ack`;
6. parse the 32-byte binary header;
7. validate magic, sequence, and payload length;
8. record its own receive timestamp;
9. preserve PTS, flags, and tablet monotonic timestamp;
10. detect keyframes;
11. build GOP metadata;
12. maintain roughly a 60-second RAM replay cache;
13. continuously write larger fragmented-MP4 recording files;
14. index GOP/time/file information in SQLite.

The Android client does not implement replay retrieval.

---

## 29. Separation of Responsibilities

Keep ingestion separate from replay:

```text
Android camera
      │
      ▼
INGESTION
H.264 + timestamps
      │
      ▼
SERVER GOP / RECORDING LAYER
RAM + fMP4 + SQLite
      │
      ▼
REPLAY SERVICE
time-range retrieval
      │
      ▼
IVR playback application
```

The Android camera application's responsibility ends at reliable ingestion.

---

## 30. Performance Requirements

The implementation must support many hours of continuous operation.

Avoid:

- unbounded queues;
- retaining encoded frames indefinitely;
- excessive allocation;
- blocking the main thread;
- Base64;
- unnecessary decode/re-encode;
- bitmap extraction;
- per-frame UI updates;
- per-frame verbose logging.

Plan endurance tests of:

```text
8–12 hours continuous streaming
```

while monitoring:

```text
measured FPS
bitrate
reconnects
queue depth
dropped frames
encoder errors
memory
temperature
```

---

## 31. Development/Test Milestones

Implement and verify in this order:

1. `WebSocketVideoTransport` compiles.
2. Connect to `ws://server:9000`.
3. Send `hello`.
4. Parse `hello_ack`.
5. Preserve existing Camera2 preview.
6. Preserve existing MediaCodec H.264 encoding.
7. Build the correct 32-byte FreePlay header.
8. Send codec-config buffers.
9. Send encoded H.264 buffers.
10. Verify server receives correct stream ID, sequence, PTS, flags, and payload sizes.
11. Verify keyframes approximately every second.
12. Implement 1 Hz status JSON.
13. Implement `request_keyframe`.
14. Implement heartbeat/liveness.
15. Implement bounded backpressure.
16. Implement reconnect behavior.
17. Expose transport metrics in the existing UI.
18. Run a 10-minute stability test.
19. Run a 1-hour stability test.
20. Run an 8–12-hour endurance test.

---

## 32. Deliverables

Make the actual code changes in the Android Studio project.

Provide or update, as appropriate:

```text
network/
├── VideoTransport.kt
├── WebSocketVideoTransport.kt
├── TransportConfig.kt
├── TransportState.kt
├── TransportStats.kt
└── protocol/
    ├── FreePlayProtocol.kt
    ├── FreePlayBinaryHeader.kt
    └── FreePlayControlMessage.kt
```

Exact organization may be adapted to the existing project, but keep protocol framing separate from WebSocket implementation.

Also update:

- Gradle dependencies;
- Android manifest/network security configuration if required;
- settings integration;
- status integration;
- UI transport status/stats.

---

## 33. Protocol Helper Requirements

Create explicit protocol helpers rather than hand-building headers throughout the transport.

For example:

```kotlin
object FreePlayProtocol {
    const val PROTOCOL_NAME = "freeplay-ingest"
    const val PROTOCOL_VERSION = 1
    const val HEADER_SIZE = 32
    const val MAGIC = 0x46505631 // "FPV1"
}
```

Create a serializer for:

```kotlin
data class FreePlayBinaryHeader(
    val presentationTimeUs: Long,
    val sequenceNumber: UInt,
    val flags: Int,
    val payloadLength: Int,
    val tabletMonotonicTimestampNs: Long
)
```

Serialized layout must be exactly:

```text
0       4      "FPV1"
4       8      PTS
12      4      sequence
16      4      flags
20      4      payloadLength
24      8      monotonic timestamp
```

Always serialize big-endian.

---

## 34. Unit Tests

Add tests for:

### Binary header serialization

Verify:

- exactly 32 bytes;
- correct magic;
- correct big-endian representation;
- correct 64-bit PTS;
- correct unsigned sequence bit pattern;
- correct flags;
- correct payload length;
- correct monotonic timestamp.

### Stream ID

Verify:

```text
ring=1 camera=1 → ring1_cam1
ring=14 camera=3 → ring14_cam3
```

### Control JSON

Verify serialization/deserialization of:

```text
hello
hello_ack
status
request_keyframe
set_bitrate
ping
pong
```

### Backpressure

Verify the outbound queue cannot exceed configured bounds.

---

## 35. Do Not Over-Engineer

This is a controlled local tournament LAN.

Do not add:

- RTP;
- UDP;
- WebRTC;
- QUIC;
- forward-error correction;
- adaptive Internet streaming;
- cloud dependencies;
- Kafka;
- Redis;
- message brokers.

The current protocol is intentionally:

```text
H.264
  ↓
FreePlay framing
  ↓
WebSocket
  ↓
TCP
  ↓
Gigabit Ethernet
```

The abstraction should allow future replacement, but the implementation now should remain small, deterministic, testable, and reliable.

---

## 36. Final Quality Goal

A running tablet should be able to show status similar to:

```text
FREEPLAY CAMERA

RING 6 • CAM 2
1920×1080 • 30 fps • H.264

STREAMING

Server            10.0.0.50:9000
Transport         WebSocket/TCP
Stream ID         ring6_cam2

Configured FPS    30
Measured FPS      29.98

Target bitrate    6.00 Mb/s
Measured bitrate  5.97 Mb/s

Queue             0 bytes
Reconnects        0

Encoder           c2.mtk.avc.encoder
Keyframe interval ~1.0 sec
```

The central goal is:

> Reliably deliver every H.264 MediaCodec output buffer, with accurate timing and sequencing metadata, from the Samsung Galaxy Tab A9 to `freeplay.js`, while keeping latency low, memory bounded, recovery predictable, and transport implementation completely separate from replay logic.
