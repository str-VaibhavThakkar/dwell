package dev.dwell.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.View

@SuppressLint("ViewConstructor")
class CalibrationOverlayView(
    context: Context,
    private val displayRotationProvider: () -> Int
) : View(context) {

    // Calibration settings state
    var settings: CalibrationSettings = CalibrationSettings()
        set(value) {
            field = value
            invalidate()
        }

    var isCalibrationModeActive: Boolean = false
        set(value) {
            field = value
            visibility = if (value || isSavedBannerVisible || normalFlashActive) VISIBLE else GONE
            invalidate()
        }

    var selectedParam: CalibrationParam = CalibrationParam.SHIFT_ALL
        set(value) {
            field = value
            invalidate()
        }

    var currentStep: Int = 5
        set(value) {
            field = value
            invalidate()
        }

    var isMenuOpen: Boolean = false
        set(value) {
            field = value
            invalidate()
        }

    var selectedMenuOption: CalibrationMenuOption = CalibrationMenuOption.SAVE
        set(value) {
            field = value
            invalidate()
        }

    var liveProxDistance: Float = 5.0f
        private set
    var liveProxNear: Boolean = false
        private set
    var liveLux: Float = -1f
        private set

    fun setLiveSensorReading(dist: Float, near: Boolean, lux: Float) {
        liveProxDistance = dist
        liveProxNear = near
        liveLux = lux
        if (isCalibrationModeActive) invalidate()
    }

    // 5-second saved banner state
    var isSavedBannerVisible: Boolean = false
    var savedBannerText: String = ""
    private val bannerHandler = Handler(Looper.getMainLooper())
    private val hideBannerRunnable = Runnable {
        isSavedBannerVisible = false
        visibility = if (isCalibrationModeActive || normalFlashActive) VISIBLE else GONE
        invalidate()
    }

    // Flash state for normal mode
    private var normalFlashActive = false
    private var normalFlashButton: String? = null
    private val flashHandler = Handler(Looper.getMainLooper())
    private val hideFlashRunnable = Runnable {
        normalFlashActive = false
        normalFlashButton = null
        visibility = if (isCalibrationModeActive || isSavedBannerVisible) VISIBLE else GONE
        invalidate()
    }

    // Styling constants
    private val colorPastelSand = Color.parseColor("#CBB79F")
    private val colorPastelSlate = Color.parseColor("#A2B4C5")
    private val colorPastelSage = Color.parseColor("#9AB6A2")
    private val colorHudBg = Color.parseColor("#E60E1218") // 90% opacity dark charcoal
    private val colorHudBorder = Color.parseColor("#35E6E2DD")
    private val colorHighlightRow = Color.parseColor("#33CBB79F")

    // Paints
    private val stripPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
    }
    private val hudBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = colorHudBg
    }
    private val hudBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(1.5f)
        color = colorHudBorder
    }
    private val rowHighlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = colorHighlightRow
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private fun dp(v: Float): Float = v * resources.displayMetrics.density
    private fun sp(v: Float): Float = v * resources.displayMetrics.scaledDensity

    init {
        visibility = GONE
    }

    fun showSavedBanner(logText: String) {
        savedBannerText = logText
        isSavedBannerVisible = true
        visibility = VISIBLE
        invalidate()
        bannerHandler.removeCallbacks(hideBannerRunnable)
        bannerHandler.postDelayed(hideBannerRunnable, 5000L) // 5 seconds
    }

    fun flashHighlight(btn: String) {
        if (isCalibrationModeActive) return // Already showing both
        normalFlashActive = true
        normalFlashButton = btn
        visibility = VISIBLE
        invalidate()
        flashHandler.removeCallbacks(hideFlashRunnable)
        flashHandler.postDelayed(hideFlashRunnable, 280L)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width
        val h = height
        if (w == 0 || h == 0) return

        val rot = displayRotationProvider()
        val coords = settings.getEffectiveCoords(rot, w, h)

        // 1. Draw Highlight Strips
        if (isCalibrationModeActive) {
            // Draw BOTH strips continuously in calibration mode
            drawHighlightStrip(canvas, coords, isVolUp = true, w, h)
            drawHighlightStrip(canvas, coords, isVolUp = false, w, h)
        } else if (normalFlashActive) {
            // Draw active button strip during normal mode flash
            if (normalFlashButton == "up") {
                drawHighlightStrip(canvas, coords, isVolUp = true, w, h)
            } else if (normalFlashButton == "down") {
                drawHighlightStrip(canvas, coords, isVolUp = false, w, h)
            }
        }

        // 2. Draw Semi-transparent HUD Panel if calibration mode is active
        if (isCalibrationModeActive) {
            drawCalibrationHud(canvas, w, h)
        }

        // 3. Draw Saved Confirmation Banner if active (5s persistence)
        if (isSavedBannerVisible) {
            drawSavedBanner(canvas, w)
        }
    }

    private fun drawHighlightStrip(
        canvas: Canvas,
        coords: EffectiveCoords,
        isVolUp: Boolean,
        screenW: Int,
        screenH: Int
    ) {
        val start = if (isVolUp) coords.startUp else coords.startDown
        val end = if (isVolUp) coords.endUp else coords.endDown
        val baseColor = if (isVolUp) colorPastelSand else colorPastelSlate
        val thickness = coords.thickness
        val glow = coords.glow
        val topOffset = coords.topOffset
        val cornerRadius = dp(4f)

        when (coords.edge) {
            ScreenEdge.TOP -> {
                val left = start
                val right = end
                val top = topOffset
                val bottom = topOffset + thickness

                // Soft glow fading downward
                if (glow > 0) {
                    val glowShader = LinearGradient(
                        0f, top, 0f, top + thickness + glow,
                        intArrayOf(
                            adjustAlpha(baseColor, 0.45f),
                            adjustAlpha(baseColor, 0.20f),
                            Color.TRANSPARENT
                        ),
                        floatArrayOf(0f, 0.45f, 1f),
                        Shader.TileMode.CLAMP
                    )
                    glowPaint.shader = glowShader
                    canvas.drawRoundRect(
                        RectF(left - dp(2f), top, right + dp(2f), top + thickness + glow),
                        cornerRadius, cornerRadius, glowPaint
                    )
                }

                // Core strip with downward fade
                val stripShader = LinearGradient(
                    0f, top, 0f, bottom,
                    intArrayOf(
                        adjustAlpha(baseColor, 0.95f),
                        adjustAlpha(baseColor, 0.50f),
                        adjustAlpha(baseColor, 0.15f)
                    ),
                    floatArrayOf(0f, 0.5f, 1f),
                    Shader.TileMode.CLAMP
                )
                stripPaint.shader = stripShader
                val rect = RectF(left, top, right, bottom)
                canvas.drawRoundRect(rect, cornerRadius, cornerRadius, stripPaint)

                // Crisp bottom tactile edge border
                borderPaint.color = adjustAlpha(baseColor, 0.90f)
                borderPaint.strokeWidth = dp(1.5f)
                canvas.drawLine(left + cornerRadius, bottom, right - cornerRadius, bottom, borderPaint)
            }

            ScreenEdge.BOTTOM -> {
                val left = start
                val right = end
                val bottom = screenH.toFloat() - topOffset
                val top = bottom - thickness

                if (glow > 0) {
                    val glowShader = LinearGradient(
                        0f, bottom, 0f, bottom - thickness - glow,
                        intArrayOf(
                            adjustAlpha(baseColor, 0.45f),
                            adjustAlpha(baseColor, 0.20f),
                            Color.TRANSPARENT
                        ),
                        floatArrayOf(0f, 0.45f, 1f),
                        Shader.TileMode.CLAMP
                    )
                    glowPaint.shader = glowShader
                    canvas.drawRoundRect(
                        RectF(left - dp(2f), bottom - thickness - glow, right + dp(2f), bottom),
                        cornerRadius, cornerRadius, glowPaint
                    )
                }

                val stripShader = LinearGradient(
                    0f, bottom, 0f, top,
                    intArrayOf(
                        adjustAlpha(baseColor, 0.95f),
                        adjustAlpha(baseColor, 0.50f),
                        adjustAlpha(baseColor, 0.15f)
                    ),
                    floatArrayOf(0f, 0.5f, 1f),
                    Shader.TileMode.CLAMP
                )
                stripPaint.shader = stripShader
                val rect = RectF(left, top, right, bottom)
                canvas.drawRoundRect(rect, cornerRadius, cornerRadius, stripPaint)

                borderPaint.color = adjustAlpha(baseColor, 0.90f)
                borderPaint.strokeWidth = dp(1.5f)
                canvas.drawLine(left + cornerRadius, top, right - cornerRadius, top, borderPaint)
            }

            ScreenEdge.RIGHT -> {
                val top = start
                val bottom = end
                val right = screenW.toFloat() - topOffset
                val left = right - thickness

                if (glow > 0) {
                    val glowShader = LinearGradient(
                        right, 0f, right - thickness - glow, 0f,
                        intArrayOf(
                            adjustAlpha(baseColor, 0.45f),
                            adjustAlpha(baseColor, 0.20f),
                            Color.TRANSPARENT
                        ),
                        floatArrayOf(0f, 0.45f, 1f),
                        Shader.TileMode.CLAMP
                    )
                    glowPaint.shader = glowShader
                    canvas.drawRoundRect(
                        RectF(right - thickness - glow, top - dp(2f), right, bottom + dp(2f)),
                        cornerRadius, cornerRadius, glowPaint
                    )
                }

                val stripShader = LinearGradient(
                    right, 0f, left, 0f,
                    intArrayOf(
                        adjustAlpha(baseColor, 0.95f),
                        adjustAlpha(baseColor, 0.50f),
                        adjustAlpha(baseColor, 0.15f)
                    ),
                    floatArrayOf(0f, 0.5f, 1f),
                    Shader.TileMode.CLAMP
                )
                stripPaint.shader = stripShader
                val rect = RectF(left, top, right, bottom)
                canvas.drawRoundRect(rect, cornerRadius, cornerRadius, stripPaint)

                borderPaint.color = adjustAlpha(baseColor, 0.90f)
                borderPaint.strokeWidth = dp(1.5f)
                canvas.drawLine(left, top + cornerRadius, left, bottom - cornerRadius, borderPaint)
            }

            ScreenEdge.LEFT -> {
                val top = start
                val bottom = end
                val left = topOffset
                val right = topOffset + thickness

                if (glow > 0) {
                    val glowShader = LinearGradient(
                        left, 0f, left + thickness + glow, 0f,
                        intArrayOf(
                            adjustAlpha(baseColor, 0.45f),
                            adjustAlpha(baseColor, 0.20f),
                            Color.TRANSPARENT
                        ),
                        floatArrayOf(0f, 0.45f, 1f),
                        Shader.TileMode.CLAMP
                    )
                    glowPaint.shader = glowShader
                    canvas.drawRoundRect(
                        RectF(left, top - dp(2f), left + thickness + glow, bottom + dp(2f)),
                        cornerRadius, cornerRadius, glowPaint
                    )
                }

                val stripShader = LinearGradient(
                    left, 0f, right, 0f,
                    intArrayOf(
                        adjustAlpha(baseColor, 0.95f),
                        adjustAlpha(baseColor, 0.50f),
                        adjustAlpha(baseColor, 0.15f)
                    ),
                    floatArrayOf(0f, 0.5f, 1f),
                    Shader.TileMode.CLAMP
                )
                stripPaint.shader = stripShader
                val rect = RectF(left, top, right, bottom)
                canvas.drawRoundRect(rect, cornerRadius, cornerRadius, stripPaint)

                borderPaint.color = adjustAlpha(baseColor, 0.90f)
                borderPaint.strokeWidth = dp(1.5f)
                canvas.drawLine(right, top + cornerRadius, right, bottom - cornerRadius, borderPaint)
            }
        }
    }

    private fun drawCalibrationHud(canvas: Canvas, screenW: Int, screenH: Int) {
        val hudWidth = (screenW * 0.72f).coerceIn(dp(440f), dp(720f))
        val hudHeight = (screenH * 0.88f).coerceIn(dp(340f), dp(620f))
        val hudLeft = (screenW - hudWidth) / 2f
        val hudTop = (screenH - hudHeight) / 2f
        val hudRight = hudLeft + hudWidth
        val hudBottom = hudTop + hudHeight
        val cornerRadius = dp(8f)

        // 1. Semi-transparent Architectural Box
        val hudRect = RectF(hudLeft, hudTop, hudRight, hudBottom)
        canvas.drawRoundRect(hudRect, cornerRadius, cornerRadius, hudBgPaint)
        canvas.drawRoundRect(hudRect, cornerRadius, cornerRadius, hudBorderPaint)

        // 2. Title & Subheader
        textPaint.reset()
        textPaint.isAntiAlias = true
        textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textPaint.textSize = sp(20f)
        textPaint.color = colorPastelSand
        textPaint.textAlign = Paint.Align.CENTER

        var curY = hudTop + dp(32f)
        canvas.drawText("CALIBRATION", hudLeft + hudWidth / 2f, curY, textPaint)

        curY += dp(16f)
        textPaint.textSize = sp(11f)
        textPaint.typeface = Typeface.DEFAULT
        textPaint.color = Color.parseColor("#9AB6A2")
        canvas.drawText("HARDWARE VOLUME KEY MODE  •  TOUCHLESS", hudLeft + hudWidth / 2f, curY, textPaint)

        // Divider
        curY += dp(12f)
        borderPaint.color = Color.parseColor("#22E6E2DD")
        borderPaint.strokeWidth = dp(1f)
        canvas.drawLine(hudLeft + dp(20f), curY, hudRight - dp(20f), curY, borderPaint)

        // Live Sensor Feedback Badge
        curY += dp(8f)
        val liveBadgeRect = RectF(hudLeft + dp(16f), curY, hudRight - dp(16f), curY + dp(22f))
        val liveBgColor = if (liveProxNear) Color.parseColor("#263428") else Color.parseColor("#151A22")
        val liveBorderColor = if (liveProxNear) colorPastelSage else Color.parseColor("#2D3748")
        rowHighlightPaint.color = liveBgColor
        canvas.drawRoundRect(liveBadgeRect, dp(4f), dp(4f), rowHighlightPaint)
        borderPaint.color = liveBorderColor
        borderPaint.strokeWidth = dp(1f)
        canvas.drawRoundRect(liveBadgeRect, dp(4f), dp(4f), borderPaint)

        textPaint.textAlign = Paint.Align.LEFT
        textPaint.textSize = sp(11f)
        textPaint.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textPaint.color = if (liveProxNear) colorPastelSage else Color.parseColor("#8C96A5")
        val proxStatus = if (liveProxNear) "● NEAR (${String.format(java.util.Locale.US, "%.1f", liveProxDistance)}cm)" else "○ FAR (${String.format(java.util.Locale.US, "%.1f", liveProxDistance)}cm)"
        canvas.drawText("SENSOR: $proxStatus", hudLeft + dp(24f), curY + dp(15f), textPaint)

        textPaint.textAlign = Paint.Align.RIGHT
        textPaint.color = colorPastelSand
        val luxStr = if (liveLux >= 0f) "${liveLux.toInt()} lx" else "-- lx"
        canvas.drawText("LIGHT: $luxStr", hudRight - dp(24f), curY + dp(15f), textPaint)

        curY += dp(26f)

        // 3. Parameters List
        val params = CalibrationParam.values()
        val rowHeight = dp(18f)
        curY += dp(4f)

        for (param in params) {
            val isSelected = (param == selectedParam && !isMenuOpen)
            val rowRect = RectF(hudLeft + dp(16f), curY, hudRight - dp(16f), curY + rowHeight)

            if (isSelected) {
                // Highlighted box for active parameter
                canvas.drawRoundRect(rowRect, dp(4f), dp(4f), rowHighlightPaint)
                borderPaint.color = colorPastelSand
                borderPaint.strokeWidth = dp(1f)
                canvas.drawRoundRect(rowRect, dp(4f), dp(4f), borderPaint)
            }

            textPaint.textAlign = Paint.Align.LEFT
            textPaint.typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            textPaint.textSize = sp(12f)
            textPaint.color = if (isSelected) Color.WHITE else Color.parseColor("#C5CBD4")

            val prefix = if (isSelected) "▶ " else "  "
            canvas.drawText(prefix + param.label, hudLeft + dp(24f), curY + dp(14f), textPaint)

            // Value text
            textPaint.textAlign = Paint.Align.RIGHT
            textPaint.typeface = Typeface.create(Typeface.MONOSPACE, if (isSelected) Typeface.BOLD else Typeface.NORMAL)
            val valStr = formatParamValue(param)
            textPaint.color = if (isSelected) colorPastelSand else Color.parseColor("#A2B4C5")
            canvas.drawText(valStr, hudRight - dp(28f), curY + dp(14f), textPaint)

            curY += rowHeight + dp(2f)
        }

        // Divider
        curY += dp(6f)
        canvas.drawLine(hudLeft + dp(20f), curY, hudRight - dp(20f), curY, borderPaint)

        // 4. Controls Cheat Sheet Footer
        curY += dp(16f)
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.textSize = sp(11f)
        textPaint.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
        textPaint.color = Color.parseColor("#8C96A5")

        canvas.drawText("[Vol+] Tap: +$currentStep px   |   [Vol-] Tap: -$currentStep px", hudLeft + hudWidth / 2f, curY, textPaint)
        curY += dp(16f)
        canvas.drawText("[Vol+] Hold (~0.8s): Next Param   |   [Vol-] Hold (~0.8s): Save Menu", hudLeft + hudWidth / 2f, curY, textPaint)

        // 5. Draw Save / Cancel / Reset Modal Menu if open
        if (isMenuOpen) {
            drawSaveCancelMenu(canvas, hudLeft, hudTop, hudWidth, hudHeight)
        }
    }

    private fun formatParamValue(param: CalibrationParam): String {
        return when (param) {
            CalibrationParam.SHIFT_ALL -> "${settings.startUp} .. ${settings.endDown} px"
            CalibrationParam.VOL_UP_START -> "${settings.startUp} px"
            CalibrationParam.VOL_UP_END -> "${settings.endUp} px (${settings.endUp - settings.startUp} px)"
            CalibrationParam.VOL_DOWN_START -> "${settings.startDown} px"
            CalibrationParam.VOL_DOWN_END -> "${settings.endDown} px (${settings.endDown - settings.startDown} px)"
            CalibrationParam.THICKNESS -> "${settings.thickness} px"
            CalibrationParam.GLOW -> "${settings.glow} px"
            CalibrationParam.EDGE -> settings.edge.name
            CalibrationParam.STEP_SIZE -> "$currentStep px"
            CalibrationParam.PROX_THRESHOLD -> "${String.format(java.util.Locale.US, "%.1f", settings.proxThresholdCm)} cm"
            CalibrationParam.PROX_LIGHT_ASSIST -> if (settings.proxLightAssist) "ENABLED (Air Wave)" else "OFF (IR Only)"
        }
    }

    private fun drawSaveCancelMenu(
        canvas: Canvas,
        hudLeft: Float,
        hudTop: Float,
        hudWidth: Float,
        hudHeight: Float
    ) {
        val menuWidth = hudWidth * 0.72f
        val menuHeight = dp(54f + CalibrationMenuOption.values().size * 32f + 20f)
        val menuLeft = hudLeft + (hudWidth - menuWidth) / 2f
        val menuTop = hudTop + (hudHeight - menuHeight) / 2f
        val menuRight = menuLeft + menuWidth
        val menuBottom = menuTop + menuHeight
        val cornerRadius = dp(6f)

        // Modal backdrop
        val modalBg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.parseColor("#FA0A0D12") // 98% solid charcoal
        }
        val modalBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = dp(2f)
            color = colorPastelSand
        }
        val rect = RectF(menuLeft, menuTop, menuRight, menuBottom)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, modalBg)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, modalBorder)

        // Title
        textPaint.reset()
        textPaint.isAntiAlias = true
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = sp(16f)
        textPaint.color = colorPastelSand
        textPaint.textAlign = Paint.Align.CENTER
        canvas.drawText("SAVE / CANCEL / RESET", menuLeft + menuWidth / 2f, menuTop + dp(28f), textPaint)

        // Options
        val options = CalibrationMenuOption.values()
        var optY = menuTop + dp(46f)
        val optHeight = dp(28f)

        for (opt in options) {
            val isSelected = (opt == selectedMenuOption)
            val optRect = RectF(menuLeft + dp(20f), optY, menuRight - dp(20f), optY + optHeight)

            if (isSelected) {
                val selPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.FILL
                    color = Color.parseColor("#44CBB79F")
                }
                canvas.drawRoundRect(optRect, dp(4f), dp(4f), selPaint)
                borderPaint.color = colorPastelSand
                borderPaint.strokeWidth = dp(1.5f)
                canvas.drawRoundRect(optRect, dp(4f), dp(4f), borderPaint)
            }

            textPaint.typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            textPaint.textSize = sp(13f)
            textPaint.color = if (isSelected) Color.WHITE else Color.parseColor("#A2B4C5")
            canvas.drawText((if (isSelected) "▶ " else "   ") + opt.label, menuLeft + menuWidth / 2f, optY + dp(19f), textPaint)

            optY += optHeight + dp(4f)
        }

        // Menu instructions footer
        textPaint.textSize = sp(10f)
        textPaint.typeface = Typeface.DEFAULT
        textPaint.color = Color.parseColor("#7D8794")
        canvas.drawText("[Vol+/-] Move   |   [Vol+] Hold: Confirm   |   [Vol-] Hold: Close", menuLeft + menuWidth / 2f, menuBottom - dp(10f), textPaint)
    }

    private fun drawSavedBanner(canvas: Canvas, screenW: Int) {
        val bannerHeight = dp(46f)
        val bannerRect = RectF(dp(20f), dp(16f), screenW.toFloat() - dp(20f), dp(16f) + bannerHeight)
        val bannerBg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.parseColor("#F00A140F") // Dark green-black
        }
        val bannerBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = dp(1.5f)
            color = colorPastelSage
        }
        canvas.drawRoundRect(bannerRect, dp(6f), dp(6f), bannerBg)
        canvas.drawRoundRect(bannerRect, dp(6f), dp(6f), bannerBorder)

        textPaint.reset()
        textPaint.isAntiAlias = true
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textPaint.textSize = sp(11f)
        textPaint.color = Color.parseColor("#D4E6D9")
        canvas.drawText("✔ " + savedBannerText, screenW / 2f, dp(16f) + dp(28f), textPaint)
    }

    private fun adjustAlpha(color: Int, factor: Float): Int {
        val alpha = (Color.alpha(color) * factor).toInt().coerceIn(0, 255)
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        return Color.argb(alpha, red, green, blue)
    }
}
