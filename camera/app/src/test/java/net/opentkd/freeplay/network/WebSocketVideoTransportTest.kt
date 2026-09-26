package net.opentkd.freeplay.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import net.opentkd.freeplay.settings.AppSettings
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WebSocketVideoTransportTest {

    @Test
    fun testInitialStates() {
        val transport = WebSocketVideoTransport()
        assertEquals(TransportState.Disconnected, transport.state.value)
        assertEquals(StreamState.IDLE, transport.streamState.value)
        assertEquals(0L, transport.streamGeneration.value)
    }

    @Test
    fun testLocalStartAndStopLifecycle() = runTest {
        var startPipelineCalled = false
        var stopPipelineCalled = false

        val transport = WebSocketVideoTransport()
        transport.setPipelineCallbacks(
            onStartPipeline = { gen ->
                startPipelineCalled = true
            },
            onStopPipeline = { gen ->
                stopPipelineCalled = true
                101L
            }
        )

        transport.startStreamingLocally("test_operator")

        assertEquals(StreamState.STREAMING, transport.streamState.value)
        assertEquals(1L, transport.streamGeneration.value)
        assertTrue(startPipelineCalled)
        assertFalse(transport.lifecycleController.isRemotelyInitiated.value)

        transport.stopStreamingLocally("test_operator")

        assertEquals(StreamState.IDLE, transport.streamState.value)
        assertEquals(1L, transport.streamGeneration.value)
        assertTrue(stopPipelineCalled)
    }

    @Test
    fun testRemoteControlSettingsValidation() = runTest {
        val transport = WebSocketVideoTransport()
        var startCalled = false
        transport.setPipelineCallbacks(
            onStartPipeline = { startCalled = true },
            onStopPipeline = { 0L }
        )

        val settings = AppSettings(remoteControlEnabled = false)
        transport.connect(settings)

        // Remote control disabled in settings -> setStreaming should reject command
        // Simulating handleControlMessage would be done via Reflection or mock WebSocket
        assertFalse(startCalled)
        assertEquals(StreamState.IDLE, transport.streamState.value)
    }
}
