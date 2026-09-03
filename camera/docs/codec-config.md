# Reliable H.264 Codec-Config Delivery

You are working in the existing **FreePlay Camera** Android Studio project. Implement the camera-side changes needed to guarantee that the FreePlay ingestion server receives valid H.264 decoder configuration after every accepted WebSocket connection.

Read and follow the existing project specifications before editing:

- `PROTOCOL.md`
- The server protocol specification, if available: `../server/docs/server-protocol.md`
- The server validation plan, if available: `../server/docs/camera-server-protocol-test-plan.md`

Treat those documents as specifications. Preserve the existing architecture and do not redesign unrelated camera, encoder, UI, or transport components.

## Current Relevant Code

Inspect these files before making changes:

- `app/src/main/java/net/opentkd/freeplay/encoder/VideoEncoder.kt`
- `app/src/main/java/net/opentkd/freeplay/network/VideoTransport.kt`
- `app/src/main/java/net/opentkd/freeplay/network/WebSocketVideoTransport.kt`
- `app/src/main/java/net/opentkd/freeplay/network/protocol/FreePlayBinaryHeader.kt`
- `app/src/main/java/net/opentkd/freeplay/network/protocol/FreePlayControlMessage.kt`
- `app/src/main/java/net/opentkd/freeplay/network/protocol/FreePlayProtocol.kt`
- `app/src/main/java/net/opentkd/freeplay/network/TransportStats.kt`
- `app/src/main/java/net/opentkd/freeplay/MainActivity.kt`

The existing transport currently discards encoded buffers unless its state is `STREAMING`. MediaCodec commonly emits codec configuration before the server returns `hello_ack`, so the SPS/PPS buffer can be lost. The server then receives keyframes but cannot initialize its fragmented MP4 recorder.

## Required Outcome

For every new or re-established server session, produce this ordering:

```text
WebSocket open
hello
hello_ack accepted
FPV1 binary codec-config message containing SPS and PPS
request/send a fresh keyframe
FPV1 binary keyframe message
normal encoded video messages
```

The implementation must ensure that the server observes:

```text
codecConfigBuffers >= 1
codecConfigVersion >= 1
codecConfigReady = true
recordingStarted = true
```

Do not fake these values or alter the test. Deliver real SPS/PPS bytes that can initialize H.264 decoding and fMP4 recording.

## Functional Requirements

### 1. Capture codec configuration

Capture and retain the latest valid H.264 SPS and PPS from both possible MediaCodec paths:

1. `MediaCodec.Callback.onOutputFormatChanged()`:
   - Read `csd-0` and `csd-1` from the supplied `MediaFormat` when present.
   - Copy their remaining bytes immediately; do not retain MediaCodec-owned `ByteBuffer` references.

2. `onOutputBufferAvailable()` when `BufferInfo.flags` contains `MediaCodec.BUFFER_FLAG_CODEC_CONFIG`:
   - Copy and cache the configuration even when the WebSocket handshake is not complete.
   - Do not discard it merely because transport state is not yet `STREAMING`.

Support devices that provide:

- SPS and PPS in separate `csd-0`/`csd-1` buffers;
- SPS and PPS together in one codec-config output buffer;
- Annex-B start codes using either `00 00 01` or `00 00 00 01`;
- length-prefixed AVC data where practical.

Keep configuration parsing and normalization in a small dedicated helper with unit tests. Do not duplicate FPV1 header serialization.

### 2. Normalize the transmitted payload

Transmit codec configuration as one FPV1 binary WebSocket message whose payload is:

```text
00 00 00 01 <SPS bytes without an existing start code>
00 00 00 01 <PPS bytes without an existing start code>
```

The FPV1 header must remain exactly 32 bytes and big-endian. Set:

```text
flags = MediaCodec.BUFFER_FLAG_CODEC_CONFIG
payloadLength = exact combined Annex-B payload size
presentationTimeUs = a valid encoder PTS when available, otherwise a documented safe value
tabletMonotonicTimestampNs = SystemClock.elapsedRealtimeNanos()
```

Use the same monotonically incrementing per-session sequence-number allocation as ordinary video messages. Do not reuse a sequence number or bypass the normal sequence allocator.

### 3. Resend after every accepted handshake

After receiving:

```json
{
  "type": "hello_ack",
  "accepted": true
}
```

the transport must:

1. reset sequence state for the new session;
2. enqueue/send the latest cached codec configuration first;
3. only then allow ordinary encoded video into the session;
4. request a fresh encoder keyframe;
5. transition to fully healthy streaming only when the required startup actions have been initiated successfully.

Repeat this on every reconnect, even when the encoder itself was not restarted and therefore did not emit a new configuration buffer.

If SPS/PPS is not yet available when `hello_ack` arrives:

- do not send ordinary video as though the stream were replay-ready;
- retain or gate frames with a strict bounded policy;
- request or await encoder configuration;
- expose a clear waiting/degraded transport state or diagnostic;
- never allow an unbounded queue.

Once configuration becomes available, send it before a fresh keyframe and resume normal streaming.

### 4. Handle configuration changes

If SPS or PPS changes because the encoder is recreated or its format changes:

- atomically replace the cached configuration;
- send the new configuration before subsequent video for the active session;
- request a fresh keyframe;
- avoid repeatedly resending identical configuration on every frame.

A content comparison or stable digest may be used to detect a real change.

### 5. Preserve bounded backpressure behavior

Codec-config delivery must not introduce an unbounded queue.

Correct the existing queue-accounting edge cases while working in this area:

- Check the result of `videoQueue.trySend()`.
- Increment `queueBytes` only for a packet successfully accepted into the queue, or roll it back on failure.
- Count rejected/overflow packets as dropped.
- Do not report `droppedFrames = 0` unconditionally.
- Clear or invalidate old-session queued packets during reconnect so they cannot precede the new session's configuration.

Codec configuration is control-critical and should not be silently dropped under the ordinary video overflow policy. Use a dedicated cached configuration and deterministic session-start send path rather than relying on it remaining in the video queue.

### 6. Correct telemetry units

The FPV1 status protocol expects bitrate values in **bits per second**, not Mbps. Ensure `currentBitrate` and `averageBitrate` in the status JSON are reported as bps.

Keep UI conversion to Mbps in the presentation layer only.

Ensure status reports accurate values for:

- `encodedFrames`
- `keyframes`
- `bytesSent`
- `currentBitrate`
- `averageBitrate`
- `measuredFps`
- `droppedFrames`
- `transportQueueBytes`
- `reconnectCount`

### 7. Rejection compatibility

Parse a rejected `hello_ack` defensively. `streamId` may be absent in a rejection response, so make it nullable or give it a safe default without weakening validation of an accepted response.

On rejection:

- do not send codec configuration or video;
- enter `TransportState.REJECTED`;
- show the reason;
- do not reconnect rapidly.

## Architecture Constraints

- Keep codec extraction in the encoder layer and session delivery in the transport layer.
- Extend `VideoTransport` with a focused method or typed codec-configuration value if necessary.
- Do not make `VideoEncoder` depend directly on OkHttp or WebSocket classes.
- Do not decode, transcode, or re-encode video.
- Do not send Base64 video or codec data.
- Do not wrap binary codec configuration in JSON.
- Avoid unnecessary buffer copies, but always copy MediaCodec-owned buffers before releasing them.
- Keep shared mutable state thread-safe across MediaCodec callback and coroutine/OkHttp threads.
- Preserve the existing `request_keyframe` callback into `VideoEncoder.requestKeyframe()`.

## Suggested Design

A suitable design is:

```kotlin
data class AvcCodecConfig(
    val sps: ByteArray,
    val pps: ByteArray,
    val presentationTimeUs: Long
) {
    fun toAnnexBPayload(): ByteArray
}
```

Add a focused transport method such as:

```kotlin
fun updateCodecConfig(config: AvcCodecConfig)
```

`VideoEncoder` calls this whenever it obtains complete SPS/PPS. `WebSocketVideoTransport` stores the latest immutable copy and sends it through a session-start method after `hello_ack`.

Use a mutex, atomic reference, or single-coroutine ownership to guarantee ordering. Do not depend on timing delays such as `delay(500)` to make the ordering work.

## Required Tests

Add meaningful JVM unit tests where Android dependencies permit, and instrumented tests only where necessary.

Test at least:

1. Annex-B start-code stripping and normalization.
2. Separate `csd-0` SPS and `csd-1` PPS combination.
3. Combined codec-config parsing.
4. Exact FPV1 payload length and codec-config flag.
5. Codec config is cached before `hello_ack`.
6. Accepted `hello_ack` sends config before queued video.
7. Reconnect resends the cached config.
8. Sequence numbering remains continuous after the session reset.
9. Identical configuration is not resent continuously.
10. Changed configuration is resent before a fresh keyframe.
11. Missing configuration keeps video gated and bounded.
12. Queue send failure restores byte accounting and increments dropped count.
13. Rejected `hello_ack` with no `streamId` parses and sends no video.
14. Status bitrate is expressed in bits per second.

Use a fake or mock WebSocket/transport sink to assert the exact order of outbound messages. Do not require a physical tablet for all ordering tests.

## End-to-End Acceptance Procedure

After unit tests pass:

1. Start the FreePlay server and its Test Results page.
2. Select the correct deterministic stream ID, such as `ring1_cam1`.
3. Start the **Codec Configuration** test before connecting the camera.
4. Start or reconnect the camera.
5. Verify the server observes:

   ```text
   hello
   hello_ack
   codec config
   first keyframe
   recording started
   ```

6. Keep the camera connected and select **Evaluate**.
7. Confirm the test reports `PASS` and the server reports:

   ```text
   codecConfigBuffers >= 1
   codecConfigVersion >= 1
   codecConfigReady = true
   recordingStarted = true
   ```

8. Disconnect and reconnect the camera without restarting the encoder. Repeat the test and confirm the cached configuration is resent.
9. Confirm a completed `.mp4` file contains `ftyp`, `moov`, `moof`, and `mdat` and is playable.

## Completion Requirements

Before reporting completion:

- Build the Android project.
- Run all relevant unit tests.
- Run lint or focused static checks available in the project.
- Report the files changed and tests executed.
- Explicitly identify any verification that still requires a physical tablet.
- Do not claim the server Codec Configuration test passes unless it has actually been exercised end to end.

