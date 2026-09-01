package net.opentkd.freeplay.network.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
sealed class FreePlayControlMessage {
    abstract val type: String

    @Serializable
    @SerialName("hello")
    data class Hello(
        override val type: String = "hello",
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
        val encoder: String
    ) : FreePlayControlMessage()

    @Serializable
    @SerialName("hello_ack")
    data class HelloAck(
        override val type: String = "hello_ack",
        val accepted: Boolean,
        val streamId: String,
        val serverTime: Double? = null,
        val reason: String? = null
    ) : FreePlayControlMessage()

    @Serializable
    @SerialName("status")
    data class Status(
        override val type: String = "status",
        val streamId: String,
        val uptimeMs: Long,
        val encodedFrames: Long,
        val keyframes: Int,
        val bytesSent: Long,
        val currentBitrate: Double,
        val averageBitrate: Double,
        val measuredFps: Double,
        val droppedFrames: Int,
        val transportQueueBytes: Long,
        val reconnectCount: Int,
        val network: String,
        val deviceTemperatureC: Double? = null,
        val encoder: String
    ) : FreePlayControlMessage()

    @Serializable
    @SerialName("request_keyframe")
    data class RequestKeyframe(
        override val type: String = "request_keyframe"
    ) : FreePlayControlMessage()

    @Serializable
    @SerialName("set_bitrate")
    data class SetBitrate(
        override val type: String = "set_bitrate",
        val bitrate: Int
    ) : FreePlayControlMessage()

    @Serializable
    @SerialName("ping")
    data class Ping(
        override val type: String = "ping",
        val id: Long
    ) : FreePlayControlMessage()

    @Serializable
    @SerialName("pong")
    data class Pong(
        override val type: String = "pong",
        val id: Long
    ) : FreePlayControlMessage()
}
