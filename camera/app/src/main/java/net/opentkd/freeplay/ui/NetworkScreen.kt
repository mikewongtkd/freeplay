package net.opentkd.freeplay.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import net.opentkd.freeplay.settings.AppSettings

@Composable
fun NetworkScreen(
    settings: AppSettings,
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
        InfoItem("Connection Type", "Ethernet (Preferred)")
        InfoItem("IP Address", "Determining...")
        InfoItem("Link State", "Active")

        HorizontalDivider()

        SectionTitle("Streaming Configuration (SRT)")
        InfoItem("Protocol", "SRT")
        InfoItem("Mode", "Caller")
        InfoItem("Server Address", settings.serverAddress)
        InfoItem("Port", settings.serverPort.toString())
        InfoItem("Latency", "Not implemented in prototype")
        InfoItem("Packet Loss", "Not implemented in prototype")
    }
}