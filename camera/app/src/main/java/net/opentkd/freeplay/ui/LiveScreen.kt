package net.opentkd.freeplay.ui

import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import net.opentkd.freeplay.network.StreamState
import net.opentkd.freeplay.network.TransportState
import net.opentkd.freeplay.settings.AppSettings
import net.opentkd.freeplay.status.DeviceStatus

@Composable
fun LiveScreen(
    settings: AppSettings,
    status: DeviceStatus,
    onStartStreaming: () -> Unit,
    onStopStreaming: () -> Unit,
    onSnapshot: () -> Unit,
    onSurfaceCreated: (Surface) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(modifier = modifier.fillMaxSize()) {
        // Main Preview Area
        Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
            AndroidView(
                factory = { context ->
                    SurfaceView(context).apply {
                        holder.addCallback(object : SurfaceHolder.Callback {
                            override fun surfaceCreated(holder: SurfaceHolder) {
                                onSurfaceCreated(holder.surface)
                            }
                            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}
                            override fun surfaceDestroyed(holder: SurfaceHolder) {}
                        })
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // Top Left Overlay
            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .background(Color.Black.copy(alpha = 0.5f))
                    .padding(8.dp)
            ) {
                Text(
                    text = "FreePlay Camera",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White
                )
                Text(
                    text = "RING ${settings.ringNumber} • CAM ${settings.cameraNumber}",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    text = "${settings.resolution} • ${settings.frameRate} fps • H.264",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White
                )

                if (status.isRemoteStarted) {
                    Spacer(Modifier.height(4.dp))
                    Surface(
                        color = Color(0xFF1976D2),
                        shape = MaterialTheme.shapes.extraSmall
                    ) {
                        Text(
                            text = "⚡ REMOTELY INITIATED",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Top Right Status Badges
            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                val (statusText, statusColor) = when {
                    status.streamState == StreamState.STARTING -> "STARTING" to Color.Yellow
                    status.streamState == StreamState.STOPPING -> "STOPPING" to Color(0xFFFF9800)
                    status.streamState == StreamState.STREAMING -> "STREAMING (Gen ${status.streamGeneration})" to Color.Green
                    status.transportState is TransportState.RegisteredIdle -> "CONNECTED / IDLE" to Color(0xFF2196F3)
                    status.transportState is TransportState.Connecting -> "CONNECTING" to Color.Yellow
                    status.transportState is TransportState.AwaitingHelloAck -> "WAITING ACK" to Color.Yellow
                    status.transportState is TransportState.Reconnecting -> {
                        val att = (status.transportState as TransportState.Reconnecting).attempt
                        "RECONNECT ($att)" to Color.Yellow
                    }
                    status.transportState is TransportState.Error || status.streamState == StreamState.ERROR -> "ERROR" to Color.Red
                    status.transportState is TransportState.Rejected -> "REJECTED" to Color.Red
                    else -> "DISCONNECTED" to Color.Gray
                }

                Surface(
                    color = statusColor,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = statusText,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.Black,
                        fontWeight = FontWeight.Bold
                    )
                }

                if (!settings.remoteControlEnabled) {
                    Surface(
                        color = Color.DarkGray,
                        shape = MaterialTheme.shapes.extraSmall
                    ) {
                        Text(
                            text = "Remote Control Disabled",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White
                        )
                    }
                }
            }

            // Bottom Controls
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                val isStreamingActive = status.streamState == StreamState.STREAMING ||
                        status.streamState == StreamState.STARTING ||
                        status.streamState == StreamState.STOPPING

                if (!isStreamingActive) {
                    Button(onClick = onStartStreaming, colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)) {
                        Icon(Icons.Default.PlayArrow, contentDescription = "Start")
                        Spacer(Modifier.width(8.dp))
                        Text("START STREAM")
                    }
                } else {
                    Button(onClick = onStopStreaming, colors = ButtonDefaults.buttonColors(containerColor = Color.Red)) {
                        Icon(Icons.Default.Stop, contentDescription = "Stop")
                        Spacer(Modifier.width(8.dp))
                        Text("STOP STREAM")
                    }
                }

                Button(onClick = {}, enabled = false, colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)) {
                    Icon(Icons.Default.Pause, contentDescription = "Pause")
                    Spacer(Modifier.width(8.dp))
                    Text("PAUSE")
                }

                Button(onClick = onSnapshot, colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)) {
                    Icon(Icons.Default.CameraAlt, contentDescription = "Snapshot")
                    Spacer(Modifier.width(8.dp))
                    Text("SNAPSHOT")
                }

                Button(onClick = {}, enabled = false, colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)) {
                    Icon(Icons.Default.Mic, contentDescription = "Mic")
                    Spacer(Modifier.width(8.dp))
                    Text("MIC")
                }
            }
        }

        // Right Status Panel
        Column(
            modifier = Modifier
                .width(220.dp)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text("STATUS", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            Text(
                when {
                    status.streamState == StreamState.STREAMING -> "Streaming (Gen ${status.streamGeneration})\n${settings.serverAddress}:${settings.serverPort}"
                    status.transportState is TransportState.RegisteredIdle -> "Registered Idle\n${settings.serverAddress}:${settings.serverPort}"
                    else -> "Disconnected / Stopped"
                },
                style = MaterialTheme.typography.bodySmall
            )

            Text("HEALTH", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            HealthItem("Camera", status.cameraReady)
            HealthItem("Encoder", status.encoderReady)
            HealthItem("Network", status.networkReady)
            HealthItem("Server", status.serverConnected)
            HealthItem("Storage", status.storageReady)

            Text("STATS", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            StatItem("Uptime", status.uptimeString)
            StatItem("Generation", status.streamGeneration.toString())
            StatItem("Bitrate", String.format("%.2f Mbps", status.bitrateMbps))
            StatItem("FPS", String.format("%.1f", status.fps))
            StatItem("Dropped", status.droppedFrames.toString())
            StatItem("Sent", formatBytes(status.bytesTransmitted))
        }
    }
}

@Composable
fun HealthItem(label: String, ok: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        Text(if (ok) "✓" else "✗", color = if (ok) Color.Green else Color.Red)
    }
}

@Composable
fun StatItem(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
    }
}

fun formatBytes(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val exp = (Math.log(bytes.toDouble()) / Math.log(1024.0)).toInt()
    val pre = "KMGTPE"[exp - 1]
    return String.format("%.1f %sB", bytes / Math.pow(1024.0, exp.toDouble()), pre)
}
