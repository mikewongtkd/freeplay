Create an Android prototype application in Kotlin for Android Studio named **FreePlay Camera** with package:

`net.opentkd.freeplay`

The target hardware is the **Samsung Galaxy Tab A9 (SM-X110)**.

The purpose of this app is to act as one camera node in a multi-ring Taekwondo instant replay system. Each competition ring will have three Galaxy Tab A9 tablets acting as cameras. Each tablet should capture video from the rear camera, encode the video using the tablet's hardware H.264 encoder, and eventually stream that encoded video over Ethernet to a central replay server.

For this first prototype, prioritize reliability, visibility of system status, and clean architecture. The application should be designed so that networking and actual server streaming can be implemented after the camera and encoder pipeline is working.

## Technical Requirements

Use:

* Kotlin
* Android Studio
* Android SDK APIs rather than third-party camera libraries where practical
* Camera2 API
* MediaCodec
* H.264 / AVC
* Hardware-accelerated encoding
* Surface-based encoder input
* Android lifecycle-safe resource management
* Coroutines where appropriate
* Landscape orientation
* Dark theme

Target video configuration:

* Rear camera
* 1920 × 1080
* 30 fps
* H.264 / AVC
* Approximately 6 Mbps
* I-frame / keyframe interval: 1 second
* No audio initially

The app should determine the actual H.264 encoder available on the Galaxy Tab A9 using `MediaCodecList`.

Display:

* encoder name
* whether Android reports it as hardware accelerated
* supported profiles if practical
* whether 1920×1080 encoding is supported
* configured frame rate
* configured bitrate

Do not perform software video encoding unless absolutely necessary.

## Application Architecture

Create a clean modular architecture approximately like:

`MainActivity`
→ UI / Compose screens

`CameraController`
→ Camera2 camera discovery
→ rear camera selection
→ capture session
→ autofocus
→ encoder Surface output
→ preview Surface output

`VideoEncoder`
→ MediaCodec discovery
→ hardware AVC encoder selection
→ MediaCodec configuration
→ encoder Surface creation
→ encoded H.264 output handling

`StreamManager`
→ abstraction for network transport
→ initially implement a stub/mock transport
→ eventually this will send encoded H.264 data using SRT or RTP/UDP

`DeviceStatusManager`
→ camera status
→ encoder status
→ network status
→ stream status
→ uptime
→ bitrate
→ FPS
→ dropped frames
→ bytes transmitted

`AppSettings`
→ ring number
→ camera number
→ server IP address
→ server port
→ target bitrate
→ resolution
→ frame rate
→ keyframe interval
→ auto-start streaming

Use dependency separation so that the transport implementation can later be replaced with an actual SRT implementation without rewriting the camera or encoder code.

## UI / UX

Build the interface using **Jetpack Compose**.

The application is intended to remain mounted on a tripod beside a competition ring for many hours, so the UI should be simple, dark, highly readable, and optimized for status monitoring rather than frequent interaction.

Use four main sections:

### 1. Live

This is the default screen.

The majority of the screen should show the live rear-camera preview.

At the top display:

`FreePlay Camera`

and prominently display:

`RING 3 • CAM 2`

where ring and camera numbers are configurable.

Under that show:

`1920×1080 • 30 fps • H.264`

Display a large status indicator such as:

* green = STREAMING
* yellow = CONNECTING / WARNING
* red = ERROR
* gray = STOPPED

On the right side of the live preview, show a compact status panel.

Example:

STATUS

Streaming to server
`10.0.0.50:9000`

HEALTH

Camera ✓
Encoder ✓
Network ✓
Server ✓
Storage ✓

STATS

Uptime: `01:32:48`
Bitrate: `6.02 Mbps`
FPS: `30.0`
Dropped: `0`
Sent: `45.3 GB`

At the bottom provide large touch controls:

* STOP / START
* PAUSE
* SNAPSHOT
* MIC

MIC can remain disabled for the prototype.

Require confirmation before stopping an active stream.

### 2. Status

Show detailed system information.

Device Information:

* Device model
* Android version
* App version
* Device ID
* Uptime

Stream Information:

* Server
* Protocol
* Stream ID
* Resolution
* FPS
* Target bitrate
* Current bitrate
* Keyframe interval
* Encoder name
* Hardware acceleration status

Health:

* Camera
* Encoder
* Network
* Server connection
* Frame drops

Use green/yellow/red status indicators.

### 3. Network

Show:

* connection type
* IP address
* subnet mask if available
* gateway if available
* DNS
* Ethernet link state
* link speed if available

Show future streaming configuration:

Protocol: `SRT`

Mode: `Caller`

Server address

Port

Latency

Packet loss

Reconnect count

For now, values that are not implemented may explicitly say:

`Not implemented in prototype`

Do not fabricate live networking data.

### 4. Settings

Provide editable settings for:

Camera:

* Rear / Front
* Resolution
* FPS

Stream:

* H.264 / AVC
* target bitrate
* keyframe interval
* server address
* server port
* ring number
* camera number

System:

* Auto-start camera
* Auto-start streaming
* Keep screen on
* Lock landscape orientation

Save settings using `DataStore`.

Defaults:

Ring: `1`

Camera: `1`

Resolution: `1920×1080`

FPS: `30`

Bitrate: `6000000`

Keyframe interval: `1`

Server: `10.0.0.50`

Port: `9000`

## Stream Identity

Every camera should have a deterministic stream identifier.

Format:

`ring{ringNumber}_cam{cameraNumber}`

Examples:

`ring1_cam1`

`ring1_cam2`

`ring1_cam3`

`ring8_cam2`

Show this identifier on the Status screen.

## Camera Pipeline

The intended pipeline is:

Rear Camera

→ Camera2

→ CaptureSession

→ two Surface targets:

1. Compose / preview Surface

2. MediaCodec encoder Surface

→ MediaCodec H.264 encoder

→ encoded H.264 access units

→ StreamManager

The preview and encoder should operate simultaneously.

Use:

`CameraDevice.TEMPLATE_RECORD`

Enable continuous video autofocus where supported.

Do not copy every camera frame through the CPU or convert the camera frames into Bitmaps.

The purpose of using Surface-based Camera2 → MediaCodec is to keep the pipeline hardware accelerated and efficient.

## MediaCodec Discovery

Before configuring the encoder, enumerate available codecs with `MediaCodecList`.

Find encoders supporting:

`video/avc`

Prefer a codec where:

`MediaCodecInfo.isHardwareAccelerated == true`

Log all candidate AVC encoders.

Display the selected codec in the Status UI.

Verify that the selected encoder supports the target size and bitrate where Android exposes that information.

If 1920×1080 @ 30 fps is unavailable, gracefully fall back and clearly display the fallback configuration.

## Prototype Networking

Do NOT attempt to implement a complete SRT library from scratch.

Create this interface:

```kotlin
interface VideoTransport {
    suspend fun connect(config: StreamConfig)
    suspend fun send(
        data: ByteBuffer,
        info: MediaCodec.BufferInfo
    )
    suspend fun disconnect()
    val state: StateFlow<TransportState>
}
```

Create:

`MockVideoTransport`

For the first prototype, it should:

* accept encoded H.264 output
* count bytes
* calculate approximate bitrate
* report connection state
* discard the encoded payload after processing statistics

This allows us to test the complete:

Camera → H.264 encoder → transport

pipeline before implementing actual network transmission.

Structure the code so that later we can implement:

`SrtVideoTransport`

without changing CameraController or VideoEncoder.

## Snapshot

Implement a simple Snapshot button.

If capturing a still through Camera2 complicates the first implementation, a temporary prototype implementation may capture the current preview frame.

Save the image in the application's files area.

Display a confirmation dialog with the saved filename.

## Runtime Statistics

Maintain:

* session start timestamp
* uptime
* encoded frame count
* keyframe count
* bytes generated
* calculated current bitrate
* average bitrate
* dropped frame count if detectable
* encoder errors
* reconnect count

Update the UI approximately once per second rather than on every frame.

## Reliability

This application may eventually run for 8–12 hours continuously.

Avoid:

* retaining camera frames
* accumulating encoded ByteBuffers
* unbounded queues
* leaking MediaCodec buffers
* blocking the main thread
* creating a new object for every video frame where avoidable

Always release MediaCodec output buffers immediately after the transport has consumed or copied the necessary data.

Correctly release:

* CameraCaptureSession
* CameraDevice
* MediaCodec
* encoder Surface
* preview Surface

when the activity/app shuts down.

Use a foreground service architecture if necessary for reliable long-duration streaming.

For the prototype, suggest where a future `CameraStreamingService` should fit into the architecture even if MainActivity initially owns the pipeline.

## Screen Behavior

Keep the screen awake while streaming.

Force landscape orientation.

The user should immediately be able to determine from several feet away whether:

* the camera is working
* encoding is working
* the server connection is working
* frames are being dropped
* the correct ring and camera are configured

## Error Handling

Show clear user-visible errors for:

* camera unavailable
* camera permission denied
* unsupported resolution
* no H.264 hardware encoder
* encoder configuration failure
* camera capture failure
* server connection failure
* network disconnect

Do not silently fail.

Log technical details using Android Logcat with tag prefixes such as:

`FreePlay.Camera`

`FreePlay.Encoder`

`FreePlay.Network`

`FreePlay.UI`

## Permissions

Add the appropriate AndroidManifest permissions including at minimum:

* CAMERA
* INTERNET
* ACCESS_NETWORK_STATE

Add camera hardware feature declarations where appropriate.

## Files To Generate

Please build this prototype as a normal Android Studio project and generate or modify all required files, including:

* `MainActivity.kt`
* Compose UI files
* `CameraController.kt`
* `VideoEncoder.kt`
* `VideoTransport.kt`
* `MockVideoTransport.kt`
* `DeviceStatusManager.kt`
* data/settings models
* DataStore settings implementation
* AndroidManifest.xml
* Gradle dependencies
* theme files

Keep classes reasonably small and separated by responsibility.

Suggested package structure:

```text
net.opentkd.freeplay

camera/
    CameraController.kt

encoder/
    VideoEncoder.kt
    EncoderCapabilities.kt

network/
    VideoTransport.kt
    MockVideoTransport.kt
    TransportState.kt

settings/
    AppSettings.kt
    SettingsRepository.kt

status/
    DeviceStatus.kt
    DeviceStatusManager.kt

ui/
    LiveScreen.kt
    StatusScreen.kt
    NetworkScreen.kt
    SettingsScreen.kt
    components/

MainActivity.kt
```

## Important Development Strategy

Do not try to implement everything simultaneously.

Build this prototype incrementally.

First ensure:

1. Project builds and launches.
2. Camera permission works.
3. Rear-camera preview works.
4. MediaCodec H.264 encoder is discovered.
5. Camera2 successfully feeds both preview and encoder surfaces.
6. Encoded frames are produced.
7. MockVideoTransport receives encoded frames.
8. Runtime statistics update.
9. UI displays system health.
10. Settings persist.

Only after those work should actual network video streaming be implemented.

When generating code, prefer complete compilable files rather than fragments.

If an Android API is deprecated, use the modern equivalent where practical.

When uncertain about a hardware capability, query Android for the capability at runtime rather than assuming it exists.

The most important objective of this prototype is to prove that a Samsung Galaxy Tab A9 can reliably perform:

Rear Camera → Camera2 → hardware H.264 MediaCodec → encoded stream

continuously at approximately:

1920×1080
30 fps
6 Mbps

while simultaneously presenting a usable live monitoring interface.

