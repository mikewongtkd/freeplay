package net.opentkd.freeplay.network

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import net.opentkd.freeplay.network.protocol.*
import org.junit.Assert.*
import org.junit.Test

class FreePlayControlMessageTest {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Test
    fun testHelloSerializationAndCapabilities() {
        val hello = FreePlayControlMessage.Hello(
            streamId = "ring6_cam2",
            ring = 6,
            camera = 2,
            device = "SM-X110",
            manufacturer = "Samsung",
            androidVersion = "15",
            appVersion = "1.1.0",
            codec = "h264",
            width = 1920,
            height = 1080,
            fps = 30,
            bitrate = 6000000,
            keyframeInterval = 1,
            encoder = "c2.mtk.avc.encoder",
            streamState = "idle",
            capabilities = Capabilities(
                remoteStreamingControl = true,
                remoteStop = true,
                requestKeyframe = true,
                setBitrate = true,
                commandAcknowledgement = true,
                streamGeneration = true
            )
        )

        val encoded = json.encodeToString<FreePlayControlMessage>(hello)
        assertTrue(encoded.contains("\"type\":\"hello\""))
        assertTrue(encoded.contains("\"streamState\":\"idle\""))
        assertTrue(encoded.contains("\"remoteStreamingControl\":true"))

        val decoded = json.decodeFromString<FreePlayControlMessage>(encoded) as FreePlayControlMessage.Hello
        assertEquals("ring6_cam2", decoded.streamId)
        assertEquals("idle", decoded.streamState)
        assertTrue(decoded.capabilities.remoteStreamingControl)
        assertTrue(decoded.capabilities.remoteStop)
    }

    @Test
    fun testHelloAckDeserializationWithCapabilities() {
        val jsonString = """
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
        """.trimIndent()

        val decoded = json.decodeFromString<FreePlayControlMessage>(jsonString) as FreePlayControlMessage.HelloAck
        assertTrue(decoded.accepted)
        assertEquals("ring6_cam2", decoded.streamId)
        assertEquals("1790365142354000", decoded.serverTimeEpochUs)
        assertNotNull(decoded.capabilities)
        val caps = decoded.capabilities!!
        assertTrue(caps.remoteStreamingControl)
        assertTrue(caps.commandAcknowledgement)
    }

    @Test
    fun testSetStreamingDeserialization() {
        val jsonString = """
            {
              "type": "set_streaming",
              "commandId": "cmd-N7Qp0T18jByH",
              "desired": true,
              "reason": "ivr_operator",
              "requestedAtEpochUs": "1790365142354000"
            }
        """.trimIndent()

        val decoded = json.decodeFromString<FreePlayControlMessage>(jsonString) as FreePlayControlMessage.SetStreaming
        assertEquals("cmd-N7Qp0T18jByH", decoded.commandId)
        assertTrue(decoded.desired)
        assertEquals("ivr_operator", decoded.reason)
        assertEquals("1790365142354000", decoded.requestedAtEpochUs)
    }

    @Test
    fun testCommandAckSerialization() {
        val ack = FreePlayControlMessage.CommandAck(
            commandId = "cmd-N7Qp0T18jByH",
            commandType = "set_streaming",
            accepted = true,
            streamState = "starting",
            alreadyInDesiredState = false
        )

        val encoded = json.encodeToString<FreePlayControlMessage>(ack)
        assertTrue(encoded.contains("\"commandId\":\"cmd-N7Qp0T18jByH\""))
        assertTrue(encoded.contains("\"accepted\":true"))
        assertTrue(encoded.contains("\"streamState\":\"starting\""))

        val decoded = json.decodeFromString<FreePlayControlMessage>(encoded) as FreePlayControlMessage.CommandAck
        assertEquals("cmd-N7Qp0T18jByH", decoded.commandId)
        assertTrue(decoded.accepted)
        assertEquals("starting", decoded.streamState)
    }

    @Test
    fun testStreamStartedSerialization() {
        val msg = FreePlayControlMessage.StreamStarted(
            commandId = "cmd-N7Qp0T18jByH",
            streamGeneration = 4,
            startedAtTabletMonotonicNs = "48390219381122",
            codec = "h264",
            width = 1920,
            height = 1080,
            fps = 30,
            bitrate = 6000000,
            keyframeInterval = 1,
            encoder = "c2.mtk.avc.encoder",
            ptsOriginUs = "0"
        )

        val encoded = json.encodeToString<FreePlayControlMessage>(msg)
        assertTrue(encoded.contains("\"streamGeneration\":4"))
        assertTrue(encoded.contains("\"startedAtTabletMonotonicNs\":\"48390219381122\""))

        val decoded = json.decodeFromString<FreePlayControlMessage>(encoded) as FreePlayControlMessage.StreamStarted
        assertEquals(4L, decoded.streamGeneration)
        assertEquals("48390219381122", decoded.startedAtTabletMonotonicNs)
    }

    @Test
    fun testStreamStartFailedSerialization() {
        val msg = FreePlayControlMessage.StreamStartFailed(
            commandId = "cmd-N7Qp0T18jByH",
            streamGeneration = 4,
            streamState = "error",
            reason = "camera_in_use",
            message = "The rear camera is unavailable.",
            retryable = true
        )

        val encoded = json.encodeToString<FreePlayControlMessage>(msg)
        assertTrue(encoded.contains("\"reason\":\"camera_in_use\""))

        val decoded = json.decodeFromString<FreePlayControlMessage>(encoded) as FreePlayControlMessage.StreamStartFailed
        assertEquals("camera_in_use", decoded.reason)
        assertTrue(decoded.retryable)
    }

    @Test
    fun testStreamStoppedSerialization() {
        val msg = FreePlayControlMessage.StreamStopped(
            commandId = "cmd-kb24H2sY7c",
            streamGeneration = 4,
            stoppedAtTabletMonotonicNs = "48415220199302",
            reason = "remote_request",
            finalSequenceNumber = 88320,
            streamState = "idle"
        )

        val encoded = json.encodeToString<FreePlayControlMessage>(msg)
        assertTrue(encoded.contains("\"finalSequenceNumber\":88320"))

        val decoded = json.decodeFromString<FreePlayControlMessage>(encoded) as FreePlayControlMessage.StreamStopped
        assertEquals(88320L, decoded.finalSequenceNumber)
        assertEquals("remote_request", decoded.reason)
    }

    @Test
    fun testStatusSerializationInIdleAndStreaming() {
        val statusIdle = FreePlayControlMessage.Status(
            streamId = "ring6_cam2",
            transportState = "registered",
            streamState = "idle",
            streamGeneration = 4,
            remoteControlEnabled = true,
            cameraPermission = "granted",
            cameraState = "closed",
            encoderState = "stopped",
            uptimeMs = 382921,
            encoder = "c2.mtk.avc.encoder",
            lastCommandId = "cmd-kb24H2sY7c"
        )

        val encoded = json.encodeToString<FreePlayControlMessage>(statusIdle)
        assertTrue(encoded.contains("\"streamState\":\"idle\""))
        assertTrue(encoded.contains("\"transportState\":\"registered\""))

        val decoded = json.decodeFromString<FreePlayControlMessage>(encoded) as FreePlayControlMessage.Status
        assertEquals("idle", decoded.streamState)
        assertEquals("registered", decoded.transportState)
        assertEquals(4L, decoded.streamGeneration)
    }
}
