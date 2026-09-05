package net.opentkd.freeplay.encoder

import android.media.MediaCodec
import android.os.SystemClock
import net.opentkd.freeplay.network.protocol.FreePlayBinaryHeader
import java.nio.ByteBuffer

data class AvcCodecConfig(
    val sps: ByteArray,
    val pps: ByteArray,
    val presentationTimeUs: Long = 0
) {
    fun toAnnexBPayload(): ByteArray {
        val startCode = byteArrayOf(0, 0, 0, 1)
        val totalSize = startCode.size + sps.size + startCode.size + pps.size
        val buffer = ByteBuffer.allocate(totalSize)
        buffer.put(startCode)
        buffer.put(sps)
        buffer.put(startCode)
        buffer.put(pps)
        return buffer.array()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is AvcCodecConfig) return false
        if (!sps.contentEquals(other.sps)) return false
        if (!pps.contentEquals(other.pps)) return false
        return true
    }

    override fun hashCode(): Int {
        var result = sps.contentHashCode()
        result = 31 * result + pps.contentHashCode()
        return result
    }
}

object AvcNormalization {
    private val START_CODE_4 = byteArrayOf(0, 0, 0, 1)
    private val START_CODE_3 = byteArrayOf(0, 0, 1)

    fun stripStartCode(data: ByteArray): ByteArray {
        if (data.size >= 4 && data.sliceArray(0..3).contentEquals(START_CODE_4)) {
            return data.sliceArray(4 until data.size)
        }
        if (data.size >= 3 && data.sliceArray(0..2).contentEquals(START_CODE_3)) {
            return data.sliceArray(3 until data.size)
        }
        return data
    }

    /**
     * Parses a combined SPS/PPS buffer which might contain start codes.
     * Common in onOutputBufferAvailable with BUFFER_FLAG_CODEC_CONFIG.
     */
    fun parseCombined(data: ByteArray): Pair<ByteArray, ByteArray>? {
        // This is a simple implementation that looks for start codes to split SPS/PPS
        // A more robust implementation would actually parse the NAL unit types.
        val offsets = mutableListOf<Int>()
        var i = 0
        while (i <= data.size - 3) {
            if (data[i] == 0.toByte() && data[i+1] == 0.toByte()) {
                if (data[i+2] == 1.toByte()) {
                    offsets.add(i)
                    i += 3
                    continue
                } else if (i <= data.size - 4 && data[i+2] == 0.toByte() && data[i+3] == 1.toByte()) {
                    offsets.add(i)
                    i += 4
                    continue
                }
            }
            i++
        }

        if (offsets.isEmpty()) return null

        val nals = mutableListOf<ByteArray>()
        for (idx in offsets.indices) {
            val start = offsets[idx]
            val end = if (idx + 1 < offsets.size) offsets[idx + 1] else data.size
            
            // Strip the start code from this NAL
            val length = if (data[start+2] == 1.toByte()) 3 else 4
            nals.add(data.sliceArray((start + length) until end))
        }

        // Usually SPS is 7, PPS is 8.
        // For simplicity, we assume the first is SPS and second is PPS if we found at least 2.
        if (nals.size >= 2) {
            return Pair(nals[0], nals[1])
        }
        
        return null
    }
}
