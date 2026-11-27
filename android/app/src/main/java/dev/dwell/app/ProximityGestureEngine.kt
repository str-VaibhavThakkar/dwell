package dev.dwell.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log

class ProximityGestureEngine(
    private val context: Context,
    initialEnabled: Boolean = true
) : SensorEventListener {

    companion object {
        private const val TAG = "ProximityGestureEngine"

        // Timing Windows & Thresholds (in ms)
        private const val WAKE_LOCKOUT_MS = 2000L        // Ignore sleep triggers for 2s after waking
        private const val SLEEP_LOCKOUT_MS = 1500L       // Debounce after sleeping
        private const val WAVE_MIN_DURATION_MS = 150L    // Reject glitch / noise (<150ms)
        private const val WAVE_MAX_DURATION_MS = 1000L   // Quick pass wave sweet spot (150ms - 1000ms)
        private const val OCCLUSION_TIMEOUT_MS = 3000L   // Covered >3s is an obstruction, not a gesture
        private const val OCCLUSION_CLEAR_DELAY_MS = 500L // Debounce when uncovering
    }

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    // Explicitly query wakeup sensors if available
    private val proxSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY, true)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY)

    val isAvailable: Boolean get() = proxSensor != null

    private val lightSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT, true)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT)

    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile var isEnabled: Boolean = initialEnabled
        private set

    @Volatile var isListening: Boolean = false
        private set

    @Volatile var isOccluded: Boolean = false
        private set

    // Calibrated thresholds (persisted in CalibrationPrefs)
    var proxThresholdCm: Float = 3.0f
        private set
    var proxLightAssist: Boolean = true
        private set

    // Live hook for Calibration Mode HUD
    var liveListener: ((distance: Float, isNear: Boolean, lux: Float) -> Unit)? = null

    private var nearStartTime: Long = 0L
    private var wakeLockoutUntil: Long = 0L
    private var sleepLockoutUntil: Long = 0L
    private var isCurrentlyNear: Boolean = false

    private var lastDistance: Float = 5.0f
    private var lastLux: Float = -1f

    // Light Sensor Shadow / Air Wave tracking
    private var baselineLux: Float = 0f
    private var isLightWaveActive: Boolean = false
    private var lightWaveStartTime: Long = 0L

    init {
        try {
            val cal = CalibrationPrefs.load(context)
            proxThresholdCm = if (cal.proxThresholdCm in 1.0f..4.0f) cal.proxThresholdCm else 3.0f
            proxLightAssist = cal.proxLightAssist
        } catch (_: Exception) {}
    }

    private val occlusionChecker = Runnable {
        if (isCurrentlyNear) {
            isOccluded = true
            Log.w(TAG, "Proximity sensor occluded (>3s NEAR). Disabling gestures until cleared.")
        }
    }

    private val occlusionClearer = Runnable {
        if (!isCurrentlyNear) {
            isOccluded = false
            Log.i(TAG, "Proximity sensor occlusion cleared.")
        }
    }

    @Synchronized
    fun start() {
        if (proxSensor == null) {
            Log.e(TAG, "No proximity sensor found on this device!")
            return
        }

        if (isListening) return

        val ht = HandlerThread("ProximityGestureThread").also { it.start() }
        handlerThread = ht
        val h = Handler(ht.looper)
        handler = h

        sensorManager.registerListener(
            this,
            proxSensor,
            SensorManager.SENSOR_DELAY_NORMAL,
            h
        )

        if (proxLightAssist && lightSensor != null) {
            sensorManager.registerListener(
                this,
                lightSensor,
                SensorManager.SENSOR_DELAY_UI,
                h
            )
        }

        isListening = true
        Log.i(TAG, "Gesture sensors registered: prox='${proxSensor.name}' light='${lightSensor?.name}' thresh=${proxThresholdCm}cm lightAssist=$proxLightAssist enabled=$isEnabled")
    }

    @Synchronized
    fun stop() {
        if (!isListening) return
        try {
            sensorManager.unregisterListener(this)
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering sensors: ${e.message}")
        }
        handler?.removeCallbacksAndMessages(null)
        handlerThread?.quitSafely()
        handlerThread = null
        handler = null
        isListening = false
        isCurrentlyNear = false
        isLightWaveActive = false
        Log.i(TAG, "Proximity & light gesture sensors stopped.")
    }

    fun setEnabled(enabled: Boolean) {
        Log.i(TAG, "setEnabled: $enabled (was $isEnabled)")
        isEnabled = enabled
        if (!enabled) {
            handler?.removeCallbacksAndMessages(null)
            isOccluded = false
            isCurrentlyNear = false
            isLightWaveActive = false
        }
    }

    fun applyCalibration(thresholdCm: Float, lightAssist: Boolean) {
        val clampedThresh = thresholdCm.coerceIn(1.0f, 4.0f)
        val assistChanged = (proxLightAssist != lightAssist)
        proxThresholdCm = clampedThresh
        proxLightAssist = lightAssist
        Log.i(TAG, "applyCalibration: thresh=${proxThresholdCm}cm lightAssist=$proxLightAssist")

        if (isListening && assistChanged) {
            val h = handler ?: return
            if (lightAssist && lightSensor != null) {
                sensorManager.registerListener(this, lightSensor, SensorManager.SENSOR_DELAY_UI, h)
            } else if (!lightAssist && lightSensor != null) {
                sensorManager.unregisterListener(this, lightSensor)
            }
        }
    }

    fun notifyWoken() {
        wakeLockoutUntil = SystemClock.uptimeMillis() + WAKE_LOCKOUT_MS
    }

    /** Call when the display goes to sleep (e.g. timeout, power button) to prevent immediate wake loop */
    fun notifyScreenOff() {
        val now = SystemClock.uptimeMillis()
        sleepLockoutUntil = now + 4000L // 4 seconds debounce
        isCurrentlyNear = false
        isLightWaveActive = false
        handler?.removeCallbacksAndMessages(null)
        Log.i(TAG, "Screen off notified: sleepLockout enforced for 4000ms")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || !isEnabled) return
        val now = SystemClock.uptimeMillis()

        if (event.sensor.type == Sensor.TYPE_PROXIMITY) {
            val distance = event.values.getOrNull(0) ?: return
            lastDistance = distance
            // On binary sensors, 0.0 is NEAR and 5.0 is FAR.
            // Values >= 3.0 must never be considered near!
            val near = distance < 3.0f && distance <= proxThresholdCm

            liveListener?.invoke(distance, near, lastLux)
            MainActivity.instance?.updateProximityWeb(distance, near, lastLux)

            if (near != isCurrentlyNear) {
                isCurrentlyNear = near
                handleProximityTransition(near, now)
            }
        } else if (event.sensor.type == Sensor.TYPE_LIGHT && proxLightAssist) {
            val lux = event.values.getOrNull(0) ?: return
            lastLux = lux
            liveListener?.invoke(lastDistance, isCurrentlyNear, lux)
            MainActivity.instance?.updateProximityWeb(lastDistance, isCurrentlyNear, lux)
            handleLightSample(lux, now)
        }
    }

    private fun handleLightSample(lux: Float, now: Long) {
        if (baselineLux <= 0f) {
            baselineLux = lux
            return
        }

        // Adapt baseline when no wave is in progress
        if (!isLightWaveActive) {
            baselineLux = baselineLux * 0.90f + lux * 0.10f
        }

        // Room must have enough light for shadow wave detection
        if (baselineLux < 15f) return

        // Drop threshold: at least 30% drop or 15 lux difference
        val dropThreshold = (baselineLux * 0.30f).coerceAtLeast(15f)
        val isShadow = (baselineLux - lux) >= dropThreshold

        if (isShadow && !isLightWaveActive) {
            isLightWaveActive = true
            lightWaveStartTime = now
        } else if (!isShadow && isLightWaveActive) {
            isLightWaveActive = false
            val duration = now - lightWaveStartTime
            if (duration in 180L..900L) {
                Log.i(TAG, "Air Wave detected via Light Sensor shadow (duration=${duration}ms baseline=${baselineLux.toInt()}lx dipTo=${lux.toInt()}lx)")
                triggerAirWaveGesture(now)
            }
        }
    }

    private fun triggerAirWaveGesture(now: Long) {
        if (AlarmEngine.isRinging) {
            Log.i(TAG, "Air Wave: Dismissing ringing alarm")
            wakeLockoutUntil = now + WAKE_LOCKOUT_MS
            AlarmEngine.dismissAlarm(context)
            return
        }

        val isInteractive = powerManager.isInteractive
        if (isInteractive) {
            if (now >= wakeLockoutUntil) {
                Log.i(TAG, "Air Wave: Wave-to-Sleep triggered")
                sleepLockoutUntil = now + SLEEP_LOCKOUT_MS
                Screen.sleep()
            }
        } else {
            // Ambient light changes (clouds, shadows, room lights) must NEVER wake the device from sleep!
            Log.d(TAG, "Light sensor shadow ignored while screen is asleep.")
        }
    }

    private fun handleProximityTransition(near: Boolean, now: Long) {
        val h = handler ?: return

        if (near) {
            // Hand approached / covered
            nearStartTime = now
            h.removeCallbacks(occlusionClearer)
            h.postDelayed(occlusionChecker, OCCLUSION_TIMEOUT_MS)

            if (isOccluded) {
                Log.d(TAG, "Ignored NEAR: currently occluded")
                return
            }

            // Priority 1: Dismiss Alarm if currently ringing
            if (AlarmEngine.isRinging) {
                Log.i(TAG, "Wave gesture detected during alarm -> Dismissing alarm")
                wakeLockoutUntil = now + WAKE_LOCKOUT_MS
                AlarmEngine.dismissAlarm(context)
                return
            }

            // Priority 2: Wave-to-Wake if screen is asleep
            val isInteractive = powerManager.isInteractive
            if (!isInteractive) {
                val store = Store(context)
                if (store.isNightTime()) {
                    Log.d(TAG, "Wave-to-wake suppressed during night mode for uninterrupted sleep.")
                    return
                }
                if (now < sleepLockoutUntil) {
                    Log.d(TAG, "Ignored wake: within sleepLockoutUntil (${sleepLockoutUntil - now}ms left)")
                    return
                }

                Log.i(TAG, "Wave-to-Wake gesture triggered! Waking device to Time & Weather Dashboard.")
                wakeLockoutUntil = now + WAKE_LOCKOUT_MS

                // Acquire transient bright wake lock to power on instantly
                try {
                    val wl = powerManager.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                        "DeskDock:WaveToWake"
                    )
                    wl.acquire(2500L)
                } catch (e: Exception) {
                    Log.e(TAG, "Error acquiring wake lock: ${e.message}")
                }

                Screen.wake()
                return
            }

            // Screen is already interactive/awake:
            Log.d(TAG, "Screen is awake: hand entered proximity at $now")

        } else {
            // Hand left sensor (FAR)
            h.removeCallbacks(occlusionChecker)
            if (isOccluded) {
                h.postDelayed(occlusionClearer, OCCLUSION_CLEAR_DELAY_MS)
                Log.d(TAG, "Occluded sensor uncovered; clearing occlusion in 500ms")
                return
            }

            val isInteractive = powerManager.isInteractive
            if (!isInteractive) {
                return
            }

            val duration = now - nearStartTime

            if (now < wakeLockoutUntil) {
                Log.d(TAG, "Ignored departure: within wake lockout (${wakeLockoutUntil - now}ms left)")
                return
            }

            if (duration in WAVE_MIN_DURATION_MS..WAVE_MAX_DURATION_MS) {
                Log.i(TAG, "Quick Pass Wave detected (duration=${duration}ms) -> Wave-to-Sleep")
                sleepLockoutUntil = now + SLEEP_LOCKOUT_MS
                Screen.sleep()
            } else {
                Log.d(TAG, "Proximity departure ignored: duration=${duration}ms outside valid wave window ($WAVE_MIN_DURATION_MS..$WAVE_MAX_DURATION_MS)")
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
