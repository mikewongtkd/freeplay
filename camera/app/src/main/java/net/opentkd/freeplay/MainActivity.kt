package net.opentkd.freeplay

import android.Manifest
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
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
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import net.opentkd.freeplay.camera.CameraController
import net.opentkd.freeplay.encoder.VideoEncoder
import net.opentkd.freeplay.network.StreamState
import net.opentkd.freeplay.network.TransportState
import net.opentkd.freeplay.network.WebSocketVideoTransport
import net.opentkd.freeplay.service.CameraStreamService
import net.opentkd.freeplay.settings.AppSettings
import net.opentkd.freeplay.settings.SettingsRepository
import net.opentkd.freeplay.status.DeviceStatusManager
import net.opentkd.freeplay.ui.*
import net.opentkd.freeplay.ui.theme.FreePlayTheme

class MainActivity : ComponentActivity() {

    private lateinit var settingsRepository: SettingsRepository
    private lateinit var statusManager: DeviceStatusManager
    private lateinit var wsTransport: WebSocketVideoTransport
    private lateinit var videoEncoder: VideoEncoder
    private lateinit var cameraController: CameraController

    private var statsJob: Job? = null
    private var currentAppSettings = AppSettings()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        settingsRepository = SettingsRepository(this)
        statusManager = DeviceStatusManager(this)

        wsTransport = WebSocketVideoTransport()
        videoEncoder = VideoEncoder(wsTransport, statusManager)
        cameraController = CameraController(this, statusManager)

        wsTransport.setKeyframeRequestListener {
            videoEncoder.requestKeyframe()
        }

        // Setup pipeline callbacks for remote/local lifecycle
        wsTransport.setPipelineCallbacks(
            onStartPipeline = { generation ->
                val encoderSurface = videoEncoder.prepare(currentAppSettings)
                cameraController.setEncoderSurface(encoderSurface)
                videoEncoder.start()
            },
            onStopPipeline = { generation ->
                videoEncoder.stop()
                cameraController.setEncoderSurface(null)
                wsTransport.stats.value.sequenceNumber
            }
        )

        // Observe settings
        lifecycleScope.launch {
            settingsRepository.appSettingsFlow.collect { settings ->
                currentAppSettings = settings
            }
        }

        // Observe transport stats, state, and stream lifecycle
        lifecycleScope.launch {
            wsTransport.stats.collect { stats ->
                statusManager.updateStatus { it.copy(
                    bytesTransmitted = stats.bytesTransmitted,
                    bitrateMbps = stats.currentBitrate,
                    fps = stats.measuredFps,
                    droppedFrames = stats.droppedFrames
                ) }
            }
        }
        lifecycleScope.launch {
            wsTransport.state.collect { state ->
                statusManager.updateStatus { it.copy(
                    transportState = state,
                    serverConnected = state is TransportState.RegisteredIdle || state is TransportState.RegisteredStreaming
                ) }
            }
        }
        lifecycleScope.launch {
            wsTransport.streamState.collect { sState ->
                statusManager.updateStatus { it.copy(
                    streamState = sState,
                    encoderReady = sState == StreamState.STREAMING
                ) }
            }
        }
        lifecycleScope.launch {
            wsTransport.streamGeneration.collect { gen ->
                statusManager.updateStatus { it.copy(streamGeneration = gen) }
            }
        }
        lifecycleScope.launch {
            wsTransport.lifecycleController.isRemotelyInitiated.collect { remote ->
                statusManager.updateStatus { it.copy(isRemoteStarted = remote) }
            }
        }

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
        val transportState by wsTransport.state.collectAsStateWithLifecycle()
        val bytesSent by wsTransport.bytesSent.collectAsStateWithLifecycle()
        val bitrate by wsTransport.currentBitrate.collectAsStateWithLifecycle()

        // Sync permission status to transport
        val hasCameraPermission = ContextCompat.checkSelfPermission(
            this, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        wsTransport.cameraPermissionGranted = hasCameraPermission

        // Sync status manager
        LaunchedEffect(transportState, bytesSent, bitrate) {
            statusManager.updateStatus { it.copy(
                transportState = transportState,
                bytesTransmitted = bytesSent,
                bitrateMbps = bitrate,
                serverConnected = transportState is TransportState.RegisteredIdle || transportState is TransportState.RegisteredStreaming
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
            wsTransport.cameraPermissionGranted = isGranted
            if (!isGranted) {
                Toast.makeText(this, "Camera permission is required", Toast.LENGTH_LONG).show()
            }
        }

        LaunchedEffect(Unit) {
            permissionsLauncher.launch(Manifest.permission.CAMERA)
            statusManager.checkNetworkStatus()
            // Auto connect control WebSocket to server
            startControlConnection(settingsRepository.appSettingsFlow.first())
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
                    onStartStreaming = { startStreamingLocally() },
                    onStopStreaming = { stopStreamingLocally() },
                    onSnapshot = { takeSnapshot() },
                    onSurfaceCreated = { surface ->
                        cameraController.startCamera(surface, null)
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
                    onSettingsChanged = { updated ->
                        lifecycleScope.launch { settingsRepository.updateSettings(updated) }
                    }
                )
            }
        }
    }

    private fun startControlConnection(settings: AppSettings) {
        lifecycleScope.launch {
            CameraStreamService.startService(this@MainActivity)
            wsTransport.connect(settings)
            statusManager.startSession()
        }
    }

    private fun startStreamingLocally() {
        lifecycleScope.launch {
            wsTransport.startStreamingLocally()
        }
    }

    private fun stopStreamingLocally() {
        lifecycleScope.launch {
            wsTransport.stopStreamingLocally()
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
        CameraStreamService.stopService(this)
    }
}
