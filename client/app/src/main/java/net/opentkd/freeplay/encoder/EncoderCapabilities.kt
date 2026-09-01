package net.opentkd.freeplay.encoder

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.util.Log

data class EncoderInfo(
    val name: String,
    val isHardwareAccelerated: Boolean,
    val supportedProfiles: List<Int>
)

object EncoderCapabilities {
    private const val TAG = "FreePlay.Encoder"
    private const val MIME_TYPE = "video/avc"

    fun findHardwareEncoder(): MediaCodecInfo? {
        val codecList = MediaCodecList(MediaCodecList.ALL_CODECS)
        val codecInfos = codecList.codecInfos

        val candidates = codecInfos.filter { it.isEncoder && it.supportedTypes.contains(MIME_TYPE) }
        
        candidates.forEach { info ->
            Log.d(TAG, "Found AVC encoder: ${info.name}, hardware: ${info.isHardwareAccelerated}")
        }

        return candidates.find { it.isHardwareAccelerated } ?: candidates.firstOrNull()
    }

    fun isResolutionSupported(encoder: MediaCodecInfo, width: Int, height: Int): Boolean {
        val capabilities = encoder.getCapabilitiesForType(MIME_TYPE)
        val videoCapabilities = capabilities.videoCapabilities
        return videoCapabilities?.isSizeSupported(width, height) ?: false
    }
}