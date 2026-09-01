package net.opentkd.freeplay.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import net.opentkd.freeplay.settings.AppSettings

@Composable
fun SettingsScreen(
    settings: AppSettings,
    onSettingsChanged: (AppSettings) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        SectionTitle("Camera")
        SettingTextField("Resolution", settings.resolution) { onSettingsChanged(settings.copy(resolution = it)) }
        SettingTextField("FPS", settings.frameRate.toString(), KeyboardType.Number) { 
            onSettingsChanged(settings.copy(frameRate = it.toIntOrNull() ?: settings.frameRate)) 
        }

        HorizontalDivider()

        SectionTitle("Stream")
        SettingTextField("Target Bitrate (bps)", settings.bitrate.toString(), KeyboardType.Number) {
            onSettingsChanged(settings.copy(bitrate = it.toIntOrNull() ?: settings.bitrate))
        }
        SettingTextField("Server Address", settings.serverAddress) { onSettingsChanged(settings.copy(serverAddress = it)) }
        SettingTextField("Server Port", settings.serverPort.toString(), KeyboardType.Number) {
            onSettingsChanged(settings.copy(serverPort = it.toIntOrNull() ?: settings.serverPort))
        }
        SettingTextField("Ring Number", settings.ringNumber.toString(), KeyboardType.Number) {
            onSettingsChanged(settings.copy(ringNumber = it.toIntOrNull() ?: settings.ringNumber))
        }
        SettingTextField("Camera Number", settings.cameraNumber.toString(), KeyboardType.Number) {
            onSettingsChanged(settings.copy(cameraNumber = it.toIntOrNull() ?: settings.cameraNumber))
        }

        HorizontalDivider()

        SectionTitle("System")
        SettingSwitch("Auto-start Camera", settings.autoStartCamera) { onSettingsChanged(settings.copy(autoStartCamera = it)) }
        SettingSwitch("Keep Screen On", settings.keepScreenOn) { onSettingsChanged(settings.copy(keepScreenOn = it)) }
        SettingSwitch("Lock Landscape", settings.lockLandscape) { onSettingsChanged(settings.copy(lockLandscape = it)) }
    }
}

@Composable
fun SettingTextField(label: String, value: String, keyboardType: KeyboardType = KeyboardType.Text, onValueChange: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = text,
        onValueChange = { 
            text = it
            onValueChange(it)
        },
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType)
    )
}

@Composable
fun SettingSwitch(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}