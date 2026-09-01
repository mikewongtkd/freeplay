package net.opentkd.freeplay.network

import android.media.MediaCodec
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.opentkd.freeplay.settings.AppSettings
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicLong

class MockVideoTransport : VideoTransport {
    private val _state = MutableStateFlow<TransportState>(TransportState.STOPPED)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private val _bytesSent = MutableStateFlow(0L)
    override val bytesSent: StateFlow<Long> = _bytesSent.asStateFlow()

    private val _currentBitrate = MutableStateFlow(0.0)
    override val currentBitrate: StateFlow<Double> = _currentBitrate.asStateFlow()

    private var lastBitrateCalcTime = System.currentTimeMillis()
    private val bytesSinceLastCalc = AtomicLong(0)

    override suspend fun connect(config: AppSettings) {
        _state.value = TransportState.CONNECTING
        Log.d("FreePlay.Network", "Mock connecting to ${config.serverAddress}:${config.serverPort}")
        // Simulate a slight delay for connection
        kotlinx.coroutines.delay(500)
        _state.value = TransportState.STREAMING
        Log.d("FreePlay.Network", "Mock streaming started")
    }

    override suspend fun send(data: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (_state.value != TransportState.STREAMING) return

        val size = info.size
        _bytesSent.value += size
        bytesSinceLastCalc.addAndGet(size.toLong())

        val now = System.currentTimeMillis()
        val elapsed = now - lastBitrateCalcTime
        if (elapsed >= 1000) {
            val bytes = bytesSinceLastCalc.getAndSet(0)
            _currentBitrate.value = (bytes * 8.0) / (elapsed / 1000.0) / 1_000_000.0 // Mbps
            lastBitrateCalcTime = now
        }

        // In a real transport, we would send 'data' here.
        // For the mock, we just discard it.
    }

    override suspend fun disconnect() {
        _state.value = TransportState.STOPPED
        _currentBitrate.value = 0.0
        Log.d("FreePlay.Network", "Mock streaming stopped")
    }

    override fun setEncoderName(name: String) {}
}