package net.opentkd.freeplay.status

import net.opentkd.freeplay.network.TransportState

data class DeviceStatus(
    val cameraReady: Boolean = false,
    val encoderReady: Boolean = false,
    val networkReady: Boolean = false,
    val serverConnected: Boolean = false,
    val storageReady: Boolean = true,
    val transportState: TransportState = TransportState.STOPPED,
    val uptimeMillis: Long = 0,
    val bitrateMbps: Double = 0.0,
    val fps: Double = 0.0,
    val droppedFrames: Long = 0,
    val bytesTransmitted: Long = 0,
    val encoderName: String = "None",
    val isHardwareAccelerated: Boolean = false,
    val resolution: String = "Unknown",
    val frameCount: Long = 0,
    val keyframeCount: Int = 0
) {
    val uptimeString: String
        get() {
            val totalSeconds = uptimeMillis / 1000
            val hours = totalSeconds / 3600
            val minutes = (totalSeconds % 3600) / 60
            val seconds = totalSeconds % 60
            return String.format("%02d:%02d:%02d", hours, minutes, seconds)
        }
}