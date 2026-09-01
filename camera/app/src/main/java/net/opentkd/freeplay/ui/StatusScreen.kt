package net.opentkd.freeplay.ui

import android.os.Build
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import net.opentkd.freeplay.settings.AppSettings
import net.opentkd.freeplay.status.DeviceStatus

@Composable
fun StatusScreen(
    settings: AppSettings,
    status: DeviceStatus,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding( all=16.dp )
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        SectionTitle("Device Information")
        InfoItem("Device Model", Build.MODEL)
        InfoItem("Android Version", Build.VERSION.RELEASE)
        InfoItem("App Version", "1.0.0-prototype")
        InfoItem("Stream ID", settings.streamId)
        InfoItem("Uptime", status.uptimeString)

        HorizontalDivider()

        SectionTitle("Stream Information")
        InfoItem("Server", "${settings.serverAddress}:${settings.serverPort}")
        InfoItem("Protocol", "UDP")
        InfoItem("Resolution", settings.resolution)
        InfoItem("Target FPS", settings.frameRate.toString())
        InfoItem("Target Bitrate", "${settings.bitrate / 1_000_000} Mbps")
        InfoItem("Encoder", status.encoderName)
        InfoItem("HW Accelerated", if (status.isHardwareAccelerated) "Yes" else "No")

        HorizontalDivider()

        SectionTitle("Health")
        HealthStatusItem("Camera", status.cameraReady)
        HealthStatusItem("Encoder", status.encoderReady)
        HealthStatusItem("Network", status.networkReady)
        HealthStatusItem("Server Connection", status.serverConnected)
        InfoItem("Frame Drops", status.droppedFrames.toString())
    }
}

@Composable
fun SectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Bold
    )
}

@Composable
fun InfoItem(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun HealthStatusItem(label: String, ok: Boolean) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Text(
            text = if (ok) "OK" else "ERROR",
            color = if (ok) Color.Green else Color.Red,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold
        )
    }
}