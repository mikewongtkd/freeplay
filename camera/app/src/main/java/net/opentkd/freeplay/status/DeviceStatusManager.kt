package net.opentkd.freeplay.status

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class DeviceStatusManager(private val context: Context) {
    private val _status = MutableStateFlow(DeviceStatus())
    val status: StateFlow<DeviceStatus> = _status.asStateFlow()

    private var sessionStartTime: Long = 0

    fun startSession() {
        sessionStartTime = System.currentTimeMillis()
        updateUptime()
    }

    fun stopSession() {
        sessionStartTime = 0
        updateStatus { it.copy(uptimeMillis = 0) }
    }

    fun updateUptime() {
        if (sessionStartTime > 0) {
            val uptime = System.currentTimeMillis() - sessionStartTime
            updateStatus { it.copy(uptimeMillis = uptime) }
        }
    }

    fun updateStatus(updater: (DeviceStatus) -> DeviceStatus) {
        _status.update(updater)
    }

    fun checkNetworkStatus() {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val capabilities = cm.getNetworkCapabilities(network)
        val isReady = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        updateStatus { it.copy(networkReady = isReady) }
    }
}