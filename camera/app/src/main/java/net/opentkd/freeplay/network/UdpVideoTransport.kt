package net.opentkd.freeplay.network

import android.media.MediaCodec
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import net.opentkd.freeplay.settings.AppSettings
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicLong

/**
 * A real UDP transport implementation that sends raw H.264 NAL units over the network.
 * Suitable for low-latency local network streaming where minor packet loss is acceptable.
 */
class UdpVideoTransport : VideoTransport {
    private val _state = MutableStateFlow<TransportState>(TransportState.STOPPED)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private val _bytesSent = MutableStateFlow(0L)
    override val bytesSent: StateFlow<Long> = _bytesSent.asStateFlow()

    private val _currentBitrate = MutableStateFlow(0.0)
    override val currentBitrate: StateFlow<Double> = _currentBitrate.asStateFlow()

    private var socket: DatagramSocket? = null
    private var address: InetAddress? = null
    private var port: Int = 0

    private var lastBitrateCalcTime = System.currentTimeMillis()
    private val bytesSinceLastCalc = AtomicLong(0)

    override suspend fun connect(config: AppSettings) {
        withContext(Dispatchers.IO) {
            try {
                _state.value = TransportState.CONNECTING
                Log.d("FreePlay.Network", "Connecting UDP to ${config.serverAddress}:${config.serverPort}")
                
                address = InetAddress.getByName(config.serverAddress)
                port = config.serverPort
                socket = DatagramSocket()
                
                _state.value = TransportState.STREAMING
                Log.d("FreePlay.Network", "UDP Transport streaming to ${config.serverAddress}")
            } catch (e: Exception) {
                Log.e("FreePlay.Network", "Failed to connect UDP", e)
                _state.value = TransportState.ERROR(e.message ?: "Unknown error")
            }
        }
    }

    override suspend fun send(data: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (_state.value != TransportState.STREAMING) return
        val currentSocket = socket ?: return
        val currentAddress = address ?: return

        withContext(Dispatchers.IO) {
            try {
                val size = info.size
                if (size <= 0) return@withContext

                // Check for UDP packet size limit (max ~65KB)
                if (size > 65507) {
                    Log.w("FreePlay.Network", "Frame size ($size bytes) exceeds UDP packet limit!")
                }

                val buffer = ByteArray(size)
                val originalPosition = data.position()
                data.position(info.offset)
                data.get(buffer, 0, size)
                data.position(originalPosition) // Restore position

                val packet = DatagramPacket(buffer, size, currentAddress, port)
                currentSocket.send(packet)

                _bytesSent.value += size
                bytesSinceLastCalc.addAndGet(size.toLong())

                val now = System.currentTimeMillis()
                val elapsed = now - lastBitrateCalcTime
                if (elapsed >= 1000) {
                    val bytes = bytesSinceLastCalc.getAndSet(0)
                    _currentBitrate.value = (bytes * 8.0) / (elapsed / 1000.0) / 1_000_000.0 // Mbps
                    lastBitrateCalcTime = now
                }
            } catch (e: Exception) {
                Log.e("FreePlay.Network", "Error sending UDP packet", e)
                // In UDP, we don't necessarily stop the whole stream on one send error
            }
        }
    }

    override suspend fun disconnect() {
        withContext(Dispatchers.IO) {
            try {
                socket?.close()
                socket = null
                address = null
                _state.value = TransportState.STOPPED
                _currentBitrate.value = 0.0
                Log.d("FreePlay.Network", "UDP Transport stopped")
            } catch (e: Exception) {
                Log.e("FreePlay.Network", "Error during disconnect", e)
            }
        }
    }

    override fun setEncoderName(name: String) {}
}
