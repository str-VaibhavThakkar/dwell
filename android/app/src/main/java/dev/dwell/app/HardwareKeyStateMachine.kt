package dev.dwell.app

import android.os.Handler
import android.os.Looper
import android.view.KeyEvent

interface HardwareKeyEventsListener {
    // Normal mode actions
    fun onNormalVolUpSingle()
    fun onNormalVolDownSingle()
    fun onNormalVolDownDouble()
    fun onNormalVolDownLong()

    // Calibration activation
    fun onEnterCalibrationMode()

    // Calibration mode actions
    fun onCalibrationVolUpShort()
    fun onCalibrationVolDownShort()
    fun onCalibrationVolUpHold()
    fun onCalibrationVolDownHold()
    fun onCalibrationInactivityTimeout()
}

class HardwareKeyStateMachine(
    private val listener: HardwareKeyEventsListener,
    private val handler: Handler = Handler(Looper.getMainLooper())
) {
    companion object {
        const val HOLD_THRESHOLD_MS = 800L
        const val BOTH_KEYS_HOLD_MS = 3000L
        const val INACTIVITY_TIMEOUT_MS = 90000L // 90 seconds
        const val DEBOUNCE_THRESHOLD_MS = 55L
        const val LONG_PRESS_NORMAL_MS = 480L
        const val DOUBLE_TAP_NORMAL_MS = 230L
        const val LONG_PRESS_LOCKOUT_MS = 650L
    }

    var isCalibrationMode: Boolean = false
        set(value) {
            field = value
            resetKeys()
            if (value) {
                resetInactivityTimer()
            } else {
                handler.removeCallbacks(inactivityRunnable)
            }
        }

    // Key states
    private var isVolUpPressed = false
    private var isVolDownPressed = false
    private var volUpDownTime = 0L
    private var volDownDownTime = 0L

    // Hold detection flags
    private var volUpHoldFired = false
    private var volDownHoldFired = false
    private var bothKeysHoldFired = false

    // Normal mode gesture state
    private var volDownPressCount = 0
    private var isNormalVolDownLongPressed = false
    private var normalVolDownLockoutUntil = 0L
    private var lastNormalVolUpDownTime = 0L
    private var lastNormalVolDownDownTime = 0L

    // Runnables
    private val bothKeysRunnable = Runnable {
        if (isVolUpPressed && isVolDownPressed) {
            bothKeysHoldFired = true
            // Cancel single holds and normal gestures
            cancelSingleHolds()
            cancelNormalGestures()
            listener.onEnterCalibrationMode()
        }
    }

    private val volUpHoldRunnable = Runnable {
        if (isVolUpPressed && !bothKeysHoldFired) {
            volUpHoldFired = true
            listener.onCalibrationVolUpHold()
        }
    }

    private val volDownHoldRunnable = Runnable {
        if (isVolDownPressed && !bothKeysHoldFired) {
            volDownHoldFired = true
            listener.onCalibrationVolDownHold()
        }
    }

    private val inactivityRunnable = Runnable {
        if (isCalibrationMode) {
            listener.onCalibrationInactivityTimeout()
        }
    }

    private val normalLongPressRunnable = Runnable {
        isNormalVolDownLongPressed = true
        volDownPressCount = 0
        normalVolDownLockoutUntil = System.currentTimeMillis() + 900L
        listener.onNormalVolDownLong()
    }

    private val normalSingleTapRunnable = Runnable {
        volDownPressCount = 0
        if (System.currentTimeMillis() >= normalVolDownLockoutUntil && !isNormalVolDownLongPressed) {
            listener.onNormalVolDownSingle()
        }
    }

    fun resetInactivityTimer() {
        handler.removeCallbacks(inactivityRunnable)
        if (isCalibrationMode) {
            handler.postDelayed(inactivityRunnable, INACTIVITY_TIMEOUT_MS)
        }
    }

    fun resetKeys() {
        cancelSingleHolds()
        cancelNormalGestures()
        handler.removeCallbacks(bothKeysRunnable)
        isVolUpPressed = false
        isVolDownPressed = false
        volUpHoldFired = false
        volDownHoldFired = false
        bothKeysHoldFired = false
    }

    private fun cancelSingleHolds() {
        handler.removeCallbacks(volUpHoldRunnable)
        handler.removeCallbacks(volDownHoldRunnable)
    }

    private fun cancelNormalGestures() {
        handler.removeCallbacks(normalSingleTapRunnable)
        handler.removeCallbacks(normalLongPressRunnable)
    }

    fun onKeyEvent(event: KeyEvent): Boolean {
        val keyCode = event.keyCode
        val isVolUp = (keyCode == KeyEvent.KEYCODE_VOLUME_UP ||
                keyCode == KeyEvent.KEYCODE_PAGE_UP ||
                keyCode == KeyEvent.KEYCODE_DPAD_UP)
        val isVolDown = (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN ||
                keyCode == KeyEvent.KEYCODE_PAGE_DOWN ||
                keyCode == KeyEvent.KEYCODE_DPAD_DOWN)

        if (!isVolUp && !isVolDown) {
            return false
        }

        val now = System.currentTimeMillis()

        if (isCalibrationMode) {
            resetInactivityTimer()
            handleCalibrationKeyEvent(event, isVolUp, now)
        } else {
            handleNormalKeyEvent(event, isVolUp, now)
        }

        return true // 100% consume in-process
    }

    private fun handleCalibrationKeyEvent(event: KeyEvent, isVolUp: Boolean, now: Long) {
        if (event.action == KeyEvent.ACTION_DOWN) {
            // Ignore key repeat events for press detection (use repeatCount == 0)
            if (event.repeatCount > 0) return

            if (isVolUp) {
                isVolUpPressed = true
                volUpDownTime = now
                volUpHoldFired = false

                if (isVolDownPressed) {
                    // Both keys down simultaneously
                    cancelSingleHolds()
                    handler.postDelayed(bothKeysRunnable, BOTH_KEYS_HOLD_MS)
                } else {
                    handler.postDelayed(volUpHoldRunnable, HOLD_THRESHOLD_MS)
                }
            } else {
                isVolDownPressed = true
                volDownDownTime = now
                volDownHoldFired = false

                if (isVolUpPressed) {
                    // Both keys down simultaneously
                    cancelSingleHolds()
                    handler.postDelayed(bothKeysRunnable, BOTH_KEYS_HOLD_MS)
                } else {
                    handler.postDelayed(volDownHoldRunnable, HOLD_THRESHOLD_MS)
                }
            }
        } else if (event.action == KeyEvent.ACTION_UP) {
            handler.removeCallbacks(bothKeysRunnable)

            if (isVolUp) {
                isVolUpPressed = false
                handler.removeCallbacks(volUpHoldRunnable)

                if (bothKeysHoldFired) {
                    if (!isVolDownPressed) bothKeysHoldFired = false
                    return // Hold threshold already fired, suppress short press
                }

                if (volUpHoldFired) {
                    volUpHoldFired = false
                    return // Hold threshold already fired, suppress short press
                }

                val elapsed = now - volUpDownTime
                if (elapsed in 20 until HOLD_THRESHOLD_MS) {
                    listener.onCalibrationVolUpShort()
                }
            } else {
                isVolDownPressed = false
                handler.removeCallbacks(volDownHoldRunnable)

                if (bothKeysHoldFired) {
                    if (!isVolUpPressed) bothKeysHoldFired = false
                    return // Hold threshold already fired, suppress short press
                }

                if (volDownHoldFired) {
                    volDownHoldFired = false
                    return // Hold threshold already fired, suppress short press
                }

                val elapsed = now - volDownDownTime
                if (elapsed in 20 until HOLD_THRESHOLD_MS) {
                    listener.onCalibrationVolDownShort()
                }
            }
        }
    }

    private fun handleNormalKeyEvent(event: KeyEvent, isVolUp: Boolean, now: Long) {
        if (event.action == KeyEvent.ACTION_DOWN) {
            if (event.repeatCount > 0) return

            if (isVolUp) {
                isVolUpPressed = true
                volUpDownTime = now
                bothKeysHoldFired = false

                if (isVolDownPressed) {
                    // Check if both held together for 3s
                    cancelNormalGestures()
                    handler.postDelayed(bothKeysRunnable, BOTH_KEYS_HOLD_MS)
                } else {
                    if (now - lastNormalVolUpDownTime > DEBOUNCE_THRESHOLD_MS) {
                        lastNormalVolUpDownTime = now
                        listener.onNormalVolUpSingle()
                    }
                }
            } else {
                isVolDownPressed = true
                volDownDownTime = now
                bothKeysHoldFired = false

                if (isVolUpPressed) {
                    // Check if both held together for 3s
                    cancelNormalGestures()
                    handler.postDelayed(bothKeysRunnable, BOTH_KEYS_HOLD_MS)
                } else {
                    if (now < normalVolDownLockoutUntil || isNormalVolDownLongPressed) {
                        return
                    }
                    if (now - lastNormalVolDownDownTime <= DEBOUNCE_THRESHOLD_MS) {
                        return
                    }
                    lastNormalVolDownDownTime = now
                    handler.removeCallbacks(normalSingleTapRunnable)
                    handler.removeCallbacks(normalLongPressRunnable)
                    handler.postDelayed(normalLongPressRunnable, LONG_PRESS_NORMAL_MS)
                }
            }
        } else if (event.action == KeyEvent.ACTION_UP) {
            handler.removeCallbacks(bothKeysRunnable)

            if (isVolUp) {
                isVolUpPressed = false
                if (bothKeysHoldFired) {
                    if (!isVolDownPressed) bothKeysHoldFired = false
                    return
                }
            } else {
                isVolDownPressed = false
                handler.removeCallbacks(normalLongPressRunnable)

                if (bothKeysHoldFired) {
                    if (!isVolUpPressed) bothKeysHoldFired = false
                    return
                }

                if (isNormalVolDownLongPressed) {
                    isNormalVolDownLongPressed = false
                    volDownPressCount = 0
                    normalVolDownLockoutUntil = now + LONG_PRESS_LOCKOUT_MS
                    return
                }
                if (now < normalVolDownLockoutUntil) {
                    return
                }
                if (now - lastNormalVolDownDownTime < 25L) {
                    return
                }

                volDownPressCount++
                if (volDownPressCount == 1) {
                    handler.postDelayed(normalSingleTapRunnable, DOUBLE_TAP_NORMAL_MS)
                } else if (volDownPressCount >= 2) {
                    handler.removeCallbacks(normalSingleTapRunnable)
                    volDownPressCount = 0
                    listener.onNormalVolDownDouble()
                }
            }
        }
    }
}
