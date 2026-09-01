package net.opentkd.freeplay.encoder

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import net.opentkd.freeplay.network.VideoTransport
import net.opentkd.freeplay.settings.AppSettings
import net.opentkd.freeplay.status.DeviceStatusManager
import java.nio.ByteBuffer

class VideoEncoder(
    private val transport: VideoTransport,
    private val statusManager: DeviceStatusManager
) {
    private var mediaCodec: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    companion object {
        private const val TAG = "FreePlay.Encoder"
        private const val MIME_TYPE = "video/avc"
    }

    fun prepare(settings: AppSettings): Surface {
        val encoderInfo = EncoderCapabilities.findHardwareEncoder()
            ?: throw RuntimeException("No AVC encoder found")

        statusManager.updateStatus { it.copy(
            encoderName = encoderInfo.name,
            isHardwareAccelerated = encoderInfo.isHardwareAccelerated,
            resolution = "${settings.resolution} @ ${settings.frameRate}fps"
        ) }

        val parts = settings.resolution.split("x")
        val width = parts[0].toInt()
        val height = parts[1].toInt()

        val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, settings.bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, settings.frameRate)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, settings.keyframeInterval)
            // Some devices need this for high profile
            // setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
            // setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel41)
        }

        mediaCodec = MediaCodec.createByCodecName(encoderInfo.name).apply {
            setCallback(createCallback())
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            inputSurface = createInputSurface()
        }

        return inputSurface!!
    }

    fun start() {
        handlerThread = HandlerThread("EncoderThread").apply { start() }
        handler = Handler(handlerThread!!.looper)
        mediaCodec?.start()
        statusManager.updateStatus { it.copy(encoderReady = true) }
    }

    fun stop() {
        mediaCodec?.stop()
        mediaCodec?.release()
        mediaCodec = null
        inputSurface?.release()
        inputSurface = null
        handlerThread?.quitSafely()
        handlerThread = null
        statusManager.updateStatus { it.copy(encoderReady = false) }
    }

    private fun createCallback() = object : MediaCodec.Callback() {
        override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {
            // Not used for surface-based encoding
        }

        override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
            val outputBuffer = codec.getOutputBuffer(index) ?: return
            
            // Handle keyframe count
            if ((info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0) {
                statusManager.updateStatus { it.copy(keyframeCount = it.keyframeCount + 1) }
            }

            // Update stats
            statusManager.updateStatus { it.copy(
                frameCount = it.frameCount + 1,
                bytesTransmitted = it.bytesTransmitted + info.size
            ) }

            // Send to transport
            // Note: In a real app, we might need to copy this or use a coroutine to avoid blocking the callback
            // For the prototype, transport.send is suspend, so we'll run it in a scope or just block for mock
            // Actually, let's use a simple blocking call for the prototype or a coroutine scope
            
            // For now, let's assume MockVideoTransport.send is fast and we can block or launch.
            // Since this is a callback, we shouldn't block.
            
            // Ideally VideoEncoder has its own scope
            // For prototype simplification, we'll just handle it.
            
            kotlinx.coroutines.runBlocking {
                transport.send(outputBuffer, info)
            }

            codec.releaseOutputBuffer(index, false)
        }

        override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
            Log.e(TAG, "MediaCodec Error", e)
            statusManager.updateStatus { it.copy(encoderReady = false) }
        }

        override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
            Log.d(TAG, "Output Format Changed: $format")
        }
    }
}