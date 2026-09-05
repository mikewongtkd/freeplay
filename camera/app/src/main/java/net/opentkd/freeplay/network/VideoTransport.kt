package net.opentkd.freeplay.network

import android.media.MediaCodec
import kotlinx.coroutines.flow.StateFlow
import net.opentkd.freeplay.encoder.AvcCodecConfig
import net.opentkd.freeplay.settings.AppSettings
import java.nio.ByteBuffer

interface VideoTransport {
    suspend fun connect(config: AppSettings)
    suspend fun send(
        data: ByteBuffer,
        info: MediaCodec.BufferInfo
    )
    suspend fun disconnect()
    val state: StateFlow<TransportState>
    val bytesSent: StateFlow<Long>
    val currentBitrate: StateFlow<Double>

    fun setEncoderName(name: String)
    fun updateCodecConfig(config: AvcCodecConfig)
}