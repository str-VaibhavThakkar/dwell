package dev.dwell.app

import android.content.Context
import android.util.Log

class CalibrationController(
    private val context: Context,
    private val overlayView: CalibrationOverlayView,
    private val onCalibrationSaved: (CalibrationSettings) -> Unit
) {
    companion object {
        private const val TAG = "DockCalibration"
        val STEP_SIZES = intArrayOf(1, 2, 5, 10)
    }

    var isCalibrationActive: Boolean = false
        private set

    private var activeSettings = CalibrationSettings()
    private var backupSettings = CalibrationSettings()

    private var currentParam = CalibrationParam.SHIFT_ALL
    private var stepIndex = 2 // Default: 5 px
    private val currentStep: Int get() = STEP_SIZES[stepIndex]

    private var isMenuOpen = false
    private var selectedMenuOption = CalibrationMenuOption.SAVE

    init {
        // Load initial persisted settings
        activeSettings = CalibrationPrefs.load(context)
        overlayView.settings = activeSettings
        overlayView.currentStep = currentStep
        overlayView.selectedParam = currentParam
    }

    fun getCurrentSettings(): CalibrationSettings = activeSettings.copy()

    fun enterCalibrationMode() {
        if (isCalibrationActive) return
        isCalibrationActive = true

        // Refresh from prefs and create backup in case of Cancel
        activeSettings = CalibrationPrefs.load(context)
        backupSettings = activeSettings.copy()

        currentParam = CalibrationParam.SHIFT_ALL
        stepIndex = 2 // Default to 5px
        isMenuOpen = false
        selectedMenuOption = CalibrationMenuOption.SAVE

        DockService.instance?.proximityEngine?.liveListener = { dist, near, lux ->
            overlayView.post { overlayView.setLiveSensorReading(dist, near, lux) }
        }
        updateOverlay()
        overlayView.isCalibrationModeActive = true
        Log.i(TAG, "Entered Hardware Calibration Mode")
    }

    fun exitAndSave() {
        CalibrationPrefs.save(context, activeSettings)
        val logStr = activeSettings.toLogcatString()
        Log.i(TAG, logStr)
        Log.i("DockKey", logStr)

        isCalibrationActive = false
        isMenuOpen = false
        overlayView.isCalibrationModeActive = false
        overlayView.showSavedBanner(logStr)

        DockService.instance?.proximityEngine?.liveListener = null
        DockService.instance?.proximityEngine?.applyCalibration(activeSettings.proxThresholdCm, activeSettings.proxLightAssist)
        onCalibrationSaved(activeSettings.copy())
    }

    fun exitAndDiscard() {
        DockService.instance?.proximityEngine?.liveListener = null
        DockService.instance?.proximityEngine?.applyCalibration(backupSettings.proxThresholdCm, backupSettings.proxLightAssist)
        activeSettings = backupSettings.copy()
        isCalibrationActive = false
        isMenuOpen = false
        updateOverlay()
        overlayView.isCalibrationModeActive = false
        Log.i(TAG, "Exited Calibration Mode (Changes Discarded)")
    }

    fun resetToDefaults() {
        activeSettings.resetToDefaults()
        DockService.instance?.proximityEngine?.applyCalibration(activeSettings.proxThresholdCm, activeSettings.proxLightAssist)
        isMenuOpen = false
        updateOverlay()
        Log.i(TAG, "Reset Calibration to Defaults: ${activeSettings.toLogcatString()}")
    }

    fun onVolUpShort() {
        if (!isCalibrationActive) return

        if (isMenuOpen) {
            selectedMenuOption = selectedMenuOption.next()
            overlayView.selectedMenuOption = selectedMenuOption
            return
        }

        val step = currentStep
        when (currentParam) {
            CalibrationParam.SHIFT_ALL -> {
                activeSettings.startUp += step
                activeSettings.endUp += step
                activeSettings.startDown += step
                activeSettings.endDown += step
            }
            CalibrationParam.VOL_UP_START -> {
                activeSettings.startUp = (activeSettings.startUp + step).coerceAtMost(activeSettings.endUp - 5)
            }
            CalibrationParam.VOL_UP_END -> {
                activeSettings.endUp = (activeSettings.endUp + step).coerceAtLeast(activeSettings.startUp + 5)
            }
            CalibrationParam.VOL_DOWN_START -> {
                activeSettings.startDown = (activeSettings.startDown + step).coerceAtMost(activeSettings.endDown - 5)
            }
            CalibrationParam.VOL_DOWN_END -> {
                activeSettings.endDown = (activeSettings.endDown + step).coerceAtLeast(activeSettings.startDown + 5)
            }
            CalibrationParam.THICKNESS -> {
                activeSettings.thickness = (activeSettings.thickness + step).coerceIn(2, 60)
            }
            CalibrationParam.GLOW -> {
                activeSettings.glow = (activeSettings.glow + step).coerceIn(0, 100)
            }
            CalibrationParam.EDGE -> {
                activeSettings.edge = nextEdge(activeSettings.edge)
            }
            CalibrationParam.STEP_SIZE -> {
                stepIndex = (stepIndex + 1) % STEP_SIZES.size
            }
            CalibrationParam.PROX_THRESHOLD -> {
                activeSettings.proxThresholdCm = (activeSettings.proxThresholdCm + 0.5f).coerceIn(1.0f, 5.0f)
                DockService.instance?.proximityEngine?.applyCalibration(activeSettings.proxThresholdCm, activeSettings.proxLightAssist)
            }
            CalibrationParam.PROX_LIGHT_ASSIST -> {
                activeSettings.proxLightAssist = !activeSettings.proxLightAssist
                DockService.instance?.proximityEngine?.applyCalibration(activeSettings.proxThresholdCm, activeSettings.proxLightAssist)
            }
        }
        updateOverlay()
    }

    fun onVolDownShort() {
        if (!isCalibrationActive) return

        if (isMenuOpen) {
            selectedMenuOption = selectedMenuOption.prev()
            overlayView.selectedMenuOption = selectedMenuOption
            return
        }

        val step = currentStep
        when (currentParam) {
            CalibrationParam.SHIFT_ALL -> {
                val minVal = minOf(activeSettings.startUp, activeSettings.startDown)
                val safeStep = if (minVal - step < 0) minVal else step
                activeSettings.startUp -= safeStep
                activeSettings.endUp -= safeStep
                activeSettings.startDown -= safeStep
                activeSettings.endDown -= safeStep
            }
            CalibrationParam.VOL_UP_START -> {
                activeSettings.startUp = (activeSettings.startUp - step).coerceAtLeast(0)
            }
            CalibrationParam.VOL_UP_END -> {
                activeSettings.endUp = (activeSettings.endUp - step).coerceAtLeast(activeSettings.startUp + 5)
            }
            CalibrationParam.VOL_DOWN_START -> {
                activeSettings.startDown = (activeSettings.startDown - step).coerceAtLeast(0)
            }
            CalibrationParam.VOL_DOWN_END -> {
                activeSettings.endDown = (activeSettings.endDown - step).coerceAtLeast(activeSettings.startDown + 5)
            }
            CalibrationParam.THICKNESS -> {
                activeSettings.thickness = (activeSettings.thickness - step).coerceIn(2, 60)
            }
            CalibrationParam.GLOW -> {
                activeSettings.glow = (activeSettings.glow - step).coerceIn(0, 100)
            }
            CalibrationParam.EDGE -> {
                activeSettings.edge = prevEdge(activeSettings.edge)
            }
            CalibrationParam.STEP_SIZE -> {
                stepIndex = (stepIndex - 1 + STEP_SIZES.size) % STEP_SIZES.size
            }
            CalibrationParam.PROX_THRESHOLD -> {
                activeSettings.proxThresholdCm = (activeSettings.proxThresholdCm - 0.5f).coerceIn(1.0f, 5.0f)
                DockService.instance?.proximityEngine?.applyCalibration(activeSettings.proxThresholdCm, activeSettings.proxLightAssist)
            }
            CalibrationParam.PROX_LIGHT_ASSIST -> {
                activeSettings.proxLightAssist = !activeSettings.proxLightAssist
                DockService.instance?.proximityEngine?.applyCalibration(activeSettings.proxThresholdCm, activeSettings.proxLightAssist)
            }
        }
        updateOverlay()
    }

    fun onVolUpHold() {
        if (!isCalibrationActive) return

        if (isMenuOpen) {
            // Confirm selected menu option
            when (selectedMenuOption) {
                CalibrationMenuOption.SAVE -> exitAndSave()
                CalibrationMenuOption.CANCEL -> exitAndDiscard()
                CalibrationMenuOption.RESET -> resetToDefaults()
                CalibrationMenuOption.SWITCH_LAUNCHER -> {
                    exitAndDiscard()
                    LauncherManager.openSystemHomeSettings(context)
                }
            }
            return
        }

        // Switch to next parameter
        currentParam = currentParam.next()
        updateOverlay()
    }

    fun onVolDownHold() {
        if (!isCalibrationActive) return

        // Toggle Save / Cancel / Reset menu
        isMenuOpen = !isMenuOpen
        if (isMenuOpen) {
            selectedMenuOption = CalibrationMenuOption.SAVE
        }
        updateOverlay()
    }

    private fun nextEdge(current: ScreenEdge): ScreenEdge {
        val edges = ScreenEdge.values()
        return edges[(current.ordinal + 1) % edges.size]
    }

    private fun prevEdge(current: ScreenEdge): ScreenEdge {
        val edges = ScreenEdge.values()
        return edges[(current.ordinal - 1 + edges.size) % edges.size]
    }

    private fun updateOverlay() {
        overlayView.settings = activeSettings
        overlayView.selectedParam = currentParam
        overlayView.currentStep = currentStep
        overlayView.isMenuOpen = isMenuOpen
        overlayView.selectedMenuOption = selectedMenuOption
    }
}
