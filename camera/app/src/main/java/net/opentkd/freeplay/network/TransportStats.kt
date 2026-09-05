package net.opentkd.freeplay.network

data class TransportStats(
    val connectionStartTime: Long = 0,
    val encodedBufferCount: Long = 0,
    val keyframeCount: Int = 0,
    val bytesTransmitted: Long = 0,
    val currentBitrate: Double = 0.0,
    val averageBitrate: Double = 0.0,
    val measuredFps: Double = 0.0,
    val sequenceNumber: Long = 0,
    val reconnectCount: Int = 0,
    val queueBytes: Long = 0,
    val queueDepth: Int = 0,
    val droppedFrames: Long = 0,
    val lastSendTime: Long = 0,
    val lastServerMessageTime: Long = 0,
    val lastError: String? = null,
    val encoder: String = "None"
)
