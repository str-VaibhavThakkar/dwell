package dev.dwell.app

import android.content.Context
import android.util.DisplayMetrics
import android.view.Surface

enum class ScreenEdge {
    TOP, BOTTOM, LEFT, RIGHT
}

enum class CalibrationParam(val label: String) {
    SHIFT_ALL("Shift All"),
    VOL_UP_START("Vol+ Start"),
    VOL_UP_END("Vol+ End"),
    VOL_DOWN_START("Vol- Start"),
    VOL_DOWN_END("Vol- End"),
    THICKNESS("Thickness"),
    GLOW("Glow"),
    EDGE("Edge"),
    STEP_SIZE("Step Size"),
    PROX_THRESHOLD("Prox Threshold"),
    PROX_LIGHT_ASSIST("Air Wave (Light)");

    fun next(): CalibrationParam {
        val vals = values()
        return vals[(ordinal + 1) % vals.size]
    }
}

enum class CalibrationMenuOption(val label: String) {
    SAVE("Save & Exit"),
    CANCEL("Cancel & Discard"),
    RESET("Reset to Defaults"),
    SWITCH_LAUNCHER("Switch to Stock Launcher");

    fun next(): CalibrationMenuOption {
        val vals = values()
        return vals[(ordinal + 1) % vals.size]
    }

    fun prev(): CalibrationMenuOption {
        val vals = values()
        return vals[(ordinal - 1 + vals.size) % vals.size]
    }
}

data class EffectiveCoords(
    val startUp: Float,
    val endUp: Float,
    val startDown: Float,
    val endDown: Float,
    val thickness: Float,
    val glow: Float,
    val topOffset: Float,
    val edge: ScreenEdge
)

data class CalibrationSettings(
    var startUp: Int = 254,
    var endUp: Int = 389,
    var startDown: Int = 389,
    var endDown: Int = 523,
    var thickness: Int = 10,
    var glow: Int = 35,
    var edge: ScreenEdge = ScreenEdge.TOP,
    var topOffset: Int = 0,
    var proxThresholdCm: Float = 5.0f,
    var proxLightAssist: Boolean = true
) {
    fun copy(): CalibrationSettings = CalibrationSettings(
        startUp = startUp,
        endUp = endUp,
        startDown = startDown,
        endDown = endDown,
        thickness = thickness,
        glow = glow,
        edge = edge,
        topOffset = topOffset,
        proxThresholdCm = proxThresholdCm,
        proxLightAssist = proxLightAssist
    )

    fun resetToDefaults() {
        startUp = 254
        endUp = 389
        startDown = 389
        endDown = 523
        thickness = 10
        glow = 35
        edge = ScreenEdge.TOP
        topOffset = 0
        proxThresholdCm = 5.0f
        proxLightAssist = true
    }

    fun toLogcatString(): String {
        return "CALIBRATION_SAVED startUp=$startUp endUp=$endUp startDown=$startDown endDown=$endDown thickness=$thickness glow=$glow edge=$edge proxThreshold=$proxThresholdCm proxLightAssist=$proxLightAssist"
    }

    /**
     * Compute effective coordinates taking into account rotation mirroring (180 deg flipped).
     * If rotated 180 (ROTATION_270 vs ROTATION_90 in landscape), mirror x = screenLength - x.
     */
    fun getEffectiveCoords(rotation: Int, screenWidth: Int, screenHeight: Int): EffectiveCoords {
        val isLandscape = screenWidth >= screenHeight
        val screenLength = if (isLandscape) screenWidth else screenHeight

        // ROTATION_270 is reverse landscape (notch on the right side)
        val isFlipped = (rotation == Surface.ROTATION_270)

        val effStartUp: Float
        val effEndUp: Float
        val effStartDown: Float
        val effEndDown: Float

        if (isFlipped && (edge == ScreenEdge.TOP || edge == ScreenEdge.BOTTOM)) {
            // Mirror along long edge: 1520 - x
            effStartUp = (screenLength - endUp).toFloat()
            effEndUp = (screenLength - startUp).toFloat()
            effStartDown = (screenLength - endDown).toFloat()
            effEndDown = (screenLength - startDown).toFloat()
        } else {
            effStartUp = startUp.toFloat()
            effEndUp = endUp.toFloat()
            effStartDown = startDown.toFloat()
            effEndDown = endDown.toFloat()
        }

        return EffectiveCoords(
            startUp = effStartUp,
            endUp = effEndUp,
            startDown = effStartDown,
            endDown = effEndDown,
            thickness = thickness.toFloat(),
            glow = glow.toFloat(),
            topOffset = topOffset.toFloat(),
            edge = edge
        )
    }
}

object CalibrationPrefs {
    private const val PREFS_NAME = "dock_hardware_calibration"
    private const val KEY_START_UP = "start_up"
    private const val KEY_END_UP = "end_up"
    private const val KEY_START_DOWN = "start_down"
    private const val KEY_END_DOWN = "end_down"
    private const val KEY_THICKNESS = "thickness"
    private const val KEY_GLOW = "glow"
    private const val KEY_EDGE = "edge"
    private const val KEY_TOP_OFFSET = "top_offset"
    private const val KEY_CALIBRATED = "is_calibrated"
    private const val KEY_PROX_THRESHOLD = "prox_threshold"
    private const val KEY_PROX_LIGHT_ASSIST = "prox_light_assist"

    fun load(context: Context): CalibrationSettings {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return CalibrationSettings(
            startUp = prefs.getInt(KEY_START_UP, 254),
            endUp = prefs.getInt(KEY_END_UP, 389),
            startDown = prefs.getInt(KEY_START_DOWN, 389),
            endDown = prefs.getInt(KEY_END_DOWN, 523),
            thickness = prefs.getInt(KEY_THICKNESS, 10),
            glow = prefs.getInt(KEY_GLOW, 35),
            edge = try {
                ScreenEdge.valueOf(prefs.getString(KEY_EDGE, ScreenEdge.TOP.name) ?: ScreenEdge.TOP.name)
            } catch (_: Exception) {
                ScreenEdge.TOP
            },
            topOffset = prefs.getInt(KEY_TOP_OFFSET, 0),
            proxThresholdCm = prefs.getFloat(KEY_PROX_THRESHOLD, 5.0f),
            proxLightAssist = prefs.getBoolean(KEY_PROX_LIGHT_ASSIST, true)
        )
    }

    fun save(context: Context, settings: CalibrationSettings) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putInt(KEY_START_UP, settings.startUp)
            .putInt(KEY_END_UP, settings.endUp)
            .putInt(KEY_START_DOWN, settings.startDown)
            .putInt(KEY_END_DOWN, settings.endDown)
            .putInt(KEY_THICKNESS, settings.thickness)
            .putInt(KEY_GLOW, settings.glow)
            .putString(KEY_EDGE, settings.edge.name)
            .putInt(KEY_TOP_OFFSET, settings.topOffset)
            .putFloat(KEY_PROX_THRESHOLD, settings.proxThresholdCm)
            .putBoolean(KEY_PROX_LIGHT_ASSIST, settings.proxLightAssist)
            .putBoolean(KEY_CALIBRATED, true)
            .apply()
    }

    fun isCalibrated(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_CALIBRATED, false)
    }

    /**
     * Requirement 5: First-run wizard for other devices.
     * Converts physical measurements (mm) to px using real display metrics.
     */
    fun createFromPhysicalMm(
        distToFirstMm: Float,
        pairLengthMm: Float,
        dm: DisplayMetrics,
        edge: ScreenEdge = ScreenEdge.TOP
    ): CalibrationSettings {
        val pxPerMm = (dm.xdpi / 25.4f).coerceAtLeast(5f)
        val sUp = (distToFirstMm * pxPerMm).toInt()
        val totalPx = (pairLengthMm * pxPerMm).toInt()
        val halfPx = totalPx / 2
        val eUp = sUp + halfPx
        val sDown = eUp
        val eDown = sUp + totalPx
        return CalibrationSettings(
            startUp = sUp,
            endUp = eUp,
            startDown = sDown,
            endDown = eDown,
            thickness = 10,
            glow = 35,
            edge = edge,
            topOffset = 0
        )
    }
}
