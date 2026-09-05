package net.opentkd.freeplay.encoder

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
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
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private var currentCodecConfig: AvcCodecConfig? = null

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

        transport.setEncoderName(encoderInfo.name)

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

    fun requestKeyframe() {
        try {
            val params = Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0)
            }
            mediaCodec?.setParameters(params)
            Log.d(TAG, "Keyframe requested from MediaCodec")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request keyframe", e)
        }
    }

    private fun createCallback() = object : MediaCodec.Callback() {
        override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {
            // Not used for surface-based encoding
        }

        override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
            val outputBuffer = codec.getOutputBuffer(index) ?: return

            if ((info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                val data = ByteArray(info.size)
                outputBuffer.position(info.offset)
                outputBuffer.get(data)
                
                AvcNormalization.parseCombined(data)?.let { (sps, pps) ->
                    val config = AvcCodecConfig(sps, pps, info.presentationTimeUs)
                    if (config != currentCodecConfig) {
                        currentCodecConfig = config
                        transport.updateCodecConfig(config)
                        Log.d(TAG, "Cached new codec config from output buffer (SPS: ${sps.size}, PPS: ${pps.size})")
                    }
                }
                codec.releaseOutputBuffer(index, false)
                return
            }
            
            // Handle keyframe count
            if ((info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0) {
                statusManager.updateStatus { it.copy(keyframeCount = it.keyframeCount + 1) }
            }

            // Update stats
            statusManager.updateStatus { it.copy(
                frameCount = it.frameCount + 1,
                bytesTransmitted = it.bytesTransmitted + info.size
            ) }

            // Copy the data to allow immediate release of the MediaCodec buffer
            val data = ByteArray(info.size)
            outputBuffer.position(info.offset)
            outputBuffer.get(data, 0, info.size)
            
            val bufferCopy = ByteBuffer.wrap(data)
            
            val infoCopy = MediaCodec.BufferInfo().apply {
                set(0, info.size, info.presentationTimeUs, info.flags)
            }

            scope.launch {
                transport.send(bufferCopy, infoCopy)
            }

            codec.releaseOutputBuffer(index, false)
        }

        override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
            Log.e(TAG, "MediaCodec Error", e)
            statusManager.updateStatus { it.copy(encoderReady = false) }
        }

        override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
            Log.d(TAG, "Output Format Changed: $format")
            
            val spsBuffer = format.getByteBuffer("csd-0")
            val ppsBuffer = format.getByteBuffer("csd-1")
            
            if (spsBuffer != null && ppsBuffer != null) {
                val sps = ByteArray(spsBuffer.remaining())
                spsBuffer.get(sps)
                val pps = ByteArray(ppsBuffer.remaining())
                ppsBuffer.get(pps)
                
                val config = AvcCodecConfig(
                    AvcNormalization.stripStartCode(sps),
                    AvcNormalization.stripStartCode(pps)
                )
                
                if (config != currentCodecConfig) {
                    currentCodecConfig = config
                    transport.updateCodecConfig(config)
                    Log.d(TAG, "Cached new codec config from format change")
                }
            }
        }
    }
}