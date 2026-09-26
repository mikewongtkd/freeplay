package net.opentkd.freeplay.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StreamLifecycleControllerTest {

    @Test
    fun testStartAndStopLifecycleTransitions() = runTest {
        var startCount = 0
        var stopCount = 0

        val controller = StreamLifecycleControllerImpl(
            onStartPipeline = { gen ->
                startCount++
            },
            onStopPipeline = { gen ->
                stopCount++
                100L // mock sequence number
            }
        )

        assertEquals(StreamState.IDLE, controller.state.value)
        assertEquals(0L, controller.generation.value)

        val startResult = controller.start(StartStreamRequest(commandId = "cmd-1", isRemote = true))
        assertTrue(startResult is StartResult.Success)
        val success = startResult as StartResult.Success
        assertEquals(1L, success.generation)
        assertEquals(1, startCount)
        assertEquals(StreamState.STREAMING, controller.state.value)
        assertEquals(1L, controller.generation.value)
        assertTrue(controller.isRemotelyInitiated.value)

        // Repeat start while STREAMING -> AlreadyInDesiredState
        val startAgain = controller.start(StartStreamRequest(commandId = "cmd-1", isRemote = true))
        assertTrue(startAgain is StartResult.AlreadyInDesiredState)

        // Stop
        val stopResult = controller.stop(StopStreamRequest(commandId = "cmd-2", reason = "remote_request", isRemote = true))
        assertTrue(stopResult is StopResult.Success)
        val stopSuccess = stopResult as StopResult.Success
        assertEquals(1L, stopSuccess.generation)
        assertEquals(100L, stopSuccess.finalSequenceNumber)
        assertEquals(1, stopCount)
        assertEquals(StreamState.IDLE, controller.state.value)
        assertFalse(controller.isRemotelyInitiated.value)

        // Repeat stop while IDLE -> AlreadyInDesiredState
        val stopAgain = controller.stop(StopStreamRequest(commandId = "cmd-2", reason = "remote_request", isRemote = true))
        assertTrue(stopAgain is StopResult.AlreadyInDesiredState)

        // Second start -> generation 2
        val start2 = controller.start(StartStreamRequest(commandId = "cmd-3", isRemote = false))
        assertTrue(start2 is StartResult.Success)
        assertEquals(2L, controller.generation.value)
        assertFalse(controller.isRemotelyInitiated.value)
    }

    @Test
    fun testStartFailureTransition() = runTest {
        val controller = StreamLifecycleControllerImpl(
            onStartPipeline = { gen ->
                throw RuntimeException("Camera hardware failed")
            },
            onStopPipeline = { 0L }
        )

        val result = controller.start(StartStreamRequest(commandId = "cmd-fail"))
        assertTrue(result is StartResult.Failure)
        val fail = result as StartResult.Failure
        assertEquals("internal_error", fail.reason)
        assertEquals("Camera hardware failed", fail.message)
        assertEquals(StreamState.ERROR, controller.state.value)
    }
}
