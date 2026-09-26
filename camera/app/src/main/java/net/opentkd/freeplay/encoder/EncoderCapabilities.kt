package net.opentkd.freeplay.encoder

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
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
            Log.d(TAG, "Found AVC encoder: ${info.name}, hardware: ${isHardware(info)}")
        }

        return candidates.find { isHardware(it) } ?: candidates.firstOrNull()
    }

    fun isHardware(info: MediaCodecInfo): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            info.isHardwareAccelerated
        } else {
            !info.name.startsWith("OMX.google.") && !info.name.startsWith("c2.android.")
        }
    }

    fun isResolutionSupported(encoder: MediaCodecInfo, width: Int, height: Int): Boolean {
        val capabilities = encoder.getCapabilitiesForType(MIME_TYPE)
        val videoCapabilities = capabilities.videoCapabilities
        return videoCapabilities?.isSizeSupported(width, height) ?: false
    }
}
