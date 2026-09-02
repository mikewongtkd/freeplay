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
import net.opentkd.freeplay.network.protocol.FreePlayBinaryHeader
import net.opentkd.freeplay.network.protocol.FreePlayControlMessage
import net.opentkd.freeplay.network.protocol.FreePlayProtocol
import net.opentkd.freeplay.settings.AppSettings
import okhttp3.*
import okio.ByteString.Companion.toByteString
import java.nio.ByteBuffer
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

class WebSocketVideoTransport : VideoTransport {
    private val TAG = "FreePlay/Transport"
    
    private val _state = MutableStateFlow<TransportState>(TransportState.STOPPED)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private val _bytesSent = MutableStateFlow(0L)
    override val bytesSent: StateFlow<Long> = _bytesSent.asStateFlow()

    private val _currentBitrate = MutableStateFlow(0.0)
    override val currentBitrate: StateFlow<Double> = _currentBitrate.asStateFlow()

    private val _stats = MutableStateFlow(TransportStats())
    val stats: StateFlow<TransportStats> = _stats.asStateFlow()

    private val client = OkHttpClient.Builder()
        .pingInterval(5, TimeUnit.SECONDS)
        .build()
    
    private var webSocket: WebSocket? = null
    private var scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private var sequenceNumber = 0u
    private var reconnectCount = 0
    private var isActive = false
    private var currentConfig: AppSettings? = null
    
    private val videoQueue = Channel<VideoPacket>(MAX_QUEUED_VIDEO_MESSAGES)
    private var queueBytes = AtomicLong(0)
    
    private var lastFpsCalcTime = SystemClock.elapsedRealtime()
    private var framesSinceLastFpsCalc = 0

    private var onKeyframeRequested: (() -> Unit)? = null

    private val json = Json { ignoreUnknownKeys = true }

    companion object {
        private const val MAX_QUEUED_VIDEO_MESSAGES = 100
        private const val MAX_QUEUED_VIDEO_BYTES = 5 * 1024 * 1024 // 5MB
    }

    private data class VideoPacket(
        val header: FreePlayBinaryHeader,
        val payload: ByteArray
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is VideoPacket) return false
            if (header != other.header) return false
            if (!payload.contentEquals(other.payload)) return false
            return true
        }
        override fun hashCode(): Int {
            var result = header.hashCode()
            result = 31 * result + payload.contentHashCode()
            return result
        }
    }

    override fun setEncoderName(name: String) {
        _stats.value = _stats.value.copy(encoder = name)
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
            Log.d(TAG, "Starting connection loop")
            while (isActive) {
                val config = currentConfig ?: run {
                    Log.e(TAG, "No config available, exiting connection loop")
                    break
                }
                val url = "ws://${config.serverAddress}:${config.serverPort}"
                
                Log.d(TAG, "Connecting to $url")
                _state.value = TransportState.CONNECTING
                
                try {
                    val request = Request.Builder().url(url).build()
                    webSocket = client.newWebSocket(request, createWebSocketListener())
                    Log.d(TAG, "WebSocket connection request initiated")
                } catch (e: Exception) {
                    Log.e(TAG, "Error initiating WebSocket connection", e)
                    _state.value = TransportState.ERROR(e.message ?: "Unknown init error")
                }
                
                // Wait until disconnected or stopped
                while (isActive && _state.value !is TransportState.STOPPED && _state.value !is TransportState.ERROR && _state.value !is TransportState.REJECTED) {
                    delay(1000)
                }
                
                if (isActive && (_state.value is TransportState.ERROR || _state.value is TransportState.STOPPED)) {
                    // Decide if we should reconnect
                    if (_state.value is TransportState.REJECTED) break
                    
                    reconnectCount++
                    val delayMs = when {
                        reconnectCount == 1 -> 1000L
                        reconnectCount == 2 -> 2000L
                        else -> 5000L
                    }
                    Log.d(TAG, "Reconnecting in $delayMs ms (attempt $reconnectCount)")
                    _state.value = TransportState.RECONNECTING(reconnectCount)
                    delay(delayMs)
                } else {
                    break
                }
            }
        }
    }

    private fun createWebSocketListener() = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket Opened")
            _state.value = TransportState.AWAITING_HELLO_ACK
            _stats.value = _stats.value.copy(connectionStartTime = System.currentTimeMillis())
            sendHello(webSocket)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = json.decodeFromString<FreePlayControlMessage>(text)
                handleControlMessage(message)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse JSON message: $text", e)
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket Closing: $code / $reason")
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket Closed")
            if (isActive) _state.value = TransportState.ERROR("Closed by server")
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket Failure", t)
            if (isActive) _state.value = TransportState.ERROR(t.message ?: "Unknown failure")
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
            device = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            androidVersion = Build.VERSION.RELEASE,
            appVersion = "1.0.0",
            codec = "h264",
            width = width,
            height = height,
            fps = config.frameRate,
            bitrate = config.bitrate,
            keyframeInterval = config.keyframeInterval,
            encoder = _stats.value.encoder
        )
        ws.send(json.encodeToString(hello))
        Log.d(TAG, "Hello sent")
    }

    private fun handleControlMessage(message: FreePlayControlMessage) {
        when (message) {
            is FreePlayControlMessage.HelloAck -> {
                if (message.accepted) {
                    Log.d(TAG, "Hello accepted")
                    _state.value = TransportState.STREAMING
                    sequenceNumber = 0u
                } else {
                    Log.e(TAG, "Hello rejected: ${message.reason}")
                    _state.value = TransportState.REJECTED(message.reason ?: "Unknown reason")
                }
            }
            is FreePlayControlMessage.RequestKeyframe -> {
                Log.d(TAG, "Server requested keyframe")
                onKeyframeRequested?.invoke()
            }
            is FreePlayControlMessage.Ping -> {
                webSocket?.send(json.encodeToString(FreePlayControlMessage.Pong(id = message.id)))
            }
            else -> {}
        }
    }

    private fun startSenderLoop() {
        scope.launch {
            for (packet in videoQueue) {
                if (_state.value !is TransportState.STREAMING) {
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
                if (_state.value !is TransportState.STREAMING) continue
                
                val now = System.currentTimeMillis()
                val elapsed = now - lastTime
                val currentBytes = _bytesSent.value
                val bytesDiff = currentBytes - lastBytes
                
                val bitrate = (bytesDiff * 8.0) / (elapsed / 1000.0) / 1_000_000.0
                _currentBitrate.value = bitrate

                // Calculate measured FPS
                val elapsedFps = SystemClock.elapsedRealtime() - lastFpsCalcTime
                val fps = (framesSinceLastFpsCalc * 1000.0) / elapsedFps
                framesSinceLastFpsCalc = 0
                lastFpsCalcTime = SystemClock.elapsedRealtime()
                
                _stats.value = _stats.value.copy(
                    currentBitrate = bitrate,
                    measuredFps = fps,
                    queueBytes = queueBytes.get(),
                    queueDepth = 0 // Channel doesn't expose depth easily without custom tracking
                )

                val status = FreePlayControlMessage.Status(
                    streamId = currentConfig?.streamId ?: "",
                    uptimeMs = now - (_stats.value.connectionStartTime.takeIf { it > 0 } ?: now),
                    encodedFrames = _stats.value.encodedBufferCount,
                    keyframes = _stats.value.keyframeCount,
                    bytesSent = currentBytes,
                    currentBitrate = bitrate,
                    averageBitrate = bitrate,
                    measuredFps = fps,
                    droppedFrames = 0,
                    transportQueueBytes = queueBytes.get(),
                    reconnectCount = reconnectCount,
                    network = "ethernet",
                    encoder = _stats.value.encoder
                )
                webSocket?.send(json.encodeToString(status))
                
                lastTime = now
                lastBytes = currentBytes
            }
        }
    }

    override suspend fun send(data: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (_state.value !is TransportState.STREAMING) return
        
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
            tabletMonotonicTimestampNs = SystemClock.elapsedRealtimeNanos()
        )
        
        // Backpressure check
        if (queueBytes.get() > MAX_QUEUED_VIDEO_BYTES) {
            Log.w(TAG, "Queue full, dropping frame")
            return
        }
        
        queueBytes.addAndGet(payload.size.toLong())
        videoQueue.trySend(VideoPacket(header, payload))
        framesSinceLastFpsCalc++
        
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
        _state.value = TransportState.STOPPED
    }
}
