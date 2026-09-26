package net.opentkd.freeplay.network.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Capabilities(
    val remoteStreamingControl: Boolean = true,
    val remoteStop: Boolean = true,
    val requestKeyframe: Boolean = true,
    val setBitrate: Boolean = true,
    val commandAcknowledgement: Boolean = true,
    val streamGeneration: Boolean = true
)

@Serializable
data class ServerCapabilities(
    val remoteStreamingControl: Boolean = false,
    val commandAcknowledgement: Boolean = false
)

@Serializable
sealed class FreePlayControlMessage {
    abstract val type: String

    @Serializable
    @SerialName("hello")
    data class Hello(
        val protocol: String = FreePlayProtocol.PROTOCOL_NAME,
        val version: Int = FreePlayProtocol.PROTOCOL_VERSION,
        val streamId: String,
        val ring: Int,
        val camera: Int,
        val device: String,
        val manufacturer: String,
        val androidVersion: String,
        val appVersion: String,
        val codec: String,
        val width: Int,
        val height: Int,
        val fps: Int,
        val bitrate: Int,
        val keyframeInterval: Int,
        val encoder: String,
        val streamState: String = "idle",
        val capabilities: Capabilities = Capabilities()
    ) : FreePlayControlMessage() {
        override val type: String get() = "hello"
    }

    @Serializable
    @SerialName("hello_ack")
    data class HelloAck(
        val accepted: Boolean,
        val streamId: String? = null,
        val serverTime: Double? = null,
        val serverTimeEpochUs: String? = null,
        val reason: String? = null,
        val capabilities: ServerCapabilities? = null
    ) : FreePlayControlMessage() {
        override val type: String get() = "hello_ack"
    }

    @Serializable
    @SerialName("set_streaming")
    data class SetStreaming(
        val commandId: String,
        val desired: Boolean,
        val reason: String? = null,
        val requestedAtEpochUs: String? = null
    ) : FreePlayControlMessage() {
        override val type: String get() = "set_streaming"
    }

    @Serializable
    @SerialName("command_ack")
    data class CommandAck(
        val commandId: String,
        val commandType: String = "set_streaming",
        val accepted: Boolean,
        val streamState: String,
        val alreadyInDesiredState: Boolean = false,
        val reason: String? = null,
        val retryable: Boolean? = null
    ) : FreePlayControlMessage() {
        override val type: String get() = "command_ack"
    }

    @Serializable
    @SerialName("stream_started")
    data class StreamStarted(
        val commandId: String? = null,
        val streamGeneration: Long,
        val startedAtTabletMonotonicNs: String,
        val codec: String = "h264",
        val width: Int,
        val height: Int,
        val fps: Int,
        val bitrate: Int,
        val keyframeInterval: Int,
        val encoder: String,
        val ptsOriginUs: String = "0"
    ) : FreePlayControlMessage() {
        override val type: String get() = "stream_started"
    }

    @Serializable
    @SerialName("stream_start_failed")
    data class StreamStartFailed(
        val commandId: String? = null,
        val streamGeneration: Long,
        val streamState: String = "error",
        val reason: String,
        val message: String? = null,
        val retryable: Boolean = true
    ) : FreePlayControlMessage() {
        override val type: String get() = "stream_start_failed"
    }

    @Serializable
    @SerialName("stream_stopped")
    data class StreamStopped(
        val commandId: String? = null,
        val streamGeneration: Long,
        val stoppedAtTabletMonotonicNs: String,
        val reason: String,
        val finalSequenceNumber: Long,
        val streamState: String = "idle"
    ) : FreePlayControlMessage() {
        override val type: String get() = "stream_stopped"
    }

    @Serializable
    @SerialName("status")
    data class Status(
        val streamId: String,
        val transportState: String,
        val streamState: String,
        val streamGeneration: Long,
        val remoteControlEnabled: Boolean,
        val cameraPermission: String,
        val cameraState: String,
        val encoderState: String,
        val uptimeMs: Long,
        val streamUptimeMs: Long = 0,
        val encodedFrames: Long = 0,
        val keyframes: Int = 0,
        val bytesSent: Long = 0,
        val currentBitrate: Double = 0.0,
        val averageBitrate: Double = 0.0,
        val measuredFps: Double = 0.0,
        val droppedFrames: Int = 0,
        val transportQueueBytes: Long = 0,
        val transportQueueMessages: Int = 0,
        val reconnectCount: Int = 0,
        val network: String = "ethernet",
        val deviceTemperatureC: Double? = null,
        val encoder: String,
        val lastCommandId: String? = null,
        val lastErrorCode: String? = null
    ) : FreePlayControlMessage() {
        override val type: String get() = "status"
    }

    @Serializable
    @SerialName("request_keyframe")
    data class RequestKeyframe(
        val reason: String? = null
    ) : FreePlayControlMessage() {
        override val type: String get() = "request_keyframe"
    }

    @Serializable
    @SerialName("set_bitrate")
    data class SetBitrate(
        val bitrate: Int
    ) : FreePlayControlMessage() {
        override val type: String get() = "set_bitrate"
    }

    @Serializable
    @SerialName("ping")
    data class Ping(
        val id: Long
    ) : FreePlayControlMessage() {
        override val type: String get() = "ping"
    }

    @Serializable
    @SerialName("pong")
    data class Pong(
        val id: Long
    ) : FreePlayControlMessage() {
        override val type: String get() = "pong"
    }
}
