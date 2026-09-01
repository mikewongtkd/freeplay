package net.opentkd.freeplay.settings

import kotlinx.serialization.Serializable

@Serializable
data class AppSettings(
    val ringNumber: Int = 1,
    val cameraNumber: Int = 1,
    val resolution: String = "1920x1080",
    val frameRate: Int = 30,
    val bitrate: Int = 6000000,
    val keyframeInterval: Int = 1,
    val serverAddress: String = "10.0.0.50",
    val serverPort: Int = 9000,
    val autoStartCamera: Boolean = true,
    val autoStartStreaming: Boolean = false,
    val keepScreenOn: Boolean = true,
    val lockLandscape: Boolean = true
) {
    val streamId: String
        get() = "ring${ringNumber}_cam${cameraNumber}"
}