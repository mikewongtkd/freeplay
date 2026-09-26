package net.opentkd.freeplay.network

import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class StartStreamRequest(
    val commandId: String? = null,
    val reason: String? = null,
    val isRemote: Boolean = false
)

sealed interface StartResult {
    data class Success(
        val generation: Long,
        val startedAtNs: Long,
        val commandId: String? = null
    ) : StartResult

    data class AlreadyInDesiredState(
        val generation: Long,
        val commandId: String? = null
    ) : StartResult

    data class Failure(
        val generation: Long,
        val reason: String,
        val message: String,
        val retryable: Boolean = true,
        val commandId: String? = null
    ) : StartResult
}

data class StopStreamRequest(
    val commandId: String? = null,
    val reason: String = "local_operator",
    val isRemote: Boolean = false
)

sealed interface StopResult {
    data class Success(
        val generation: Long,
        val stoppedAtNs: Long,
        val finalSequenceNumber: Long,
        val reason: String,
        val commandId: String? = null
    ) : StopResult

    data class AlreadyInDesiredState(
        val generation: Long,
        val commandId: String? = null
    ) : StopResult

    data class Failure(
        val generation: Long,
        val reason: String,
        val message: String,
        val commandId: String? = null
    ) : StopResult
}

interface StreamLifecycleController {
    val state: StateFlow<StreamState>
    val generation: StateFlow<Long>
    val isRemotelyInitiated: StateFlow<Boolean>

    suspend fun start(request: StartStreamRequest): StartResult
    suspend fun stop(request: StopStreamRequest): StopResult
}

class StreamLifecycleControllerImpl(
    private val onStartPipeline: suspend (generation: Long) -> Unit,
    private val onStopPipeline: suspend (generation: Long) -> Long
) : StreamLifecycleController {

    private val _state = MutableStateFlow(StreamState.IDLE)
    override val state: StateFlow<StreamState> = _state.asStateFlow()

    private val _generation = MutableStateFlow(0L)
    override val generation: StateFlow<Long> = _generation.asStateFlow()

    private val _isRemotelyInitiated = MutableStateFlow(false)
    override val isRemotelyInitiated: StateFlow<Boolean> = _isRemotelyInitiated.asStateFlow()

    private val mutex = Mutex()

    override suspend fun start(request: StartStreamRequest): StartResult {
        mutex.withLock {
            if (_state.value == StreamState.STREAMING) {
                return StartResult.AlreadyInDesiredState(_generation.value, request.commandId)
            }
            if (_state.value == StreamState.STARTING || _state.value == StreamState.STOPPING) {
                return StartResult.Failure(
                    generation = _generation.value,
                    reason = "busy",
                    message = "Stream transition currently in progress",
                    retryable = true,
                    commandId = request.commandId
                )
            }

            _state.value = StreamState.STARTING
            _isRemotelyInitiated.value = request.isRemote
            val newGeneration = _generation.value + 1
            _generation.value = newGeneration

            val startedAtNs = getMonotonicTimeNs()
            return try {
                onStartPipeline(newGeneration)
                _state.value = StreamState.STREAMING
                StartResult.Success(
                    generation = newGeneration,
                    startedAtNs = startedAtNs,
                    commandId = request.commandId
                )
            } catch (e: Exception) {
                _state.value = StreamState.ERROR
                StartResult.Failure(
                    generation = newGeneration,
                    reason = "internal_error",
                    message = e.message ?: "Failed to start streaming pipeline",
                    retryable = true,
                    commandId = request.commandId
                )
            }
        }
    }

    override suspend fun stop(request: StopStreamRequest): StopResult {
        mutex.withLock {
            if (_state.value == StreamState.IDLE) {
                return StopResult.AlreadyInDesiredState(_generation.value, request.commandId)
            }
            if (_state.value == StreamState.STARTING || _state.value == StreamState.STOPPING) {
                return StopResult.Failure(
                    generation = _generation.value,
                    reason = "busy",
                    message = "Stream transition currently in progress",
                    commandId = request.commandId
                )
            }

            _state.value = StreamState.STOPPING
            val currentGen = _generation.value
            val stoppedAtNs = getMonotonicTimeNs()

            return try {
                val finalSeq = onStopPipeline(currentGen)
                _state.value = StreamState.IDLE
                _isRemotelyInitiated.value = false
                StopResult.Success(
                    generation = currentGen,
                    stoppedAtNs = stoppedAtNs,
                    finalSequenceNumber = finalSeq,
                    reason = request.reason,
                    commandId = request.commandId
                )
            } catch (e: Exception) {
                _state.value = StreamState.ERROR
                StopResult.Failure(
                    generation = currentGen,
                    reason = "internal_error",
                    message = e.message ?: "Failed to stop streaming pipeline",
                    commandId = request.commandId
                )
            }
        }
    }

    private fun getMonotonicTimeNs(): Long {
        return try {
            SystemClock.elapsedRealtimeNanos()
        } catch (e: Exception) {
            System.nanoTime()
        }
    }
}
