# Gemini Android Studio Implementation Prompt — FreePlay Remote Stream Control

**Revision:** 1.1  
**Status:** Android implementation prompt and normative protocol specification  
**Baseline:** FreePlay Camera WebSocket Ingestion Protocol version 1  
**Purpose:** Allow an authorized IVR operator to start video from a connected but idle Android camera.

## Instructions to Gemini

You are working in Android Studio inside the existing **FreePlay Camera** project. Implement the Android-camera side of the remote stream-control protocol specified below. Make actual production-quality code and test changes; do not merely describe them.

Before editing, read the existing project completely enough to understand its actual architecture. In particular, inspect:

```text
docs/protocol.md
app/build.gradle.kts
app/src/main/AndroidManifest.xml
app/src/main/java/net/opentkd/freeplay/MainActivity.kt
app/src/main/java/net/opentkd/freeplay/camera/CameraController.kt
app/src/main/java/net/opentkd/freeplay/encoder/VideoEncoder.kt
app/src/main/java/net/opentkd/freeplay/encoder/AvcCodecConfig.kt
app/src/main/java/net/opentkd/freeplay/network/VideoTransport.kt
app/src/main/java/net/opentkd/freeplay/network/WebSocketVideoTransport.kt
app/src/main/java/net/opentkd/freeplay/network/TransportConfig.kt
app/src/main/java/net/opentkd/freeplay/network/TransportState.kt
app/src/main/java/net/opentkd/freeplay/network/TransportStats.kt
app/src/main/java/net/opentkd/freeplay/network/protocol/FreePlayProtocol.kt
app/src/main/java/net/opentkd/freeplay/network/protocol/FreePlayControlMessage.kt
app/src/main/java/net/opentkd/freeplay/network/protocol/FreePlayBinaryHeader.kt
app/src/main/java/net/opentkd/freeplay/settings/AppSettings.kt
app/src/main/java/net/opentkd/freeplay/settings/SettingsRepository.kt
app/src/main/java/net/opentkd/freeplay/status/DeviceStatus.kt
app/src/main/java/net/opentkd/freeplay/status/DeviceStatusManager.kt
app/src/main/java/net/opentkd/freeplay/ui/LiveScreen.kt
app/src/main/java/net/opentkd/freeplay/ui/StatusScreen.kt
app/src/main/java/net/opentkd/freeplay/ui/SettingsScreen.kt
```

Also inspect all existing unit and instrumented tests. Treat `docs/protocol.md` as the implemented baseline and this document as the required backward-compatible revision. When the documents differ, this revision governs remote stream control; unchanged FPV1 ingestion behavior continues to be governed by `docs/protocol.md`.

### Scope

Implement only the Android project in this task. Do not attempt to edit `freeplay.js`, the PHP IVR application, or another repository. The server and IVR requirements below define the contract the Android code must support and the behavior expected during later integration.

### Working requirements

- Adapt to the code that exists; do not invent a parallel architecture when an existing abstraction can be extended cleanly.
- Preserve all existing local/manual start, preview, recording, settings, reconnect, codec-configuration caching, FPV1 serialization, and backpressure behavior.
- Keep the 32-byte FPV1 binary header byte-for-byte compatible.
- Keep Camera2, MediaCodec, WebSocket, and lifecycle work off the main thread.
- Use structured coroutines and explicit ownership; do not introduce global mutable lifecycle state.
- Keep UI state observable and immutable at presentation boundaries.
- Do not add cloud services, WebRTC, RTP, message brokers, or unrelated dependencies.
- Do not weaken Android permission, foreground-service, cleartext-network, or privacy protections.
- Do not silently swallow lifecycle failures. Convert them into the protocol states and bounded diagnostics specified below.
- Preserve unrelated user changes in the working tree.
- If an exact class name proposed below conflicts with the existing design, use the project’s established naming and document the mapping in your final report.

### Required Android deliverables

At minimum, implement or update:

1. Strict JSON models and parsing for all new control messages.
2. Capability negotiation in `hello` and `hello_ack`.
3. A persistent registered-idle WebSocket state independent of encoder state.
4. A serialized stream lifecycle coordinator connecting transport commands to `CameraController` and `VideoEncoder`.
5. Idempotent `set_streaming` start and stop handling keyed by `commandId`.
6. `command_ack`, `stream_started`, `stream_start_failed`, and `stream_stopped` transmission.
7. Monotonic stream-generation tracking and generation-aware outbound queue behavior.
8. Guaranteed startup ordering: `stream_started`, codec configuration, keyframe, then dependent frames.
9. One-hertz status reporting while idle, transitioning, streaming, and in error.
10. Local UI states for Connected/Idle, Starting, Streaming, Stopping, and Error, including a visible indication of remote initiation.
11. A persisted setting to enable/disable remote start and, if appropriate, remote stop.
12. Foreground/background lifecycle behavior appropriate for the project’s target SDK so the idle control connection remains reliable without evading Android restrictions.
13. Unit tests for protocol serialization, command idempotency, state transitions, generation boundaries, and queue safety.
14. Instrumented or integration-oriented tests where Android framework behavior cannot be covered by local unit tests.
15. Updated camera-side documentation for any implementation-specific behavior or limitations.

### Required verification

Run the project’s existing verification tasks plus the new tests. At minimum, attempt the appropriate Gradle equivalents of:

```text
test/debug unit tests
lint
debug build/assemble
```

Fix failures caused by your changes. If a device-dependent or environment-dependent check cannot run, state exactly which check was unavailable and why; do not report it as passing.

### Final response expected from Gemini

When implementation is complete, report:

- the behavioral outcome;
- files created and materially changed;
- the final transport/media state model;
- how command idempotency and concurrency are enforced;
- how codec configuration and first-keyframe ordering are guaranteed;
- tests and build tasks run with results;
- any remaining server-side integration dependency or device-only validation step.

Do not stop after proposing a plan. Continue through implementation and reasonable verification unless genuinely blocked by missing project inputs or required operator/device action.

---

## Normative protocol specification

This specification preserves the existing FPV1 binary video format and adds a backward-compatible JSON control-plane extension for remotely starting and stopping capture and encoding.

The Android package, target hardware, video profile, network assumptions, and transport remain unchanged:

- package: `net.opentkd.freeplay`;
- target: Samsung Galaxy Tab A9 (`SM-X110`);
- Camera2 rear camera;
- MediaCodec H.264/AVC hardware encoding;
- 1920×1080, 30 fps, 6 Mbps, one-second keyframe interval, no audio;
- WebSocket/TCP on the isolated tournament LAN;
- default endpoint `ws://10.0.0.50:9000`;
- deterministic ID `ring{ringNumber}_cam{cameraNumber}`.

## 1. Compatibility and protocol version

The WebSocket protocol name and version remain:

```json
{
  "protocol": "freeplay-ingest",
  "version": 1
}
```

Remote control is negotiated through capabilities rather than by changing the FPV1 version. This permits an updated server to accept older cameras and an updated camera to connect to an older server.

An older camera that does not advertise `remoteStreamingControl` must never receive a remote streaming command. An updated camera connected to a server that does not advertise the capability must continue to support locally initiated streaming.

The following remain unchanged:

- one JSON control message per WebSocket text frame;
- one MediaCodec output buffer per WebSocket binary frame;
- the 32-byte FPV1 binary header;
- big-endian integer serialization;
- H.264 payload handling;
- sequence-number semantics within a WebSocket connection;
- bounded backpressure and reconnect behavior.

## 2. Architectural change

Transport connection state and media streaming state are now separate.

```text
WebSocket transport             Camera media pipeline
-------------------             ---------------------
DISCONNECTED                    STOPPED
CONNECTING                      STARTING
REGISTERED_IDLE                 STREAMING
RECONNECTING                    STOPPING
REJECTED                        ERROR
```

The camera should normally keep its WebSocket registered while the media pipeline is stopped:

```text
Camera app
   ├── persistent control WebSocket
   ├── heartbeat and 1 Hz status
   └── Camera2 + MediaCodec pipeline (startable/stoppable)
```

The control connection must not require an active encoder. While idle, the camera continues to send heartbeat and status messages so the server can distinguish `connected_idle` from `disconnected`.

## 3. Required camera state model

Use explicit media states:

```kotlin
enum class StreamState {
    IDLE,
    STARTING,
    STREAMING,
    STOPPING,
    ERROR
}
```

Transport state should include a registered idle state:

```kotlin
sealed interface TransportState {
    data object Disconnected : TransportState
    data object Connecting : TransportState
    data object AwaitingHelloAck : TransportState
    data object RegisteredIdle : TransportState
    data object RegisteredStreaming : TransportState
    data class Reconnecting(val attempt: Int) : TransportState
    data class Rejected(val reason: String) : TransportState
    data class Error(val message: String) : TransportState
}
```

Do not infer media state solely from WebSocket connectivity.

## 4. Revised lifecycle

### 4.1 Connected idle, followed by remote start

```text
Android camera                         Ingestion server
      │                                      │
      │──── WebSocket connect ──────────────►│
      │──── hello + capabilities ───────────►│
      │◄─── hello_ack + capabilities ───────│
      │──── status: idle ───────────────────►│
      │          control connection alive    │
      │                                      │
      │◄─── set_streaming(desired=true) ─────│
      │──── command_ack(starting) ──────────►│
      │     start Camera2 and MediaCodec      │
      │──── stream_started ─────────────────►│
      │──── codec configuration ────────────►│
      │──── first keyframe ─────────────────►│
      │──── dependent H.264 buffers ────────►│
      │──── status: streaming ──────────────►│
```

### 4.2 Remote stop

```text
Android camera                         Ingestion server
      │◄─── set_streaming(desired=false) ────│
      │──── command_ack(stopping) ──────────►│
      │──── optional final/EOS buffer ──────►│
      │     stop encoder and capture          │
      │──── stream_stopped ─────────────────►│
      │──── status: idle ───────────────────►│
```

Stopping media must not close the control WebSocket unless the application itself is shutting down or connectivity is lost.

## 5. Revised `hello`

The camera advertises supported commands and its state when registering:

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
  "appVersion": "1.1.0",
  "codec": "h264",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "bitrate": 6000000,
  "keyframeInterval": 1,
  "encoder": "c2.mtk.avc.encoder",
  "streamState": "idle",
  "capabilities": {
    "remoteStreamingControl": true,
    "remoteStop": true,
    "requestKeyframe": true,
    "setBitrate": true,
    "commandAcknowledgement": true,
    "streamGeneration": true
  }
}
```

Rules:

- `streamState` is `idle`, `starting`, `streaming`, `stopping`, or `error`.
- Omitted capabilities are treated as unsupported.
- The encoder name may be empty while idle if it is not known until configuration.
- Width, height, FPS, bitrate, and keyframe interval describe the intended next stream while idle and the active configuration while streaming.
- A camera that starts locally before connecting may register with `streamState: "streaming"` and then send codec configuration plus a keyframe after acceptance.

## 6. Revised `hello_ack`

The server returns its supported control features:

```json
{
  "type": "hello_ack",
  "accepted": true,
  "streamId": "ring6_cam2",
  "serverTime": 1790365142.354,
  "serverTimeEpochUs": "1790365142354000",
  "capabilities": {
    "remoteStreamingControl": true,
    "commandAcknowledgement": true
  }
}
```

Epoch-microsecond fields are decimal strings in JSON. `serverTime` remains for compatibility.

The camera enables remote control only when both peers advertise `remoteStreamingControl: true`.

## 7. `set_streaming` command

The ingestion server sends:

```json
{
  "type": "set_streaming",
  "commandId": "cmd-N7Qp0T18jByH",
  "desired": true,
  "reason": "ivr_operator",
  "requestedAtEpochUs": "1790365142354000"
}
```

Fields:

| Field | Type | Required | Meaning |
|---|---:|---:|---|
| `type` | string | yes | Always `set_streaming`. |
| `commandId` | string | yes | Opaque server-generated identifier, 1–128 safe ASCII characters. |
| `desired` | boolean | yes | `true` starts streaming; `false` stops it. |
| `reason` | string | no | Operator/workflow context for logs. It is not an authorization credential. |
| `requestedAtEpochUs` | decimal string | yes | Server wall-clock request time. |

Validation and safety:

- Never treat `reason` as executable input.
- Reject missing, malformed, or unsupported commands without crashing.
- Process lifecycle commands serially.
- Cache recent command results by `commandId` for at least two minutes.
- Receiving the same `commandId` again must replay the prior acknowledgement/result and must not restart the encoder.
- If already in the desired stable state, acknowledge success with `alreadyInDesiredState: true`; do not tear down or recreate the pipeline.
- A conflicting command while starting/stopping should be rejected with `busy`, unless the implementation can safely serialize it.

## 8. `command_ack`

The camera must acknowledge semantic acceptance promptly, before slow Camera2/MediaCodec startup completes:

```json
{
  "type": "command_ack",
  "commandId": "cmd-N7Qp0T18jByH",
  "commandType": "set_streaming",
  "accepted": true,
  "streamState": "starting",
  "alreadyInDesiredState": false
}
```

Rejected example:

```json
{
  "type": "command_ack",
  "commandId": "cmd-N7Qp0T18jByH",
  "commandType": "set_streaming",
  "accepted": false,
  "streamState": "idle",
  "reason": "camera_permission_required",
  "retryable": false
}
```

Recommended rejection reasons:

```text
unsupported_command
invalid_command
remote_control_disabled
camera_permission_required
camera_unavailable
encoder_unavailable
thermal_shutdown
busy
app_not_foreground_capable
internal_error
```

Send the acknowledgement within two seconds. Acceptance means that the transition has begun; `stream_started` or `stream_start_failed` reports its final result.

## 9. Stream generation

Every successful encoder start creates a new positive, monotonically increasing `streamGeneration` within the registered WebSocket connection.

The generation solves three problems:

1. MediaCodec PTS may restart when the encoder is recreated.
2. Codec configuration may change between starts.
3. The server must finalize the old GOP and reset discontinuity/sequence expectations deliberately.

The FPV1 binary header is not changed. WebSocket ordering associates binary frames with the most recent `stream_started` control message.

`stream_started` must be sent before any binary buffer from the new generation:

```json
{
  "type": "stream_started",
  "commandId": "cmd-N7Qp0T18jByH",
  "streamGeneration": 4,
  "startedAtTabletMonotonicNs": "48390219381122",
  "codec": "h264",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "bitrate": 6000000,
  "keyframeInterval": 1,
  "encoder": "c2.mtk.avc.encoder",
  "ptsOriginUs": "0"
}
```

Android monotonic and PTS values are decimal strings in JSON.

After `stream_started`, the camera must send:

1. the current codec configuration (SPS/PPS, `BUFFER_FLAG_CODEC_CONFIG`);
2. a keyframe;
3. dependent encoded buffers.

Do not send dependent frames from a new generation before codec configuration and a keyframe have been queued. Request an immediate sync frame as part of startup even when a one-second keyframe interval is configured.

The FPV1 `sequenceNumber` remains monotonically increasing for the entire WebSocket connection and does not reset on a remote stop/start. It may reset only after a new WebSocket connection and `hello` boundary.

## 10. Start failure

If an accepted start command cannot complete, send:

```json
{
  "type": "stream_start_failed",
  "commandId": "cmd-N7Qp0T18jByH",
  "streamGeneration": 4,
  "streamState": "error",
  "reason": "camera_in_use",
  "message": "The rear camera is unavailable.",
  "retryable": true
}
```

Recommended failure reasons include:

```text
camera_permission_required
camera_in_use
camera_disconnected
capture_session_failed
encoder_configuration_failed
encoder_start_failed
thermal_shutdown
resource_exhausted
internal_error
```

Do not expose stack traces or sensitive device details in protocol messages. Retain detailed diagnostics in bounded local logs.

After a failed start, report either `idle` when retry is safe or `error` when operator/local intervention is required.

## 11. `stream_stopped`

When a requested or local stop completes, send:

```json
{
  "type": "stream_stopped",
  "commandId": "cmd-kb24H2sY7c",
  "streamGeneration": 4,
  "stoppedAtTabletMonotonicNs": "48415220199302",
  "reason": "remote_request",
  "finalSequenceNumber": 88320,
  "streamState": "idle"
}
```

For a local stop, `commandId` is omitted and `reason` might be `local_operator`, `thermal_shutdown`, `camera_error`, or `app_shutdown`.

Stop behavior:

1. reject or suspend new encoded buffers;
2. drain a final encoder buffer/EOS when safe, but do not block indefinitely;
3. release MediaCodec and Camera2 resources;
4. clear bounded outbound video queues belonging to the stopped generation;
5. send `stream_stopped`;
6. remain connected and report `idle`.

The server uses this message to finalize the current GOP/file and mark a deliberate discontinuity rather than packet loss.

## 12. Revised `status`

Send status approximately once per second in every registered state, including idle:

```json
{
  "type": "status",
  "streamId": "ring6_cam2",
  "transportState": "registered",
  "streamState": "streaming",
  "streamGeneration": 4,
  "remoteControlEnabled": true,
  "cameraPermission": "granted",
  "cameraState": "active",
  "encoderState": "running",
  "uptimeMs": 382921,
  "streamUptimeMs": 52931,
  "encodedFrames": 1587,
  "keyframes": 53,
  "bytesSent": 39743291,
  "currentBitrate": 5984000,
  "averageBitrate": 5969000,
  "measuredFps": 29.98,
  "droppedFrames": 0,
  "transportQueueBytes": 0,
  "transportQueueMessages": 0,
  "reconnectCount": 0,
  "network": "ethernet",
  "deviceTemperatureC": 41.2,
  "encoder": "c2.mtk.avc.encoder",
  "lastCommandId": "cmd-N7Qp0T18jByH",
  "lastErrorCode": null
}
```

Idle status example:

```json
{
  "type": "status",
  "streamId": "ring6_cam2",
  "transportState": "registered",
  "streamState": "idle",
  "streamGeneration": 4,
  "remoteControlEnabled": true,
  "cameraPermission": "granted",
  "cameraState": "closed",
  "encoderState": "stopped",
  "transportQueueBytes": 0,
  "transportQueueMessages": 0,
  "lastCommandId": "cmd-kb24H2sY7c",
  "lastErrorCode": null
}
```

Counters should clearly be documented as connection-lifetime or current-generation values. Recommended behavior is:

- `uptimeMs` and `reconnectCount`: application/connection lifetime;
- `streamUptimeMs`, encoded frames, keyframes, stream bytes and dropped frames: current generation;
- optionally provide separately named lifetime totals.

Do not fabricate unavailable measurements.

## 13. Revised keyframe behavior

The existing command remains valid:

```json
{"type":"request_keyframe","reason":"sequence_gap"}
```

If streaming, request a sync frame immediately and report an error only if the request fails.

If idle, do not start the encoder. Safely ignore the request and keep the next status message at `streamState: "idle"`; `lastErrorCode: "not_streaming"` may be reported for diagnostics. The server should normally wait for `stream_started` before requesting a keyframe.

Only `set_streaming` with `desired: true` may remotely start capture.

## 14. Local controls and remote ownership

Local safety controls remain authoritative:

- The user can disable remote control in persisted settings.
- The app must visibly indicate that a remote start was requested.
- Remote start cannot bypass Android runtime permission requirements.
- Remote start must not silently replace another application holding the camera.
- A local stop must send `stream_stopped` and status immediately.
- The UI must distinguish `CONNECTED / IDLE`, `STARTING`, `STREAMING`, `STOPPING`, and `ERROR`.

Recommended setting:

```kotlin
data class RemoteControlSettings(
    val enabled: Boolean = true,
    val allowRemoteStop: Boolean = true
)
```

For reliable idle connectivity, use an Android foreground service where required by the target Android version. Show an appropriate persistent notification while the control connection is active. Do not attempt to evade Android background-execution or privacy rules.

## 15. Camera implementation responsibilities

Introduce a lifecycle abstraction separate from WebSocket parsing:

```kotlin
interface StreamLifecycleController {
    val state: StateFlow<StreamState>
    val generation: StateFlow<Long>

    suspend fun start(request: StartStreamRequest): StartResult
    suspend fun stop(request: StopStreamRequest): StopResult
}
```

Recommended ownership:

```text
WebSocketVideoTransport
   ├── parses and validates command
   ├── sends command_ack/lifecycle messages
   └── delegates desired state
             │
             ▼
StreamLifecycleController
   ├── coordinates CameraController
   ├── coordinates VideoEncoder
   ├── assigns stream generation
   └── reports state/results
```

Do not make the network transport directly own Activity UI objects or Camera2 callbacks. Serialize lifecycle transitions with a mutex or single coroutine actor.

Update the transport abstraction as appropriate:

```kotlin
interface VideoTransport {
    val state: StateFlow<TransportState>
    val stats: StateFlow<TransportStats>

    suspend fun connect(config: TransportConfig)
    fun sendEncodedBuffer(data: ByteBuffer, bufferInfo: MediaCodec.BufferInfo)
    suspend fun disconnect()
}
```

The transport remains connected while `StreamLifecycleController.state == IDLE`.

## 16. Reconnection rules

On connection loss:

- preserve the locally desired stream state;
- reconnect with bounded backoff;
- send a new `hello` containing the actual current `streamState`;
- reset the FPV1 sequence number only at the new WebSocket/hello boundary;
- if the encoder remained running, send `stream_started` for the current/new generation after `hello_ack`, followed by codec configuration and a forced keyframe;
- if the encoder was stopped, remain registered idle;
- never interpret reconnection alone as permission to start an idle encoder.

The server should not automatically replay an old unacknowledged start command after reconnect without confirming current state. A new command ID should be issued only if the operator's desired state is still `streaming` and policy permits retry.

## 17. Backpressure and generation boundaries

All existing bounded-queue requirements continue to apply.

Additionally:

- tag queued messages internally with `streamGeneration`;
- discard stale queued media from earlier generations;
- never append old-generation video after `stream_started` for a new generation;
- clear pending dependent frames when stopping;
- preserve control messages even when video backpressure recovery discards media;
- prioritize `command_ack`, lifecycle, status and heartbeat messages over queued video;
- force a new keyframe after any recovery that discards encoded buffers.

## 18. Server responsibilities

This section is an integration contract for the Android implementation. The Gemini Android Studio task must not modify the server repository.

The ingestion server must:

1. retain the registered WebSocket while the camera is idle;
2. track `connected` separately from `streamState`;
3. expose camera capabilities and state to authorized applications;
4. accept an authenticated HTTP action such as:

   ```http
   POST /api/ivr/v1/cameras/6/2/stream
   Content-Type: application/json

   {"desired":true}
   ```

5. create an opaque command ID and send `set_streaming` only to the matching registered socket;
6. reject disconnected or unsupported cameras explicitly;
7. correlate `command_ack`, `stream_started`, `stream_start_failed`, and `stream_stopped`;
8. impose acknowledgement and transition timeouts;
9. make HTTP commands idempotent;
10. authenticate, authorize, rate-limit, and audit remote-control actions;
11. finalize an existing GOP/file at `stream_stopped` or generation change;
12. reset GOP/PTS mapping deliberately at `stream_started`;
13. require codec configuration and a keyframe before accepting dependent buffers for a new generation;
14. notify IVR clients when state changes.

Suggested HTTP outcomes:

```text
202 command accepted/transitioning
200 already in desired state
400 malformed request
401/403 unauthenticated or unauthorized
404 camera unknown
409 camera disconnected, unsupported, busy, or policy-disabled
429 rate limited
504 camera acknowledgement/transition timeout
```

The server should expose at least:

```json
{
  "connected": true,
  "streamState": "idle",
  "remoteStartSupported": true,
  "remoteControlEnabled": true,
  "lastStatusAt": "2026-09-25T18:02:03Z",
  "lastCommand": {
    "commandId": "cmd-N7Qp0T18jByH",
    "desired": true,
    "state": "starting"
  }
}
```

## 19. IVR behavior

This section describes the downstream consumer contract. The Gemini Android Studio task must expose the required camera states and messages but must not implement the IVR UI.

The IVR must not equate “no recent GOP” with “camera disconnected.”

For a connected idle camera that supports remote start, display an explicit action:

```text
CAMERA CONNECTED — VIDEO STOPPED
[ Start Camera Stream ]
```

After activation:

1. require an authorized operator action;
2. disable duplicate start presses;
3. show `STARTING`;
4. submit the server HTTP command;
5. wait for `stream_started`/streaming status;
6. wait for codec configuration and the first completed GOP;
7. attach that camera to the existing Go Live MSE pipeline;
8. show actionable errors and retry only when safe.

In MCV, starting one idle camera must not restart or interrupt healthy camera players.

Viewing a camera must not automatically start it. Remote activation remains an explicit operator action.

## 20. Timing and timeout recommendations

Centralize these values rather than scattering literals:

```text
status interval                 1 second
heartbeat interval             5 seconds
command acknowledgement        2 seconds
camera/encoder start timeout   10 seconds
stop timeout                    5 seconds
recent command-ID retention    at least 2 minutes
server command rate limit      no more than 1 transition per camera per 2 seconds
```

Timeouts must produce explicit state and errors; they must not leave an indefinite `starting` or `stopping` state.

## 21. Security and audit requirements

The isolated LAN permits `ws://` for the current prototype, but remote camera activation is privileged behavior.

- Do not expose the command endpoint without operator authentication in production.
- Enforce per-ring/camera authorization on the server.
- Protect browser requests against CSRF when cookie authentication is used.
- Do not accept arbitrary socket IDs, filesystem paths, or device addresses from the browser.
- Generate command IDs on the server.
- Log operator identity, camera, desired state, request time, acknowledgement, completion/failure, and reason.
- Keep future `wss://` and camera authentication possible.
- Never put credentials in `reason` or status fields.

## 22. Required tests

### Camera unit tests

Test:

- capability serialization in `hello`;
- `hello_ack` capability negotiation;
- `set_streaming` validation;
- start and stop command acknowledgement;
- duplicate command ID idempotency;
- already-in-desired-state behavior;
- rejection when remote control is disabled;
- serialized conflicting commands;
- stream generation increment on every successful start;
- `stream_started` precedes new-generation binary media;
- codec configuration and keyframe precede dependent frames;
- sequence number does not reset across an encoder restart on the same socket;
- queued old-generation media is discarded;
- start failure produces a bounded error response;
- status continues while idle;
- reconnection while idle does not start the encoder;
- reconnection while locally streaming resumes with configuration/keyframe;
- local stop reports `stream_stopped`.

### Server integration tests

Test:

- connected-idle versus disconnected classification;
- no command sent to cameras lacking the capability;
- command routing to exactly one deterministic stream ID;
- acknowledgement and transition timeouts;
- duplicate HTTP request idempotency;
- start success through first indexed GOP;
- start failure propagation to the IVR;
- generation change finalizes prior GOP/file state;
- PTS reset at generation boundary is not treated as packet loss;
- codec change after restart produces a new initialization segment;
- stop finalizes recording while preserving the control connection;
- simultaneous commands for different cameras;
- conflicting commands for one camera;
- authentication, authorization, CSRF, audit and rate limits.

### Operator acceptance test

1. Launch the camera app with permission granted and remote control enabled.
2. Connect to the server while the encoder is stopped.
3. Confirm the server reports `connected=true`, `streamState=idle`.
4. Open IVR and verify **Start Camera Stream** is shown.
5. Activate it once and confirm `STARTING` appears.
6. Confirm the camera UI visibly reports remote startup.
7. Confirm `stream_started`, codec configuration, and a keyframe arrive in order.
8. Confirm the first completed GOP becomes playable in IVR.
9. Repeat the same command ID and verify the encoder is not restarted.
10. Stop locally and verify the control connection remains registered idle.
11. Deny camera permission and verify a clear non-retryable failure.

## 23. Updated implementation milestones

Implement in this order:

1. Separate transport state from media state.
2. Keep the registered WebSocket alive while idle.
3. Add capability negotiation to `hello` and `hello_ack`.
4. Add strict JSON models for the new messages.
5. Add `StreamLifecycleController` with serialized transitions.
6. Implement `set_streaming(desired=true)` and immediate acknowledgement.
7. Emit `stream_started` with a new generation.
8. Guarantee codec configuration plus keyframe startup ordering.
9. Extend 1 Hz status to idle and transition states.
10. Add start failure reporting and timeouts.
11. Implement optional remote stop and `stream_stopped`.
12. Add command-ID idempotency.
13. Make queues generation-aware.
14. Update the camera UI/settings/status surfaces without breaking local control.
15. Add mock-transport/integration fixtures for the planned server messages.
16. Run Android unit tests, lint, build checks, device tests where available, and the operator acceptance steps that can be completed locally.

Server command routing and the authenticated IVR start endpoint are integration dependencies, not changes to make in the Android repository during this task.

## 24. Final acceptance criteria

The Android implementation is complete when:

- an idle camera remains visibly connected to the server;
- the camera advertises enough capability/state for the IVR to display an explicit start action only when eligible;
- one received operator command produces one correlated camera transition;
- duplicate requests cannot restart the encoder accidentally;
- the camera acknowledges promptly and reports a definitive outcome;
- successful startup always establishes a new stream generation;
- codec configuration and a keyframe make the first GOP independently decodable;
- the camera provides the codec configuration, keyframe, timestamps and lifecycle messages needed for its first completed GOP to join SCV or MCV Go Live playback;
- failure of this camera is reported independently and does not require commands to other cameras;
- stop/start boundaries are not misclassified as sequence loss;
- memory and transport queues remain bounded;
- remote actions are authenticated, authorized, rate-limited and audited;
- local safety controls and Android platform restrictions remain authoritative.

Authentication, authorization, server rate limiting, server audit persistence, and final IVR rendering remain end-to-end acceptance dependencies. The Android implementation must preserve command IDs and emit sufficient correlated state for those server controls.
