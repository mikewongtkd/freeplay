package net.opentkd.freeplay.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {

    private object PreferencesKeys {
        val RING_NUMBER = intPreferencesKey("ring_number")
        val CAMERA_NUMBER = intPreferencesKey("camera_number")
        val RESOLUTION = stringPreferencesKey("resolution")
        val FRAME_RATE = intPreferencesKey("frame_rate")
        val BITRATE = intPreferencesKey("bitrate")
        val KEYFRAME_INTERVAL = intPreferencesKey("keyframe_interval")
        val SERVER_ADDRESS = stringPreferencesKey("server_address")
        val SERVER_PORT = intPreferencesKey("server_port")
        val AUTO_START_CAMERA = booleanPreferencesKey("auto_start_camera")
        val AUTO_START_STREAMING = booleanPreferencesKey("auto_start_streaming")
        val KEEP_SCREEN_ON = booleanPreferencesKey("keep_screen_on")
        val LOCK_LANDSCAPE = booleanPreferencesKey("lock_landscape")
    }

    val appSettingsFlow: Flow<AppSettings> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            AppSettings(
                ringNumber = preferences[PreferencesKeys.RING_NUMBER] ?: 1,
                cameraNumber = preferences[PreferencesKeys.CAMERA_NUMBER] ?: 1,
                resolution = preferences[PreferencesKeys.RESOLUTION] ?: "1920x1080",
                frameRate = preferences[PreferencesKeys.FRAME_RATE] ?: 30,
                bitrate = preferences[PreferencesKeys.BITRATE] ?: 6000000,
                keyframeInterval = preferences[PreferencesKeys.KEYFRAME_INTERVAL] ?: 1,
                serverAddress = preferences[PreferencesKeys.SERVER_ADDRESS] ?: "10.0.0.50",
                serverPort = preferences[PreferencesKeys.SERVER_PORT] ?: 9000,
                autoStartCamera = preferences[PreferencesKeys.AUTO_START_CAMERA] ?: true,
                autoStartStreaming = preferences[PreferencesKeys.AUTO_START_STREAMING] ?: false,
                keepScreenOn = preferences[PreferencesKeys.KEEP_SCREEN_ON] ?: true,
                lockLandscape = preferences[PreferencesKeys.LOCK_LANDSCAPE] ?: true
            )
        }

    suspend fun updateSettings(settings: AppSettings) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.RING_NUMBER] = settings.ringNumber
            preferences[PreferencesKeys.CAMERA_NUMBER] = settings.cameraNumber
            preferences[PreferencesKeys.RESOLUTION] = settings.resolution
            preferences[PreferencesKeys.FRAME_RATE] = settings.frameRate
            preferences[PreferencesKeys.BITRATE] = settings.bitrate
            preferences[PreferencesKeys.KEYFRAME_INTERVAL] = settings.keyframeInterval
            preferences[PreferencesKeys.SERVER_ADDRESS] = settings.serverAddress
            preferences[PreferencesKeys.SERVER_PORT] = settings.serverPort
            preferences[PreferencesKeys.AUTO_START_CAMERA] = settings.autoStartCamera
            preferences[PreferencesKeys.AUTO_START_STREAMING] = settings.autoStartStreaming
            preferences[PreferencesKeys.KEEP_SCREEN_ON] = settings.keepScreenOn
            preferences[PreferencesKeys.LOCK_LANDSCAPE] = settings.lockLandscape
        }
    }
}