package net.opentkd.freeplay.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import net.opentkd.freeplay.settings.AppSettings
import net.opentkd.freeplay.status.DeviceStatus
import java.util.Locale

@Composable
fun NetworkScreen(
    settings: AppSettings,
    status: DeviceStatus,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        SectionTitle("Network Interface")
        InfoItem("Connection State", if (status.networkReady) "Active" else "Inactive")
        InfoItem("Link Type", "WebSocket")

        HorizontalDivider()

        SectionTitle("Streaming Configuration")
        InfoItem("Protocol", "TCP/IP")
        InfoItem("Destination Address", settings.serverAddress)
        InfoItem("Destination Port", settings.serverPort.toString())
        
        HorizontalDivider()

        SectionTitle("Network Stats")
        InfoItem("Current Bitrate", String.format(Locale.US, "%.2f Mbps", status.bitrateMbps))
        InfoItem("Total Sent", formatBytes(status.bytesTransmitted))
        InfoItem("Server Connected", if (status.serverConnected) "YES" else "NO")
    }
}
