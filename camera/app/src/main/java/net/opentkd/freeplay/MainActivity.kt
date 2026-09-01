package net.opentkd.freeplay

import android.Manifest
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.opentkd.freeplay.camera.CameraController
import net.opentkd.freeplay.encoder.VideoEncoder
import net.opentkd.freeplay.network.WebSocketVideoTransport
import net.opentkd.freeplay.network.VideoTransport
import net.opentkd.freeplay.settings.AppSettings
import net.opentkd.freeplay.settings.SettingsRepository
import net.opentkd.freeplay.status.DeviceStatusManager
import net.opentkd.freeplay.ui.*
import net.opentkd.freeplay.ui.theme.FreePlayTheme

class MainActivity : ComponentActivity() {

    private lateinit var settingsRepository: SettingsRepository
    private lateinit var statusManager: DeviceStatusManager
    private lateinit var videoTransport: VideoTransport
    private lateinit var videoEncoder: VideoEncoder
    private lateinit var cameraController: CameraController

    private var statsJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        settingsRepository = SettingsRepository(this)
        statusManager = DeviceStatusManager(this)
        val wsTransport = WebSocketVideoTransport()
        videoTransport = wsTransport
        videoEncoder = VideoEncoder(videoTransport, statusManager)
        
        wsTransport.setKeyframeRequestListener {
            videoEncoder.requestKeyframe()
        }

        cameraController = CameraController(this, statusManager)

        enableEdgeToEdge()
        setContent {
            FreePlayTheme {
                MainScreen()
            }
        }

        startStatsUpdate()
    }

    @Composable
    fun MainScreen() {
        val settings by settingsRepository.appSettingsFlow.collectAsStateWithLifecycle(initialValue = AppSettings())
        val status by statusManager.status.collectAsStateWithLifecycle()
        val transportState by videoTransport.state.collectAsStateWithLifecycle()
        val bytesSent by videoTransport.bytesSent.collectAsStateWithLifecycle()
        val bitrate by videoTransport.currentBitrate.collectAsStateWithLifecycle()

        // Sync status manager with transport and settings
        LaunchedEffect(transportState, bytesSent, bitrate) {
            statusManager.updateStatus { it.copy(
                transportState = transportState,
                bytesTransmitted = bytesSent,
                bitrateMbps = bitrate,
                serverConnected = transportState is net.opentkd.freeplay.network.TransportState.STREAMING
            ) }
        }

        // Keep screen on and orientation
        LaunchedEffect(settings.keepScreenOn) {
            if (settings.keepScreenOn) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        LaunchedEffect(settings.lockLandscape) {
            requestedOrientation = if (settings.lockLandscape) {
                ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            } else {
                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }

        var selectedTab by remember { mutableIntStateOf(0) }
        val permissionsLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { isGranted ->
            if (!isGranted) {
                Toast.makeText(this, "Camera permission is required", Toast.LENGTH_LONG).show()
            }
        }

        LaunchedEffect(Unit) {
            permissionsLauncher.launch(Manifest.permission.CAMERA)
            statusManager.checkNetworkStatus()
        }

        Scaffold(
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        icon = { Icon(Icons.Default.Videocam, "Live") },
                        label = { Text("Live") }
                    )
                    NavigationBarItem(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        icon = { Icon(Icons.Default.Info, "Status") },
                        label = { Text("Status") }
                    )
                    NavigationBarItem(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        icon = { Icon(Icons.Default.NetworkCheck, "Network") },
                        label = { Text("Network") }
                    )
                    NavigationBarItem(
                        selected = selectedTab == 3,
                        onClick = { selectedTab = 3 },
                        icon = { Icon(Icons.Default.Settings, "Settings") },
                        label = { Text("Settings") }
                    )
                }
            }
        ) { innerPadding ->
            val screenModifier = Modifier.padding(innerPadding)
            when (selectedTab) {
                0 -> LiveScreen(
                    modifier = screenModifier,
                    settings = settings,
                    status = status,
                    onStartStreaming = { startStreaming(settings) },
                    onStopStreaming = { stopStreaming() },
                    onSnapshot = { takeSnapshot() },
                    onSurfaceCreated = { surface ->
                        val encoderSurface = videoEncoder.prepare(settings)
                        cameraController.startCamera(surface, encoderSurface)
                        videoEncoder.start()
                    }
                )
                1 -> StatusScreen(
                    modifier = screenModifier,
                    settings = settings,
                    status = status
                )
                2 -> NetworkScreen(
                    modifier = screenModifier,
                    settings = settings,
                    status = status
                )
                3 -> SettingsScreen(
                    modifier = screenModifier,
                    settings = settings,
                    onSettingsChanged = { lifecycleScope.launch { settingsRepository.updateSettings(it) } }
                )
            }
        }
    }

    private fun startStreaming(settings: AppSettings) {
        lifecycleScope.launch {
            videoTransport.connect(settings)
            statusManager.startSession()
        }
    }

    private fun stopStreaming() {
        lifecycleScope.launch {
            videoTransport.disconnect()
            statusManager.stopSession()
        }
    }

    private fun takeSnapshot() {
        Toast.makeText(this, "Snapshot saved (mock)", Toast.LENGTH_SHORT).show()
    }

    private fun startStatsUpdate() {
        statsJob = lifecycleScope.launch {
            while (true) {
                statusManager.updateUptime()
                delay(1000)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraController.stopCamera()
        videoEncoder.stop()
        statsJob?.cancel()
    }
}