package net.opentkd.freeplay.network

import android.media.MediaCodec
import kotlinx.coroutines.flow.StateFlow
import net.opentkd.freeplay.encoder.AvcCodecConfig
import net.opentkd.freeplay.settings.AppSettings
import java.nio.ByteBuffer

interface VideoTransport {
    val state: StateFlow<TransportState>
    val streamState: StateFlow<StreamState>
    val streamGeneration: StateFlow<Long>
    val bytesSent: StateFlow<Long>
    val currentBitrate: StateFlow<Double>
    val stats: StateFlow<TransportStats>

    suspend fun connect(config: AppSettings)
    suspend fun send(
        data: ByteBuffer,
        info: MediaCodec.BufferInfo
    )
    suspend fun disconnect()

    fun setEncoderName(name: String)
    fun updateCodecConfig(config: AvcCodecConfig)
}
