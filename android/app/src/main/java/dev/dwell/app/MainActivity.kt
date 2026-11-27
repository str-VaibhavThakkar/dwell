package dev.dwell.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

class MainActivity : Activity(), HardwareKeyEventsListener {
    companion object {
        @Volatile
        var instance: MainActivity? = null
        @Volatile
        var isMirrorActive: Boolean = false
    }

    private val store by lazy { Store(this) }
    private lateinit var rootLayout: FrameLayout
    private lateinit var web: WebView
    private lateinit var overlayView: CalibrationOverlayView
    lateinit var calibrationController: CalibrationController
        private set
    private lateinit var keyStateMachine: HardwareKeyStateMachine
    private lateinit var audioManager: AudioManager
    private val handler = Handler(Looper.getMainLooper())

    private val screenStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_OFF -> {
                    AppLogger.i("MainActivity", "Screen off detected: pausing WebView GPU rendering")
                    DockService.instance?.proximityEngine?.notifyScreenOff()
                    if (::web.isInitialized) {
                        web.onPause()
                    }
                    if (::overlayView.isInitialized) {
                        overlayView.visibility = View.GONE
                    }
                    if (AlarmEngine.isRinging) {
                        AppLogger.i("MainActivity", "Screen off detected: stopping alarm")
                        AlarmEngine.dismissAlarm(this@MainActivity)
                    }
                    if (::calibrationController.isInitialized) {
                        calibrationController.exitAndDiscard()
                    }
                    if (::keyStateMachine.isInitialized) {
                        keyStateMachine.isCalibrationMode = false
                    }
                    isMirrorActive = false
                }
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
                    AppLogger.i("MainActivity", "Screen on detected: resuming WebView GPU rendering")
                    if (::web.isInitialized) {
                        web.onResume()
                    }
                    if (::overlayView.isInitialized) {
                        overlayView.visibility = View.VISIBLE
                    }
                    applyNightBrightness(store)
                    resetToDashboard()
                    if (::web.isInitialized) {
                        web.evaluateJavascript("window.render && window.render(); window.refresh && window.refresh();", null)
                    }
                }
            }
        }
    }

    class WebAppInterface(private val activity: MainActivity) {
        @JavascriptInterface
        fun setVolume(percent: Int) {
            activity.runOnUiThread {
                activity.setMediaVolume(percent)
            }
        }

        @JavascriptInterface
        fun playChime() {
            activity.runOnUiThread {
                activity.playFocusCompletionChime()
            }
        }

        @JavascriptInterface
        fun getDisplayRotation(): Int {
            return activity.getDisplayRotation()
        }

        @JavascriptInterface
        fun enterCalibration() {
            activity.runOnUiThread {
                activity.onEnterCalibrationMode()
            }
        }

        @JavascriptInterface
        fun dismissAlarm() {
            activity.runOnUiThread {
                AlarmEngine.dismissAlarm(activity)
            }
        }

        @JavascriptInterface
        fun onMirrorActive(active: Boolean) {
            isMirrorActive = active
            activity.runOnUiThread {
                if (active) {
                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }
        }

        @JavascriptInterface
        fun toggleAlarm(id: String) {
            val store = Store(activity)
            val alarms = store.alarms()
            for (i in 0 until alarms.length()) {
                val a = alarms.getJSONObject(i)
                if (a.optString("id") == id) {
                    val curr = a.optBoolean("enabled", true)
                    store.patchAlarm(id, org.json.JSONObject().put("enabled", !curr))
                    break
                }
            }
            activity.reloadWebAlarms()
        }
    }

    fun getDisplayRotation(): Int {
        return try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                display?.rotation ?: Surface.ROTATION_90
            } else {
                @Suppress("DEPRECATION")
                windowManager.defaultDisplay.rotation
            }
        } catch (_: Exception) {
            Surface.ROTATION_90
        }
    }

    fun playFocusCompletionChime() {
        Thread {
            try {
                val toneGen = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
                toneGen.startTone(ToneGenerator.TONE_PROP_BEEP2, 400)
                Thread.sleep(450)
                toneGen.release()
            } catch (_: Exception) {
                try {
                    val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                    val ringtone = RingtoneManager.getRingtone(applicationContext, notificationUri)
                    ringtone?.play()
                } catch (_: Exception) {}
            }
        }.start()
    }

    fun setMediaVolume(percent: Int) {
        try {
            val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val vol = (percent.coerceIn(0, 100) * max) / 100
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, vol, 0)
        } catch (_: Exception) {}
    }

    fun applyKioskLock() {
        runOnUiThread {
            if (store.kioskLock) {
                hideBars()
            } else {
                showBars()
            }
            applyNightBrightness(store)
        }
    }

    fun applyNightBrightness(s: Store) {
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (pm?.isInteractive != true) return // Never adjust brightness while display is asleep
        val target = if (s.isNightTime()) 1 else 120
        try {
            android.provider.Settings.System.putInt(
                contentResolver,
                android.provider.Settings.System.SCREEN_BRIGHTNESS,
                target
            )
        } catch (_: Exception) {}
    }

    fun reloadWebSettings() {
        applyKioskLock()
        runOnUiThread {
            web.evaluateJavascript("window.refresh && window.refresh()", null)
        }
    }

    fun reloadWebTime() {
        runOnUiThread {
            web.evaluateJavascript("window.syncTime && window.syncTime()", null)
        }
    }

    fun updateProximityWeb(distance: Float, near: Boolean, lux: Float) {
        runOnUiThread {
            web.evaluateJavascript("window.onProximityUpdate && window.onProximityUpdate($distance, $near, $lux)", null)
        }
    }

    fun reloadWebAlarms() {
        runOnUiThread {
            web.evaluateJavascript("window.refreshAlarms && window.refreshAlarms()", null)
        }
    }

    fun wakeForAlarm(alarm: org.json.JSONObject) {
        runOnUiThread {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
            Screen.wake()
            val safeJson = alarm.toString().replace("'", "\\'")
            web.evaluateJavascript("window.onAlarmRinging && window.onAlarmRinging('$safeJson')", null)
        }
    }

    fun hideAlarmRinging() {
        runOnUiThread {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            web.evaluateJavascript("window.onAlarmDismissed && window.onAlarmDismissed()", null)
        }
    }

    fun setOrientationMode(mode: String) {
        runOnUiThread {
            when (mode.lowercase()) {
                "landscape" -> {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }
                "portrait" -> {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
                else -> {
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
                }
            }
            hideBars()
            overlayView.invalidate()
        }
    }

    private fun dispatchHardwareAction(btn: String, gesture: String) {
        android.util.Log.d("DockKey", "dispatchHardwareAction: btn=$btn gesture=$gesture")
        runOnUiThread {
            web.evaluateJavascript("window.onHardwareAction && window.onHardwareAction('$btn', '$gesture')", null)
        }
    }

    // HardwareKeyEventsListener Callbacks
    override fun onNormalVolUpSingle() {
        dispatchHardwareAction("up", "single")
        overlayView.flashHighlight("up")
    }

    override fun onNormalVolDownSingle() {
        dispatchHardwareAction("down", "single")
        overlayView.flashHighlight("down")
    }

    override fun onNormalVolDownDouble() {
        dispatchHardwareAction("down", "double")
        overlayView.flashHighlight("down")
    }

    override fun onNormalVolDownLong() {
        dispatchHardwareAction("down", "long")
        overlayView.flashHighlight("down")
    }

    override fun onEnterCalibrationMode() {
        calibrationController.enterCalibrationMode()
        keyStateMachine.isCalibrationMode = true
        playFocusCompletionChime() // Acoustic chime feedback on entering calibration mode
    }

    override fun onCalibrationVolUpShort() {
        calibrationController.onVolUpShort()
    }

    override fun onCalibrationVolDownShort() {
        calibrationController.onVolDownShort()
    }

    override fun onCalibrationVolUpHold() {
        calibrationController.onVolUpHold()
        if (!calibrationController.isCalibrationActive) {
            keyStateMachine.isCalibrationMode = false
        }
    }

    override fun onCalibrationVolDownHold() {
        calibrationController.onVolDownHold()
    }

    override fun onCalibrationInactivityTimeout() {
        calibrationController.exitAndDiscard()
        keyStateMachine.isCalibrationMode = false
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (store.kioskLock) return true // 100% consume and suppress touches from broken digitizer
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Intercept Power Button when alarm is ringing
        if (event.keyCode == KeyEvent.KEYCODE_POWER && event.action == KeyEvent.ACTION_DOWN) {
            if (AlarmEngine.isRinging) {
                android.util.Log.i("MainActivity", "Power button keyevent: stopping alarm")
                AlarmEngine.dismissAlarm(this)
                return true // 100% consume power button to dismiss alarm
            }
        }

        // Intercept and route through the HardwareKeyStateMachine if enabled
        if (store.hardwareKeysEnabled && keyStateMachine.onKeyEvent(event)) {
            return true // 100% consume in-process
        }
        return super.dispatchKeyEvent(event)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        handleIntent(intent)
        AppLogger.init(applicationContext)
        AppLogger.i("MainActivity", "onCreate started")

        val prevUncaughtHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            AppLogger.e("Crash", "Uncaught exception on thread ${thread.name}: ${throwable.message}", throwable)
            prevUncaughtHandler?.uncaughtException(thread, throwable)
        }

        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(0xFF000000.toInt()))
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        // Deliberately NO FLAG_KEEP_SCREEN_ON: screen_off_timeout must be allowed to fire.
        DockService.start(this)

        // Pre-grant camera to the WebView using root (headless: no touch to dismiss the OS dialog)
        try {
            Runtime.getRuntime().exec(arrayOf("su", "-c",
                "pm grant ${packageName} android.permission.CAMERA 2>/dev/null || true"))
        } catch (_: Exception) {}

        // Initialize Overlay View and Calibration Controller
        overlayView = CalibrationOverlayView(this) { getDisplayRotation() }
        calibrationController = CalibrationController(this, overlayView) { savedSettings ->
            // Settings saved to SharedPreferences and native overlay automatically updated
        }
        keyStateMachine = HardwareKeyStateMachine(this, handler)

        // Register screen state receiver (screen-off, screen-on, user-present)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenStateReceiver, filter)

        // First-run wizard check: if device was never calibrated, we can pre-fill from physical mm
        if (!CalibrationPrefs.isCalibrated(this)) {
            CalibrationPrefs.save(this, calibrationController.getCurrentSettings())
        }

        web = createWebView()

        // Wrap WebView and CalibrationOverlayView in FrameLayout root
        rootLayout = FrameLayout(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            addView(web, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
            addView(overlayView, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        }

        setContentView(rootLayout)
        applyKioskLock()
        web.postDelayed({ web.loadUrl("http://127.0.0.1:${DockServer.PORT}/dock/") }, 800)
    }

    private fun createWebView(): WebView {
        return WebView(this).apply {
            fitsSystemWindows = false
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                defaultFocusHighlightEnabled = false
            }
            overScrollMode = View.OVER_SCROLL_NEVER
            isFocusable = false
            isFocusableInTouchMode = false
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(WebAppInterface(this@MainActivity), "AndroidBridge")
            setBackgroundColor(0xFF000000.toInt())
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(v: WebView, r: android.webkit.WebResourceRequest, e: android.webkit.WebResourceError) {
                    if (r.isForMainFrame) {
                        // Keep pure black AMOLED screen instead of showing Chromium white error page
                        v.loadDataWithBaseURL(null, "<!DOCTYPE html><html><body style='background:#000000;'></body></html>", "text/html", "UTF-8", null)
                        v.postDelayed({ v.loadUrl("http://127.0.0.1:${DockServer.PORT}/dock/") }, 1500)
                    }
                }

                override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                    AppLogger.e("MainActivity", "WebView render process gone (crashed=${detail?.didCrash()}). Recovering...")
                    runOnUiThread {
                        try {
                            if (::rootLayout.isInitialized && view != null) {
                                rootLayout.removeView(view)
                                view.destroy()
                                val newWeb = createWebView()
                                web = newWeb
                                rootLayout.addView(newWeb, 0, FrameLayout.LayoutParams(
                                    FrameLayout.LayoutParams.MATCH_PARENT,
                                    FrameLayout.LayoutParams.MATCH_PARENT
                                ))
                                newWeb.loadUrl("http://127.0.0.1:${DockServer.PORT}/dock/")
                            }
                        } catch (e: Exception) {
                            AppLogger.e("MainActivity", "Error recovering WebView: ${e.message}")
                        }
                    }
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    // Auto-grant camera to the dock WebView (app already holds CAMERA permission)
                    request.grant(request.resources)
                }
            }
        }
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(screenStateReceiver)
        } catch (_: Exception) {}
        if (instance == this) instance = null
        super.onDestroy()
    }

    override fun onPause() {
        super.onPause()
        if (::web.isInitialized) {
            web.onPause()
        }
        if (::keyStateMachine.isInitialized && keyStateMachine.isCalibrationMode) {
            calibrationController.exitAndDiscard()
            keyStateMachine.isCalibrationMode = false
        }
    }

    private fun hideBars() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    private fun showBars() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.show(WindowInsets.Type.systemBars())
        }
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
        }
        applyKioskLock()
        resetToDashboard()
        web.evaluateJavascript("window.refresh&&refresh()", null)
    }

    fun resetToDashboard() {
        DockService.instance?.proximityEngine?.notifyWoken()
        runOnUiThread {
            web.evaluateJavascript("if(typeof resetToDashboard==='function')resetToDashboard();else if(typeof goToPage==='function')goToPage(0);", null)
        }
    }


    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action == "dev.dwell.app.ACTION_CALIBRATE" || action.endsWith(".ACTION_CALIBRATE")) {
            runOnUiThread {
                onEnterCalibrationMode()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* launcher: ignore */ }
}
