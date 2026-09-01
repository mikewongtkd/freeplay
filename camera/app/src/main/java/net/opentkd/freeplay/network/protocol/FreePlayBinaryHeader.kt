package net.opentkd.freeplay.network.protocol

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Serialized layout (32 bytes, big-endian):
 * 0       4      "FPV1" (Magic)
 * 4       8      presentationTimeUs (PTS)
 * 12      4      sequenceNumber
 * 16      4      flags
 * 20      4      payloadLength
 * 24      8      tabletMonotonicTimestampNs
 */
data class FreePlayBinaryHeader(
    val presentationTimeUs: Long,
    val sequenceNumber: UInt,
    val flags: Int,
    val payloadLength: Int,
    val tabletMonotonicTimestampNs: Long
) {
    fun serialize(): ByteArray {
        val buffer = ByteBuffer.allocate(FreePlayProtocol.HEADER_SIZE)
        buffer.order(ByteOrder.BIG_ENDIAN)
        buffer.putInt(FreePlayProtocol.MAGIC)
        buffer.putLong(presentationTimeUs)
        buffer.putInt(sequenceNumber.toInt())
        buffer.putInt(flags)
        buffer.putInt(payloadLength)
        buffer.putLong(tabletMonotonicTimestampNs)
        return buffer.array()
    }
}
