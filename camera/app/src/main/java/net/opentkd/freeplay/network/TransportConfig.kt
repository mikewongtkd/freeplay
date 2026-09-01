package net.opentkd.freeplay.network

data class TransportConfig(
    val serverHost: String,
    val serverPort: Int,
    val useTls: Boolean = false,
    val ringNumber: Int,
    val cameraNumber: Int,
    val streamId: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val bitrate: Int,
    val keyframeIntervalSeconds: Int
)
