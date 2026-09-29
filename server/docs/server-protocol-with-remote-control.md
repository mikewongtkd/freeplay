# Codex Visual Studio Implementation Prompt — FreePlay Ingestion Server Remote Stream Control

**Revision:** 1.0  
**Status:** Ingestion-server implementation prompt and server-side integration contract  
**Baseline:** FreePlay Camera WebSocket Ingestion Protocol version 1 (FPV1)  
**Purpose:** Update the FreePlay ingestion server so an IVR client connected to the ingestion server on **port 9000** can explicitly start or stop a specific connected Android camera stream. The ingestion server is the control-plane intermediary: it accepts the IVR request, validates and records it, routes a correlated `set_streaming` command to the correct camera WebSocket, tracks the camera response through completion, and publishes the resulting state back to IVR clients.

---

## Instructions to Codex

You are working in Visual Studio inside the existing **FreePlay ingestion server** repository. Implement the server side of the remote stream-control protocol defined in this document. Make actual production-quality code, tests, and documentation changes; do not merely describe a solution.

Before editing, inspect the repository completely enough to understand its real architecture. In particular, identify:

- the Node.js entry point and the HTTP/WebSocket server that listens on port 9000;
- the existing FPV1 camera WebSocket registration and `hello` / `hello_ack` handling;
- stream/session registries and deterministic `streamId` handling;
- binary FPV1 parsing and validation;
- GOP assembly, fMP4/file finalization, PTS mapping, and initialization-segment handling;
- camera status, heartbeat, timeout, reconnect, and backpressure logic;
- SQLite schema/repositories and any persistent event/audit model;
- existing HTTP/REST routes;
- existing WebSocket routes or message handling for browser/IVR clients;
- logging and configuration;
- authentication/authorization infrastructure, if already present;
- all unit, integration, and end-to-end tests;
- server protocol documentation.

Adapt to the architecture that actually exists. Do not create a parallel server, second process, or unrelated framework when the existing port-9000 HTTP/WebSocket service can be extended cleanly.

If repository names differ from names proposed below, use the established project naming and document the mapping in your final report.

### Scope

Implement the **ingestion server** changes only.

Do **not** modify:

- the Android FreePlay Camera repository;
- the PHP/Bootstrap/jQuery IVR application repository;
- the 32-byte FPV1 binary video header;
- the H.264 encoding profile;
- unrelated scoring, PSSEL, or tournament systems.

The Android camera protocol in this document is the contract the server must support. The IVR API/events in this document are the contract the server must expose for later IVR integration.

### Working requirements

- Preserve all existing FPV1 ingest, timestamp, GOP, fMP4, storage, replay, reconnect, and backpressure behavior.
- Keep the existing camera protocol name `freeplay-ingest`, version `1`.
- Remote stream control is negotiated by capabilities; do not increment FPV1 merely for this feature.
- Keep camera connection state separate from camera media-stream state.
- A connected camera may legitimately be idle and sending no binary H.264.
- Never infer “camera disconnected” merely because no recent GOP exists.
- Route commands by the deterministic logical identity `ring{ringNumber}_cam{cameraNumber}`, never by a browser-supplied socket identifier.
- Serialize lifecycle commands **per camera**, while allowing independent cameras to transition concurrently.
- Generate command IDs on the server.
- Treat `reason` as log/audit context only, never as executable or authorization input.
- Keep control messages responsive even when video queues or disk I/O are busy.
- Do not let remote-control work block the Node event loop.
- Preserve unrelated user changes in the working tree.
- Do not add cloud services, WebRTC, RTP, message brokers, or unrelated dependencies.
- If authentication already exists, integrate with it rather than inventing a second authentication system.
- For a prototype configuration in which authentication is not yet enabled, keep the authorization boundary explicit in code/configuration and do not falsely describe the endpoint as production-secure.

---

# 1. Required end-to-end behavior

The intended control path is:

```text
IVR browser/client
      │
      │  port 9000
      │  start/stop request
      ▼
FreePlay ingestion server
      │
      │  identify ring/camera
      │  validate connected state + capability
      │  create commandId
      │
      │  existing camera WebSocket on port 9000
      ▼
Android FreePlay Camera
      │
      ├── command_ack
      ├── stream_started OR stream_start_failed
      └── stream_stopped
      │
      ▼
FreePlay ingestion server
      │
      ├── update authoritative camera state
      ├── handle generation/GOP boundary
      ├── persist/audit command result
      └── publish state/result to IVR clients
```

The IVR talks to the ingestion server. It must **never** connect directly to an Android camera to control streaming.

The ingestion server remains authoritative for:

- camera registration;
- camera connection state;
- reported media state;
- camera capabilities;
- active command state;
- stream generation;
- timeout determination;
- media-generation boundaries;
- IVR-visible camera state.

---

# 2. Port 9000 requirement

The IVR review system must communicate with the ingestion server on **port 9000**.

Use the existing port-9000 HTTP/WebSocket listener. It is acceptable and preferred for the same Node server to support:

1. Android camera WebSocket ingestion/control connections;
2. IVR HTTP control requests;
3. IVR WebSocket state/event subscriptions;

provided the existing architecture supports this cleanly.

Do not create a second externally required control port merely for remote camera start/stop.

If the current server distinguishes WebSocket peers by path, preserve or introduce explicit paths, for example:

```text
ws://SERVER:9000/ingest       Android camera WebSocket
ws://SERVER:9000/ivr          IVR event/control WebSocket
http://SERVER:9000/api/...    IVR HTTP API
```

These paths are illustrative. If the existing server already has routing conventions, use them instead.

If camera connections currently use the root WebSocket path, preserve backward compatibility unless a migration is explicitly required.

---

# 3. Compatibility and capability negotiation

The camera protocol remains:

```json
{
  "protocol": "freeplay-ingest",
  "version": 1
}
```

Remote stream control is enabled only when **both** peers advertise:

```json
{
  "remoteStreamingControl": true
}
```

The server `hello_ack` must advertise server support:

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

Epoch-microsecond values in JSON are decimal strings.

An older camera that does not advertise `remoteStreamingControl`:

- remains a valid FPV1 camera if otherwise compatible;
- may continue locally initiated streaming;
- must be reported to IVR as not supporting remote start/stop;
- must never receive `set_streaming`.

The server must retain the camera-advertised capability set from `hello`.

Relevant camera `hello` fields include:

```json
{
  "type": "hello",
  "protocol": "freeplay-ingest",
  "version": 1,
  "streamId": "ring6_cam2",
  "ring": 6,
  "camera": 2,
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

Omitted capabilities are unsupported.

---

# 4. Separate connection state from stream state

Do not use one boolean such as `active` to represent both network connectivity and video production.

At minimum, maintain independently:

```text
connectionState:
  disconnected
  connecting/registered as appropriate to existing server model

streamState:
  idle
  starting
  streaming
  stopping
  error
```

A registered camera with:

```text
connected = true
streamState = idle
```

is healthy and remotely controllable if the negotiated capabilities and policy permit it.

The server should maintain an authoritative in-memory camera registry containing at least:

```text
streamId
ring
camera
socket/session reference
connected
connectedAt
lastSeenAt
lastStatusAt
streamState
streamGeneration
capabilities
remoteControlEnabled (as reported by camera)
lastCommand
lastError
media readiness / first-GOP readiness as available
```

Do not expose raw socket references or internal connection IDs to the IVR.

---

# 5. IVR camera-state API

Expose an IVR-readable camera state through the existing port-9000 API architecture.

A camera-state representation should provide at least:

```json
{
  "streamId": "ring6_cam2",
  "ring": 6,
  "camera": 2,
  "connected": true,
  "streamState": "idle",
  "streamGeneration": 4,
  "remoteStartSupported": true,
  "remoteStopSupported": true,
  "remoteControlEnabled": true,
  "lastStatusAt": "2026-09-25T18:02:03Z",
  "mediaReady": false,
  "lastCommand": {
    "commandId": "cmd-N7Qp0T18jByH",
    "desired": true,
    "state": "starting"
  }
}
```

Use the project's established JSON naming and route conventions if they differ.

Provide a way for the IVR to retrieve:

- one camera by ring/camera or stream ID;
- all cameras for a ring;
- preferably all registered cameras visible to that IVR session.

The API must distinguish:

- unknown camera;
- known but disconnected camera;
- connected idle camera;
- starting camera;
- streaming camera;
- stopping camera;
- error camera;
- legacy/unsupported camera.

---

# 6. IVR start/stop command API

Implement a control action on port 9000 equivalent to:

```http
POST /api/ivr/v1/cameras/6/2/stream
Content-Type: application/json

{"desired":true}
```

and:

```http
POST /api/ivr/v1/cameras/6/2/stream
Content-Type: application/json

{"desired":false}
```

The exact route may be adapted to existing project conventions, but preserve the semantic contract.

The browser supplies the logical camera target through validated route parameters. It must not supply an internal socket ID.

Optional request fields may include an IVR-generated idempotency key if the existing API has a standard mechanism:

```json
{
  "desired": true,
  "requestId": "ivr-optional-idempotency-key"
}
```

If no existing idempotency convention exists, implement one explicitly. A retry of the same IVR request must not accidentally produce multiple encoder restarts.

The server itself always generates the camera-protocol `commandId`.

Suggested HTTP outcomes:

```text
202  command accepted and camera transition is in progress
200  camera is already in the requested stable state
400  malformed request
401  unauthenticated
403  unauthorized for this camera/ring
404  camera is unknown
409  camera disconnected, unsupported, busy, or policy-disabled
429  rate limited
504  camera acknowledgement or lifecycle transition timed out
```

Return structured JSON, not only text.

Example accepted response:

```json
{
  "accepted": true,
  "commandId": "cmd-N7Qp0T18jByH",
  "streamId": "ring6_cam2",
  "desired": true,
  "streamState": "starting"
}
```

Example already-in-state response:

```json
{
  "accepted": true,
  "alreadyInDesiredState": true,
  "streamId": "ring6_cam2",
  "desired": true,
  "streamState": "streaming"
}
```

Example unsupported response:

```json
{
  "accepted": false,
  "streamId": "ring6_cam2",
  "error": "remote_stream_control_unsupported"
}
```

---

# 7. Server-to-camera `set_streaming`

For an eligible camera, generate a cryptographically strong or otherwise collision-resistant opaque command ID and send exactly one JSON control frame to the matching registered camera WebSocket:

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
|---|---|---:|---|
| `type` | string | yes | Always `set_streaming`. |
| `commandId` | string | yes | Server-generated opaque identifier, 1–128 safe ASCII characters. |
| `desired` | boolean | yes | `true` starts; `false` stops. |
| `reason` | string | no | Audit/workflow context only. |
| `requestedAtEpochUs` | decimal string | yes | Server wall-clock request time. |

Before sending, verify:

1. the target camera is registered;
2. its WebSocket is currently usable;
3. it advertised `remoteStreamingControl`;
4. for stop, it advertised `remoteStop` if that capability is separately enforced;
5. its latest reported policy permits remote control;
6. no incompatible lifecycle command is already active;
7. the request passes authorization/rate-limit policy.

Do not broadcast the command. Route it to exactly one logical camera.

---

# 8. Per-camera command coordinator

Implement or extend a dedicated server-side command coordinator.

Conceptually:

```text
IVR route / control handler
          │
          ▼
CameraStreamCommandService
  ├── validate target and policy
  ├── apply IVR request idempotency
  ├── serialize per-camera transitions
  ├── generate commandId
  ├── send set_streaming
  ├── await/correlate command_ack
  ├── track lifecycle completion
  ├── enforce timeouts
  ├── update camera registry
  ├── audit outcome
  └── publish IVR events
          │
          ▼
Camera session / WebSocket
```

Do not bury HTTP request/response objects inside the camera WebSocket parser.

Only one unresolved lifecycle transition may own a camera at a time unless the existing architecture can prove safe serialization.

Commands for different cameras must proceed independently.

Centralize timing constants. Initial defaults:

```text
camera command acknowledgement timeout    2 seconds
camera start completion timeout          10 seconds
camera stop completion timeout            5 seconds
command result retention                  at least 2 minutes
rate limit                                no more than 1 transition/camera/2 sec
status freshness threshold                configurable
```

Do not leave a camera indefinitely in `starting` or `stopping`.

---

# 9. Camera `command_ack` handling

The camera acknowledges semantic acceptance before slow startup/stop completes.

Accepted example:

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

The server must:

- strictly validate the message;
- correlate by `commandId`;
- verify that the acknowledgement belongs to the same registered camera to which the command was issued;
- reject/log impossible cross-camera command IDs;
- update command state;
- publish the acknowledgement/state change to interested IVR clients;
- distinguish acknowledgement from lifecycle completion.

An accepted `command_ack` does **not** mean video is ready.

If no valid acknowledgement arrives within the configured acknowledgement timeout, mark the command timed out and report that state to the IVR. Do not silently assume success.

---

# 10. `stream_started` and generation handling

Successful start is reported by:

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

On a valid `stream_started`:

1. correlate it to the camera and command;
2. validate `streamGeneration`;
3. transition server camera state to `streaming` at the lifecycle level;
4. deliberately finalize any prior generation/GOP/file state;
5. establish a new generation boundary;
6. reset generation-specific PTS/GOP mapping without treating a PTS restart as packet loss;
7. expect codec configuration for the new generation;
8. reject/discard dependent frames until the generation has a valid codec configuration and first keyframe;
9. create a new initialization segment if codec configuration changes;
10. continue FPV1 `sequenceNumber` semantics for the current WebSocket connection;
11. publish the state change to IVR clients.

The FPV1 binary header remains unchanged.

The camera guarantees this logical order:

```text
stream_started
codec configuration (SPS/PPS; BUFFER_FLAG_CODEC_CONFIG)
first keyframe
dependent encoded buffers
```

The server must enforce the corresponding acceptance rule even if a buggy or reordered peer violates it.

`streamState = streaming` and `mediaReady = true` are deliberately different concepts.

A camera may be:

```text
connected = true
streamState = streaming
mediaReady = false
```

for the short interval after `stream_started` but before an independently decodable GOP is available.

Only report `mediaReady = true` after the server has the codec initialization information and first completed playable GOP required by the existing replay pipeline.

---

# 11. Start failure

The camera may report:

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

The server must:

- correlate the failure;
- update camera and command state;
- preserve the registered camera connection if it remains healthy;
- not create a playable media generation from the failed start;
- expose `reason`, bounded safe `message`, and `retryable` to IVR;
- log richer server-side diagnostic context without exposing stack traces;
- publish a failure event to IVR clients;
- release the per-camera command lock.

A failed camera must not affect healthy cameras.

---

# 12. Stop and `stream_stopped`

Remote stop uses:

```json
{
  "type": "set_streaming",
  "commandId": "cmd-kb24H2sY7c",
  "desired": false,
  "reason": "ivr_operator",
  "requestedAtEpochUs": "1790365200000000"
}
```

Completion is reported by:

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

For a local stop, `commandId` may be omitted.

On `stream_stopped`, the server must:

1. validate camera identity and generation;
2. correlate the command when `commandId` is present;
3. stop accepting media for the stopped generation;
4. finalize the current GOP/file cleanly;
5. mark a deliberate discontinuity rather than packet loss;
6. transition the camera to connected/idle if its socket remains registered;
7. set `mediaReady = false` for live media;
8. preserve already-recorded historical media according to existing retention/index rules;
9. release the command coordinator;
10. publish the new state to IVR clients.

**Stopping media must not close the camera control WebSocket.**

---

# 13. Camera status handling

Updated cameras send status approximately once per second even while idle.

Streaming example fields include:

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
  "transportQueueBytes": 0,
  "transportQueueMessages": 0,
  "lastCommandId": "cmd-N7Qp0T18jByH",
  "lastErrorCode": null
}
```

Idle example:

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

Use status to refresh the registry, but do not let an unrelated stale status message incorrectly complete a command that requires a correlated lifecycle message.

Do not fabricate metrics that the camera did not send.

---

# 14. Keyframe behavior

Existing camera command remains:

```json
{"type":"request_keyframe","reason":"sequence_gap"}
```

If the camera is idle, `request_keyframe` must not be used as a substitute for `set_streaming`.

The server should normally wait for `stream_started` before requesting a keyframe.

Only:

```json
{"type":"set_streaming","desired":true,...}
```

may remotely request an idle camera to start capture.

---

# 15. Reconnection behavior

On camera WebSocket loss:

- mark the camera disconnected promptly;
- retain bounded historical command/audit state;
- do not pretend the camera is idle;
- fail or suspend an active command according to explicit policy;
- notify IVR clients;
- finalize/mark the active media generation according to existing disconnect behavior.

When the camera reconnects:

- accept a new `hello`;
- update actual `streamState` from the camera;
- reset FPV1 sequence expectations at the new WebSocket/hello boundary;
- renegotiate capabilities;
- do not automatically replay an old unacknowledged start command merely because the camera reconnected;
- if operator policy still requires streaming, issue a **new** command with a **new** camera `commandId`;
- if the camera reconnects already streaming, accept its post-`hello_ack` `stream_started`, codec configuration, and forced keyframe as the new connection boundary.

Reconnection by itself is never permission to start an idle encoder.

---

# 16. IVR event subscription

The IVR needs prompt state changes without polling once per second.

Extend the existing IVR/browser WebSocket mechanism on port 9000, or add one if the server architecture does not yet have it.

Publish normalized server-originated events such as:

```json
{
  "type": "camera_state_changed",
  "streamId": "ring6_cam2",
  "ring": 6,
  "camera": 2,
  "connected": true,
  "streamState": "starting",
  "streamGeneration": 3,
  "mediaReady": false,
  "remoteStartSupported": true,
  "remoteStopSupported": true,
  "remoteControlEnabled": true,
  "commandId": "cmd-N7Qp0T18jByH",
  "serverTimeEpochUs": "1790365142400000"
}
```

On first playable GOP:

```json
{
  "type": "camera_media_ready",
  "streamId": "ring6_cam2",
  "streamGeneration": 4,
  "mediaReady": true,
  "serverTimeEpochUs": "1790365143900000"
}
```

On failure:

```json
{
  "type": "camera_stream_command_failed",
  "streamId": "ring6_cam2",
  "commandId": "cmd-N7Qp0T18jByH",
  "desired": true,
  "reason": "camera_in_use",
  "retryable": true
}
```

These are recommended normalized IVR events; adapt names to existing server event conventions.

Never forward arbitrary unvalidated camera JSON directly to browsers.

The IVR should be able to:

- display **CAMERA CONNECTED — VIDEO STOPPED**;
- explicitly request **Start Camera Stream**;
- display `STARTING`;
- wait for `mediaReady`;
- attach that camera to the existing live MSE pipeline;
- explicitly request stop when permitted;
- show actionable failure states.

Starting/stopping one camera must not restart or interrupt any other camera or IVR player.

---

# 17. Idempotency

There are two idempotency boundaries.

## 17.1 IVR-to-server idempotency

A browser retry caused by network uncertainty must not create multiple lifecycle transitions.

Use the project's existing idempotency mechanism if present. Otherwise support a bounded client `requestId` or idempotency header and retain the result for a reasonable period.

The same IVR idempotency key + same target + same desired state must return the same server command/result.

Reuse of the same key with conflicting semantics must be rejected.

## 17.2 Server-to-camera idempotency

Every camera command gets a unique server-generated `commandId`.

Retain recent command records for at least two minutes so duplicate camera acknowledgements/results can be recognized safely.

If the camera reports `alreadyInDesiredState: true`, treat that as successful idempotent completion without forcing a pipeline restart.

Do not generate multiple simultaneous `set_streaming(desired=true)` commands for repeated Start button presses.

---

# 18. Concurrency rules

Per camera:

```text
stable idle
   └── start command ──> starting ──> streaming

stable streaming
   └── stop command ───> stopping ──> idle
```

While a camera is `starting` or `stopping`, a conflicting command should normally produce `409 busy` unless the existing server implements a safe serialized command queue.

Do not allow a late acknowledgement/result from an older command to overwrite the state of a newer command.

Use command ID + stream ID + generation where applicable to guard state transitions.

Across cameras, commands are independent. Starting `ring2_cam1` must not block starting `ring8_cam3`.

---

# 19. Media-generation and FPV1 invariants

Preserve all existing FPV1 binary behavior:

- one MediaCodec output buffer per WebSocket binary message;
- 32-byte FPV1 header unchanged;
- big-endian fields unchanged;
- sequence number semantics unchanged;
- H.264 payload unchanged;
- bounded backpressure unchanged.

Every successful encoder start creates a new positive monotonically increasing `streamGeneration` within the registered camera connection.

The server must treat generation change as a deliberate media discontinuity.

At a new generation:

```text
finalize old GOP/file
        ↓
record generation boundary
        ↓
accept stream_started
        ↓
require codec config
        ↓
require keyframe
        ↓
build first independently decodable GOP
        ↓
mediaReady = true
```

Never append old-generation queued video to the new generation.

A MediaCodec PTS reset after encoder recreation is expected and must not be classified as packet loss.

A codec configuration change must produce whatever new fMP4 initialization metadata/segment the existing replay architecture requires.

---

# 20. Security and audit

Remote camera activation is privileged behavior.

For production:

- authenticate IVR operators;
- authorize by event/ring/camera as appropriate;
- protect cookie-authenticated state-changing HTTP requests against CSRF;
- rate-limit camera transition requests;
- validate all ring/camera route parameters;
- generate camera `commandId` values on the server;
- never accept a browser-provided socket identifier, filesystem path, device address, or raw camera control frame;
- do not put credentials in `reason`, status, or audit fields;
- preserve a future migration to HTTPS/WSS and camera authentication.

Audit at least:

```text
server request time
operator/session identity when available
IVR request/idempotency ID
ring
camera
streamId
desired state
camera commandId
pre-command state
command acknowledgement
completion/failure
failure reason
streamGeneration
completion time
timeout state
```

If the current prototype has no authentication system, make that limitation explicit in documentation and keep the control API separable from production authorization policy.

---

# 21. Suggested internal data model

Adapt to the repository rather than mechanically adding these exact classes.

Conceptually:

```text
CameraRegistry
  CameraSession
    streamId
    ring
    camera
    websocket
    capabilities
    connectionState
    streamState
    streamGeneration
    remoteControlEnabled
    lastStatusAt
    mediaReady
    activeCommandId

CameraStreamCommandService
  issueCommand(camera, desired, context)
  handleCommandAck(camera, message)
  handleStreamStarted(camera, message)
  handleStreamStartFailed(camera, message)
  handleStreamStopped(camera, message)
  handleDisconnect(camera)
  expireTimeouts()

CameraCommandRecord
  commandId
  ivrRequestId
  streamId
  desired
  state
  requestedAt
  acknowledgedAt
  completedAt
  failureReason
  retryable
```

Possible command states:

```text
created
sent
acknowledged
starting
stopping
completed
rejected
failed
ack_timeout
transition_timeout
cancelled_by_disconnect
```

Keep authoritative hot state in memory where appropriate. Persist audit/history according to the project's existing SQLite ownership model. Do not write per-frame data to SQLite.

---

# 22. Error model

Use stable machine-readable error codes.

At minimum account for:

```text
camera_unknown
camera_disconnected
remote_stream_control_unsupported
remote_stop_unsupported
remote_control_disabled
camera_busy
invalid_request
unauthorized
rate_limited
camera_ack_timeout
camera_transition_timeout
camera_permission_required
camera_unavailable
encoder_unavailable
thermal_shutdown
camera_in_use
camera_disconnected_during_start
capture_session_failed
encoder_configuration_failed
encoder_start_failed
resource_exhausted
internal_error
```

Preserve the camera's safe reason code when appropriate, but map it through a controlled server error model before exposing it to IVR.

Do not expose stack traces or sensitive server/device internals.

---

# 23. Required server tests

Add or update automated tests for at least the following.

## Protocol and registration

- camera `hello` capability parsing;
- server `hello_ack` capability advertisement;
- older camera without `remoteStreamingControl`;
- connected-idle camera remains registered without binary video;
- idle status does not trigger false disconnect;
- disconnected versus connected-idle classification.

## Command routing

- start request routes to exactly one deterministic stream ID;
- stop request routes to exactly one deterministic stream ID;
- no command is sent to an unsupported camera;
- no stop command is sent when remote stop is unsupported;
- disconnected camera is rejected explicitly;
- unknown camera is rejected explicitly;
- remote-control-disabled camera is rejected;
- browser cannot select a raw socket ID.

## Correlation and idempotency

- generated command IDs are unique/opaque;
- `command_ack` correlates only to the issuing camera;
- duplicate IVR request does not send duplicate camera commands;
- duplicate camera `command_ack` is harmless;
- duplicate lifecycle completion is harmless;
- `alreadyInDesiredState` returns success without restart;
- stale result from an older command cannot overwrite a newer command;
- simultaneous commands to different cameras work independently;
- conflicting commands to one camera are serialized/rejected safely.

## Start lifecycle

- accepted start returns `202`;
- `command_ack(starting)` updates state;
- start acknowledgement timeout is surfaced;
- `stream_started` creates a new generation boundary;
- prior GOP/file is finalized at generation change;
- PTS reset at generation boundary is not treated as packet loss;
- codec configuration is required before dependent media;
- keyframe is required before dependent media;
- first completed playable GOP sets `mediaReady=true`;
- codec change creates a new initialization segment;
- `stream_start_failed` propagates a controlled error to IVR;
- transition timeout cannot leave indefinite `starting`.

## Stop lifecycle

- accepted stop returns `202`;
- `command_ack(stopping)` updates state;
- `stream_stopped` finalizes the active GOP/file;
- stopped generation rejects later stale media;
- control WebSocket remains registered;
- state becomes connected/idle;
- historical media remains indexed;
- transition timeout cannot leave indefinite `stopping`.

## Reconnection

- disconnect during active command produces explicit command state;
- reconnect idle does not trigger automatic start;
- reconnect streaming establishes a clean connection/generation boundary;
- old unacknowledged command is not blindly replayed;
- capabilities are renegotiated.

## IVR event/API behavior

- camera state API reports connected idle correctly;
- state changes are pushed to subscribed IVR clients;
- `mediaReady` is separate from `streaming`;
- one camera transition does not affect another camera;
- malformed browser requests receive structured errors;
- authentication/authorization/CSRF tests where infrastructure exists;
- rate-limit tests;
- audit record tests.

---

# 24. Integration test harness

Extend the existing mock-camera/test framework if available.

The integration fixture should be able to emulate:

```text
hello idle
status idle
receive set_streaming(true)
command_ack starting
stream_started generation N
codec config binary buffer
keyframe binary buffer
dependent binary buffers
status streaming
receive set_streaming(false)
command_ack stopping
stream_stopped
status idle
```

Also emulate:

```text
start rejected
start accepted then failed
ack timeout
start transition timeout
stop timeout
camera disconnect during start
duplicate command messages/results
stale generation media
legacy camera without capability
camera with remote start but no remote stop
```

Test the real port-9000 route/WebSocket stack where practical rather than testing only isolated helper functions.

---

# 25. Operator acceptance test

After automated tests pass, document or execute as much of this workflow as the available environment permits:

1. Start the ingestion server on port 9000.
2. Connect an updated FreePlay Camera with its encoder stopped.
3. Confirm the server reports:
   ```text
   connected = true
   streamState = idle
   remoteStartSupported = true
   ```
4. Connect an IVR test client to the ingestion server on port 9000.
5. Request Start for one camera.
6. Confirm the server sends one `set_streaming(desired=true)` to exactly that camera.
7. Confirm IVR sees `STARTING`.
8. Confirm server receives `command_ack`.
9. Confirm server receives `stream_started`.
10. Confirm codec configuration and a keyframe arrive before dependent media is admitted.
11. Confirm the first completed GOP becomes playable and IVR receives `mediaReady=true`.
12. Confirm other cameras continue uninterrupted.
13. Request Stop from IVR.
14. Confirm one `set_streaming(desired=false)` is sent.
15. Confirm `stream_stopped` finalizes media and the camera remains connected idle.
16. Repeat an identical IVR request/idempotency key and verify no accidental encoder restart.
17. Test a disconnected camera and verify an explicit controlled error.
18. Test a legacy camera and verify no remote command is sent.
19. Test a camera with remote control locally disabled.
20. Test simultaneous commands for two different cameras.

---

# 26. Required implementation milestones

Implement in this order unless the existing architecture strongly suggests a safer equivalent:

1. Inspect and document the existing port-9000 HTTP/WebSocket architecture.
2. Separate server camera connection state from media-stream state if not already separate.
3. Extend camera registration to retain remote-control capabilities.
4. Advertise server remote-control capability in `hello_ack`.
5. Keep connected-idle cameras registered and healthy.
6. Add/extend the authoritative camera registry.
7. Add strict parsers for `command_ack`, `stream_started`, `stream_start_failed`, and `stream_stopped`.
8. Add the per-camera command coordinator.
9. Add IVR camera-state query API on port 9000.
10. Add IVR start/stop command API on port 9000.
11. Implement server-generated `set_streaming`.
12. Implement command correlation, idempotency, and timeouts.
13. Integrate generation boundaries with GOP/fMP4/index handling.
14. Add `mediaReady` behavior after the first playable GOP.
15. Publish normalized camera state/result events to IVR clients on port 9000.
16. Add audit/rate-limit/auth integration appropriate to the existing project.
17. Add unit tests.
18. Add real-socket integration tests.
19. Run lint/type checks/tests/build/startup checks available in the repository.
20. Update protocol/API documentation.

Do not stop after proposing a plan. Continue through implementation and reasonable verification unless genuinely blocked by missing project inputs or required external devices.

---

# 27. Required verification

Run the repository's existing verification tasks plus the new tests.

At minimum, attempt the project-appropriate equivalents of:

```text
dependency install / lockfile-consistent install
lint
typecheck (if TypeScript or typed JS tooling exists)
unit tests
integration tests
build (if applicable)
server startup smoke test
port-9000 HTTP API smoke test
port-9000 camera WebSocket smoke test
port-9000 IVR WebSocket/event smoke test
```

Fix failures caused by your changes.

Do not report an unavailable device-dependent or environment-dependent test as passing. State exactly what could not be run and why.

---

# 28. Final response expected from Codex

When implementation is complete, report:

- behavioral outcome;
- files created and materially changed;
- actual port-9000 HTTP/WebSocket routing used;
- final camera registry/state model;
- final IVR start/stop API;
- IVR event/subscription contract;
- server-to-camera `set_streaming` implementation;
- capability negotiation behavior;
- command ID generation and IVR/server idempotency behavior;
- per-camera concurrency/serialization strategy;
- acknowledgement and transition timeout behavior;
- stream-generation/GOP/fMP4 handling;
- how `streaming` versus `mediaReady` is represented;
- authentication/authorization/rate-limit/audit behavior actually implemented;
- tests and verification commands run, with results;
- any remaining Android-device or IVR-UI integration work.

Do not claim production security if authentication/TLS remains intentionally deferred.

---

# 29. Final acceptance criteria

The ingestion-server implementation is complete when:

- an updated camera may remain connected on port 9000 while its encoder is stopped;
- the server distinguishes connected-idle from disconnected;
- the server negotiates remote-stream-control capability without changing FPV1 version 1;
- the IVR can connect to the ingestion server on port 9000 and discover camera state;
- an authorized/allowed IVR action can request start or stop of one logical camera;
- the server generates a correlated command ID and relays `set_streaming` to exactly that camera;
- duplicate IVR requests cannot accidentally restart or restop the camera;
- camera lifecycle commands are serialized per camera but independent across cameras;
- `command_ack` is distinguished from lifecycle completion;
- `stream_started`, `stream_start_failed`, and `stream_stopped` are correlated correctly;
- acknowledgement and transition timeouts are explicit and bounded;
- a new stream generation deliberately finalizes the prior media generation;
- PTS reset at an encoder restart is not treated as packet loss;
- codec configuration and a keyframe are required before dependent media is accepted for the new generation;
- the first playable GOP changes `mediaReady` to true;
- stop finalizes recording without disconnecting the camera control socket;
- IVR clients receive normalized state/result updates;
- starting or stopping one camera does not disturb other cameras;
- the existing FPV1 32-byte binary header and normal ingest path remain backward compatible;
- security/audit hooks are integrated with existing server facilities and any prototype limitations are documented;
- automated tests cover normal, failure, timeout, duplicate, reconnect, and concurrency paths.
