package net.opentkd.freeplay.camera

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.camera2.*
import android.util.Log
import android.view.Surface
import net.opentkd.freeplay.status.DeviceStatusManager

class CameraController(
    private val context: Context,
    private val statusManager: DeviceStatusManager
) {
    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var previewSurface: Surface? = null
    private var encoderSurface: Surface? = null

    companion object {
        private const val TAG = "FreePlay.Camera"
    }

    @SuppressLint("MissingPermission")
    fun startCamera(previewSurface: Surface, encoderSurface: Surface? = null) {
        this.previewSurface = previewSurface
        this.encoderSurface = encoderSurface

        try {
            val cameraId = findRearCamera() ?: throw RuntimeException("No rear camera found")
            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    createCaptureSession()
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraDevice = null
                    statusManager.updateStatus { it.copy(cameraReady = false) }
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    cameraDevice = null
                    statusManager.updateStatus { it.copy(cameraReady = false) }
                }
            }, null)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening camera", e)
            statusManager.updateStatus { it.copy(cameraReady = false) }
        }
    }

    fun setEncoderSurface(encoderSurface: Surface?) {
        this.encoderSurface = encoderSurface
        if (cameraDevice != null) {
            createCaptureSession()
        }
    }

    private fun findRearCamera(): String? {
        return cameraManager.cameraIdList.find { id ->
            val characteristics = cameraManager.getCameraCharacteristics(id)
            characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }
    }

    private fun createCaptureSession() {
        val device = cameraDevice ?: return
        val preview = previewSurface ?: return

        val surfaces = mutableListOf<Surface>(preview)
        encoderSurface?.let { surfaces.add(it) }

        try {
            captureSession?.close()
            captureSession = null

            device.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    try {
                        val builder = device.createCaptureRequest(CameraDevice.TEMPLATE_RECORD)
                        builder.addTarget(preview)
                        encoderSurface?.let { builder.addTarget(it) }

                        builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)

                        session.setRepeatingRequest(builder.build(), null, null)
                        statusManager.updateStatus { it.copy(cameraReady = true) }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error starting capture request", e)
                        statusManager.updateStatus { it.copy(cameraReady = false) }
                    }
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "Session configuration failed")
                    statusManager.updateStatus { it.copy(cameraReady = false) }
                }
            }, null)
        } catch (e: Exception) {
            Log.e(TAG, "Error creating capture session", e)
            statusManager.updateStatus { it.copy(cameraReady = false) }
        }
    }

    fun stopCamera() {
        try {
            captureSession?.stopRepeating()
            captureSession?.close()
            captureSession = null
            cameraDevice?.close()
            cameraDevice = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera", e)
        } finally {
            statusManager.updateStatus { it.copy(cameraReady = false) }
        }
    }
}
