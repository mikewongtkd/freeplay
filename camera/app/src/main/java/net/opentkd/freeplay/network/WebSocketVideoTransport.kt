package net.opentkd.freeplay.network

import android.media.MediaCodec
import android.os.Build
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import net.opentkd.freeplay.encoder.AvcCodecConfig
import net.opentkd.freeplay.network.protocol.*
import net.opentkd.freeplay.settings.AppSettings
import okhttp3.*
import okio.ByteString.Companion.toByteString
import java.nio.ByteBuffer
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

object AppLog {
    fun d(tag: String, msg: String) {
        try { Log.d(tag, msg) } catch (_: Throwable) { println("[$tag] D: $msg") }
    }
    fun e(tag: String, msg: String, t: Throwable? = null) {
        try { Log.e(tag, msg, t) } catch (_: Throwable) { println("[$tag] E: $msg ${t?.message ?: ""}") }
    }
    fun w(tag: String, msg: String, t: Throwable? = null) {
        try { Log.w(tag, msg, t) } catch (_: Throwable) { println("[$tag] W: $msg ${t?.message ?: ""}") }
    }
}

class WebSocketVideoTransport : VideoTransport {
    private val TAG = "FreePlay/Transport"

    private val _state = MutableStateFlow<TransportState>(TransportState.Disconnected)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private val _bytesSent = MutableStateFlow(0L)
    override val bytesSent: StateFlow<Long> = _bytesSent.asStateFlow()

    private val _currentBitrate = MutableStateFlow(0.0)
    override val currentBitrate: StateFlow<Double> = _currentBitrate.asStateFlow()

    private val _stats = MutableStateFlow(TransportStats())
    override val stats: StateFlow<TransportStats> = _stats.asStateFlow()

    private val idempotencyCache = CommandIdempotencyCache()

    private var onStartPipelineCallback: (suspend (generation: Long) -> Unit)? = null
    private var onStopPipelineCallback: (suspend (generation: Long) -> Long)? = null

    val lifecycleController: StreamLifecycleControllerImpl = StreamLifecycleControllerImpl(
        onStartPipeline = { gen ->
            onStartPipelineCallback?.invoke(gen)
        },
        onStopPipeline = { gen ->
            onStopPipelineCallback?.invoke(gen) ?: sequenceNumber.toLong()
        }
    )

    override val streamState: StateFlow<StreamState> = lifecycleController.state
    override val streamGeneration: StateFlow<Long> = lifecycleController.generation

    private val client = OkHttpClient.Builder()
        .pingInterval(5, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var sequenceNumber = 0u
    private var reconnectCount = 0
    private var isActive = false
    private var currentConfig: AppSettings? = null
    private val latestCodecConfig = AtomicReference<AvcCodecConfig?>()

    private val videoQueue = Channel<VideoPacket>(MAX_QUEUED_VIDEO_MESSAGES)
    private var queueBytes = AtomicLong(0)

    private var streamingReady = CompletableDeferred<Unit>()

    private var lastFpsCalcTime = getMonotonicTimeMs()
    private var framesSinceLastFpsCalc = 0

    private var onKeyframeRequested: (() -> Unit)? = null

    var cameraPermissionGranted: Boolean = true
    var cameraState: String = "closed"
    var encoderState: String = "stopped"
    private var lastCommandId: String? = null
    private var lastErrorCode: String? = null
    private var streamStartTimeMs: Long = 0

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    companion object {
        private const val MAX_QUEUED_VIDEO_MESSAGES = 100
        private const val MAX_QUEUED_VIDEO_BYTES = 5 * 1024 * 1024 // 5MB
    }

    private data class VideoPacket(
        val header: FreePlayBinaryHeader,
        val payload: ByteArray,
        val generation: Long
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is VideoPacket) return false
            if (header != other.header) return false
            if (generation != other.generation) return false
            if (!payload.contentEquals(other.payload)) return false
            return true
        }

        override fun hashCode(): Int {
            var result = header.hashCode()
            result = 31 * result + generation.hashCode()
            result = 31 * result + payload.contentHashCode()
            return result
        }
    }

    fun setPipelineCallbacks(
        onStartPipeline: suspend (generation: Long) -> Unit,
        onStopPipeline: suspend (generation: Long) -> Long
    ) {
        this.onStartPipelineCallback = onStartPipeline
        this.onStopPipelineCallback = onStopPipeline
    }

    override fun setEncoderName(name: String) {
        _stats.value = _stats.value.copy(encoder = name)
    }

    override fun updateCodecConfig(config: AvcCodecConfig) {
        latestCodecConfig.set(config)
    }

    fun setKeyframeRequestListener(listener: () -> Unit) {
        onKeyframeRequested = listener
    }

    override suspend fun connect(config: AppSettings) {
        isActive = true
        currentConfig = config
        reconnectCount = 0
        startConnectionLoop()
        startSenderLoop()
        startStatusLoop()
    }

    private fun startConnectionLoop() {
        scope.launch {
            AppLog.d(TAG, "Starting connection loop")
            while (isActive) {
                val config = currentConfig ?: run {
                    AppLog.e(TAG, "No config available, exiting connection loop")
                    break
                }
                val url = "ws://${config.serverAddress}:${config.serverPort}"

                AppLog.d(TAG, "Connecting to $url")
                _state.value = TransportState.Connecting

                try {
                    val request = Request.Builder().url(url).build()
                    webSocket = client.newWebSocket(request, createWebSocketListener())
                    AppLog.d(TAG, "WebSocket connection request initiated")
                } catch (e: Exception) {
                    AppLog.e(TAG, "Error initiating WebSocket connection", e)
                    _state.value = TransportState.Error(e.message ?: "Unknown init error")
                }

                // Wait until disconnected or stopped
                while (isActive &&
                    _state.value !is TransportState.Disconnected &&
                    _state.value !is TransportState.Error &&
                    _state.value !is TransportState.Rejected
                ) {
                    delay(1000)
                }

                if (isActive && (_state.value is TransportState.Error || _state.value is TransportState.Disconnected)) {
                    if (_state.value is TransportState.Rejected) break

                    reconnectCount++
                    val delayMs = when {
                        reconnectCount == 1 -> 1000L
                        reconnectCount == 2 -> 2000L
                        else -> 5000L
                    }
                    AppLog.d(TAG, "Reconnecting in $delayMs ms (attempt $reconnectCount)")
                    _state.value = TransportState.Reconnecting(reconnectCount)
                    delay(delayMs)
                } else {
                    break
                }
            }
        }
    }

    private fun createWebSocketListener() = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            AppLog.d(TAG, "WebSocket Opened")
            _state.value = TransportState.AwaitingHelloAck
            _stats.value = _stats.value.copy(connectionStartTime = System.currentTimeMillis())
            streamingReady = CompletableDeferred()

            clearVideoQueue()

            sendHello(webSocket)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = json.decodeFromString<FreePlayControlMessage>(text)
                handleControlMessage(message)
            } catch (e: Exception) {
                AppLog.e(TAG, "Failed to parse JSON message: $text", e)
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            AppLog.d(TAG, "WebSocket Closing: $code / $reason")
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            AppLog.d(TAG, "WebSocket Closed")
            if (isActive) _state.value = TransportState.Error("Closed by server")
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            AppLog.e(TAG, "WebSocket Failure", t)
            if (isActive) _state.value = TransportState.Error(t.message ?: "Unknown failure")
        }
    }

    private fun sendHello(ws: WebSocket) {
        val config = currentConfig ?: return
        val resolution = config.resolution.split("x")
        val width = resolution.getOrNull(0)?.toInt() ?: 1920
        val height = resolution.getOrNull(1)?.toInt() ?: 1080

        val hello = FreePlayControlMessage.Hello(
            streamId = config.streamId,
            ring = config.ringNumber,
            camera = config.cameraNumber,
            device = try { Build.MODEL } catch (_: Throwable) { "SM-X110" },
            manufacturer = try { Build.MANUFACTURER } catch (_: Throwable) { "Samsung" },
            androidVersion = try { Build.VERSION.RELEASE } catch (_: Throwable) { "15" },
            appVersion = "1.1.0",
            codec = "h264",
            width = width,
            height = height,
            fps = config.frameRate,
            bitrate = config.bitrate,
            keyframeInterval = config.keyframeInterval,
            encoder = _stats.value.encoder,
            streamState = lifecycleController.state.value.wireName,
            capabilities = Capabilities(
                remoteStreamingControl = config.remoteControlEnabled,
                remoteStop = config.allowRemoteStop,
                requestKeyframe = true,
                setBitrate = true,
                commandAcknowledgement = true,
                streamGeneration = true
            )
        )
        ws.send(json.encodeToString(hello))
        AppLog.d(TAG, "Hello sent with streamState=${hello.streamState}")
    }

    private fun handleControlMessage(message: FreePlayControlMessage) {
        when (message) {
            is FreePlayControlMessage.HelloAck -> {
                if (message.accepted) {
                    AppLog.d(TAG, "Hello accepted")
                    sequenceNumber = 0u

                    if (lifecycleController.state.value == StreamState.STREAMING) {
                        _state.value = TransportState.RegisteredStreaming
                    } else {
                        _state.value = TransportState.RegisteredIdle
                    }
                    streamingReady.complete(Unit)

                    // If stream was already running across reconnect, re-emit stream_started & config
                    if (lifecycleController.state.value == StreamState.STREAMING) {
                        scope.launch {
                            emitStreamStarted(
                                commandId = null,
                                generation = lifecycleController.generation.value
                            )
                            latestCodecConfig.get()?.let { sendCodecConfig(it, lifecycleController.generation.value) }
                            onKeyframeRequested?.invoke()
                        }
                    }
                } else {
                    AppLog.e(TAG, "Hello rejected: ${message.reason}")
                    _state.value = TransportState.Rejected(message.reason ?: "Unknown reason")
                    streamingReady.completeExceptionally(Exception("Handshake rejected: ${message.reason}"))
                }
            }

            is FreePlayControlMessage.SetStreaming -> {
                handleSetStreaming(message)
            }

            is FreePlayControlMessage.RequestKeyframe -> {
                AppLog.d(TAG, "Server requested keyframe")
                if (lifecycleController.state.value == StreamState.STREAMING) {
                    onKeyframeRequested?.invoke()
                } else {
                    lastErrorCode = "not_streaming"
                }
            }

            is FreePlayControlMessage.Ping -> {
                webSocket?.send(json.encodeToString(FreePlayControlMessage.Pong(id = message.id)))
            }

            else -> {}
        }
    }

    private fun handleSetStreaming(cmd: FreePlayControlMessage.SetStreaming) {
        lastCommandId = cmd.commandId

        // 1. Check idempotency cache
        val cachedAck = idempotencyCache.get(cmd.commandId)
        if (cachedAck != null) {
            AppLog.d(TAG, "Replaying cached CommandAck for commandId=${cmd.commandId}")
            webSocket?.send(json.encodeToString(cachedAck))
            return
        }

        val config = currentConfig
        val currentStreamState = lifecycleController.state.value

        if (cmd.desired) {
            // Start request
            if (config != null && !config.remoteControlEnabled) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = false,
                    streamState = currentStreamState.wireName,
                    reason = "remote_control_disabled",
                    retryable = false
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            if (!cameraPermissionGranted) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = false,
                    streamState = currentStreamState.wireName,
                    reason = "camera_permission_required",
                    retryable = false
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            if (currentStreamState == StreamState.STREAMING) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = true,
                    streamState = "streaming",
                    alreadyInDesiredState = true
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            if (currentStreamState == StreamState.STARTING || currentStreamState == StreamState.STOPPING) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = false,
                    streamState = currentStreamState.wireName,
                    reason = "busy",
                    retryable = true
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            // Accept and start transition
            val ack = FreePlayControlMessage.CommandAck(
                commandId = cmd.commandId,
                accepted = true,
                streamState = "starting",
                alreadyInDesiredState = false
            )
            idempotencyCache.put(cmd.commandId, ack)
            webSocket?.send(json.encodeToString(ack))

            scope.launch {
                executeRemoteStart(cmd.commandId, cmd.reason)
            }
        } else {
            // Stop request
            if (config != null && !config.allowRemoteStop) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = false,
                    streamState = currentStreamState.wireName,
                    reason = "remote_control_disabled",
                    retryable = false
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            if (currentStreamState == StreamState.IDLE) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = true,
                    streamState = "idle",
                    alreadyInDesiredState = true
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            if (currentStreamState == StreamState.STARTING || currentStreamState == StreamState.STOPPING) {
                val ack = FreePlayControlMessage.CommandAck(
                    commandId = cmd.commandId,
                    accepted = false,
                    streamState = currentStreamState.wireName,
                    reason = "busy",
                    retryable = true
                )
                idempotencyCache.put(cmd.commandId, ack)
                webSocket?.send(json.encodeToString(ack))
                return
            }

            // Accept and stop transition
            val ack = FreePlayControlMessage.CommandAck(
                commandId = cmd.commandId,
                accepted = true,
                streamState = "stopping",
                alreadyInDesiredState = false
            )
            idempotencyCache.put(cmd.commandId, ack)
            webSocket?.send(json.encodeToString(ack))

            scope.launch {
                executeRemoteStop(cmd.commandId, cmd.reason ?: "remote_request")
            }
        }
    }

    suspend fun startStreamingLocally(reason: String = "local_operator") {
        executeStart(commandId = null, reason = reason, isRemote = false)
    }

    suspend fun stopStreamingLocally(reason: String = "local_operator") {
        executeStop(commandId = null, reason = reason, isRemote = false)
    }

    private suspend fun executeRemoteStart(commandId: String, reason: String?) {
        executeStart(commandId = commandId, reason = reason, isRemote = true)
    }

    private suspend fun executeRemoteStop(commandId: String, reason: String) {
        executeStop(commandId = commandId, reason = reason, isRemote = true)
    }

    private suspend fun executeStart(commandId: String?, reason: String?, isRemote: Boolean) {
        val result = lifecycleController.start(
            StartStreamRequest(commandId = commandId, reason = reason, isRemote = isRemote)
        )

        when (result) {
            is StartResult.Success -> {
                streamStartTimeMs = System.currentTimeMillis()
                _state.value = TransportState.RegisteredStreaming

                // Guaranteed startup sequence:
                // 1. stream_started
                emitStreamStarted(commandId, result.generation)

                // 2. Send codec config if available
                val config = latestCodecConfig.get()
                if (config != null) {
                    sendCodecConfig(config, result.generation)
                }

                // 3. Request immediate keyframe
                onKeyframeRequested?.invoke()
            }

            is StartResult.Failure -> {
                _state.value = TransportState.RegisteredIdle
                lastErrorCode = result.reason
                val failedMsg = FreePlayControlMessage.StreamStartFailed(
                    commandId = commandId,
                    streamGeneration = result.generation,
                    streamState = "error",
                    reason = result.reason,
                    message = result.message,
                    retryable = result.retryable
                )
                webSocket?.send(json.encodeToString(failedMsg))
            }

            is StartResult.AlreadyInDesiredState -> {
                _state.value = TransportState.RegisteredStreaming
            }
        }
    }

    private suspend fun executeStop(commandId: String?, reason: String, isRemote: Boolean) {
        clearVideoQueue()
        val result = lifecycleController.stop(
            StopStreamRequest(commandId = commandId, reason = reason, isRemote = isRemote)
        )

        when (result) {
            is StopResult.Success -> {
                _state.value = TransportState.RegisteredIdle
                streamStartTimeMs = 0
                val stoppedMsg = FreePlayControlMessage.StreamStopped(
                    commandId = commandId,
                    streamGeneration = result.generation,
                    stoppedAtTabletMonotonicNs = result.stoppedAtNs.toString(),
                    reason = result.reason,
                    finalSequenceNumber = result.finalSequenceNumber,
                    streamState = "idle"
                )
                webSocket?.send(json.encodeToString(stoppedMsg))
            }

            is StopResult.Failure -> {
                _state.value = TransportState.RegisteredIdle
                lastErrorCode = result.reason
            }

            is StopResult.AlreadyInDesiredState -> {
                _state.value = TransportState.RegisteredIdle
            }
        }
    }

    private fun emitStreamStarted(commandId: String?, generation: Long) {
        val cfg = currentConfig ?: return
        val resolution = cfg.resolution.split("x")
        val width = resolution.getOrNull(0)?.toInt() ?: 1920
        val height = resolution.getOrNull(1)?.toInt() ?: 1080

        val startedMsg = FreePlayControlMessage.StreamStarted(
            commandId = commandId,
            streamGeneration = generation,
            startedAtTabletMonotonicNs = getMonotonicTimeNs().toString(),
            codec = "h264",
            width = width,
            height = height,
            fps = cfg.frameRate,
            bitrate = cfg.bitrate,
            keyframeInterval = cfg.keyframeInterval,
            encoder = _stats.value.encoder,
            ptsOriginUs = "0"
        )
        webSocket?.send(json.encodeToString(startedMsg))
        AppLog.d(TAG, "Sent stream_started for generation $generation")
    }

    private fun sendCodecConfig(config: AvcCodecConfig, generation: Long) {
        val payload = config.toAnnexBPayload()
        val header = FreePlayBinaryHeader(
            presentationTimeUs = config.presentationTimeUs,
            sequenceNumber = sequenceNumber++,
            flags = MediaCodec.BUFFER_FLAG_CODEC_CONFIG,
            payloadLength = payload.size,
            tabletMonotonicTimestampNs = getMonotonicTimeNs()
        )

        val headerBytes = header.serialize()
        val message = ByteBuffer.allocate(headerBytes.size + payload.size)
        message.put(headerBytes)
        message.put(payload)

        val sent = webSocket?.send(message.array().toByteString()) ?: false
        if (sent) {
            _bytesSent.value += payload.size
            _stats.value = _stats.value.copy(
                bytesTransmitted = _stats.value.bytesTransmitted + payload.size,
                lastSendTime = System.currentTimeMillis()
            )
            AppLog.d(TAG, "Sent codec configuration (${payload.size} bytes) for gen $generation")
        }
    }

    private fun clearVideoQueue() {
        while (videoQueue.tryReceive().isSuccess) {
            // Drain queue
        }
        queueBytes.set(0)
    }

    private fun startSenderLoop() {
        scope.launch {
            for (packet in videoQueue) {
                try {
                    streamingReady.await()
                } catch (e: Exception) {
                    queueBytes.addAndGet(-packet.payload.size.toLong())
                    continue
                }

                val currentGen = lifecycleController.generation.value
                val isStreaming = lifecycleController.state.value == StreamState.STREAMING

                if (packet.generation != currentGen || !isStreaming) {
                    queueBytes.addAndGet(-packet.payload.size.toLong())
                    continue
                }

                val headerBytes = packet.header.serialize()
                val message = ByteBuffer.allocate(headerBytes.size + packet.payload.size)
                message.put(headerBytes)
                message.put(packet.payload)

                val sent = webSocket?.send(message.array().toByteString()) ?: false
                if (sent) {
                    _bytesSent.value += packet.payload.size
                    _stats.value = _stats.value.copy(
                        bytesTransmitted = _stats.value.bytesTransmitted + packet.payload.size,
                        encodedBufferCount = _stats.value.encodedBufferCount + 1,
                        lastSendTime = System.currentTimeMillis()
                    )
                }
                queueBytes.addAndGet(-packet.payload.size.toLong())
            }
        }
    }

    private fun startStatusLoop() {
        scope.launch {
            var lastTime = System.currentTimeMillis()
            var lastBytes = 0L

            while (isActive) {
                delay(1000)

                if (_state.value !is TransportState.RegisteredIdle && _state.value !is TransportState.RegisteredStreaming) {
                    continue
                }

                val now = System.currentTimeMillis()
                val elapsed = now - lastTime
                val currentBytes = _bytesSent.value
                val bytesDiff = currentBytes - lastBytes

                val bitrate = if (elapsed > 0) (bytesDiff * 8.0) / (elapsed / 1000.0) else 0.0
                _currentBitrate.value = bitrate / 1_000_000.0

                val elapsedFps = getMonotonicTimeMs() - lastFpsCalcTime
                val fps = if (elapsedFps > 0) (framesSinceLastFpsCalc * 1000.0) / elapsedFps else 0.0
                framesSinceLastFpsCalc = 0
                lastFpsCalcTime = getMonotonicTimeMs()

                _stats.value = _stats.value.copy(
                    currentBitrate = bitrate / 1_000_000.0,
                    measuredFps = fps,
                    queueBytes = queueBytes.get(),
                    queueDepth = 0
                )

                val config = currentConfig
                val streamUptime = if (streamStartTimeMs > 0) now - streamStartTimeMs else 0L

                val status = FreePlayControlMessage.Status(
                    streamId = config?.streamId ?: "",
                    transportState = _state.value.wireName,
                    streamState = lifecycleController.state.value.wireName,
                    streamGeneration = lifecycleController.generation.value,
                    remoteControlEnabled = config?.remoteControlEnabled ?: true,
                    cameraPermission = if (cameraPermissionGranted) "granted" else "denied",
                    cameraState = cameraState,
                    encoderState = encoderState,
                    uptimeMs = now - (_stats.value.connectionStartTime.takeIf { it > 0 } ?: now),
                    streamUptimeMs = streamUptime,
                    encodedFrames = _stats.value.encodedBufferCount,
                    keyframes = _stats.value.keyframeCount,
                    bytesSent = currentBytes,
                    currentBitrate = bitrate,
                    averageBitrate = bitrate,
                    measuredFps = fps,
                    droppedFrames = _stats.value.droppedFrames.toInt(),
                    transportQueueBytes = queueBytes.get(),
                    transportQueueMessages = 0,
                    reconnectCount = reconnectCount,
                    network = "ethernet",
                    encoder = _stats.value.encoder,
                    lastCommandId = lastCommandId,
                    lastErrorCode = lastErrorCode
                )

                if (_state.value is TransportState.RegisteredIdle || _state.value is TransportState.RegisteredStreaming) {
                    webSocket?.send(json.encodeToString(status))
                }

                lastTime = now
                lastBytes = currentBytes
            }
        }
    }

    override suspend fun send(data: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (lifecycleController.state.value != StreamState.STREAMING) return

        val payload = ByteArray(info.size)
        val pos = data.position()
        data.position(info.offset)
        data.get(payload)
        data.position(pos)

        val header = FreePlayBinaryHeader(
            presentationTimeUs = info.presentationTimeUs,
            sequenceNumber = sequenceNumber++,
            flags = info.flags,
            payloadLength = info.size,
            tabletMonotonicTimestampNs = getMonotonicTimeNs()
        )

        // Backpressure check
        if (queueBytes.get() > MAX_QUEUED_VIDEO_BYTES) {
            AppLog.w(TAG, "Queue full, dropping frame")
            _stats.value = _stats.value.copy(droppedFrames = _stats.value.droppedFrames + 1)
            return
        }

        val currentGen = lifecycleController.generation.value
        val packet = VideoPacket(header, payload, currentGen)
        if (videoQueue.trySend(packet).isSuccess) {
            queueBytes.addAndGet(payload.size.toLong())
            framesSinceLastFpsCalc++
        } else {
            AppLog.w(TAG, "Queue send failed, dropping frame")
            _stats.value = _stats.value.copy(droppedFrames = _stats.value.droppedFrames + 1)
        }

        if ((info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0) {
            _stats.value = _stats.value.copy(keyframeCount = _stats.value.keyframeCount + 1)
        }
    }

    override suspend fun disconnect() {
        isActive = false
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        scope.cancel()
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        _state.value = TransportState.Disconnected
    }

    private fun getMonotonicTimeMs(): Long {
        return try {
            SystemClock.elapsedRealtime()
        } catch (e: Exception) {
            System.currentTimeMillis()
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
