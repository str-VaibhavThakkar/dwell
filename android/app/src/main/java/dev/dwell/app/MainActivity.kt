package dev.dwell.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : ComponentActivity(), HardwareKeyEventsListener {
    companion object {
        private const val TAG = "MainActivity"
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

    private val requestCameraLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        runOnUiThread {
            web.evaluateJavascript("window.onCameraPermissionResult && window.onCameraPermissionResult($isGranted)", null)
        }
    }

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
                    if (::overlayView.isInitialized && store.navMode != "touch") {
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

        @JavascriptInterface
        fun deleteAlarm(id: String) {
            val store = Store(activity)
            store.deleteAlarm(id)
            activity.runOnUiThread {
                activity.reloadWebAlarms()
            }
        }

        @JavascriptInterface
        fun addAlarm(jsonStr: String) {
            try {
                val store = Store(activity)
                store.addAlarm(org.json.JSONObject(jsonStr))
                activity.runOnUiThread {
                    activity.reloadWebAlarms()
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error adding alarm via bridge", e)
            }
        }

        @JavascriptInterface
        fun openExactAlarmSettings() {
            activity.runOnUiThread {
                try {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                            data = Uri.parse("package:${activity.packageName}")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        activity.startActivity(intent)
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to open exact alarm settings", e)
                }
            }
        }

        @JavascriptInterface
        fun openBatteryOptimizationSettings() {
            activity.runOnUiThread {
                LauncherManager.openBatteryOptimizationSettings(activity)
            }
        }

        @JavascriptInterface
        fun openAutoStartSettings() {
            activity.runOnUiThread {
                LauncherManager.openAutoStartSettings(activity)
            }
        }

        @JavascriptInterface
        fun openAppDetailsSettings() {
            activity.runOnUiThread {
                LauncherManager.openAppDetailsSettings(activity)
            }
        }

        @JavascriptInterface
        fun isIgnoringBatteryOptimizations(): Boolean {
            return LauncherManager.isIgnoringBatteryOptimizations(activity)
        }

        @JavascriptInterface
        fun getDefaultLauncherName(): String {
            return LauncherManager.getDefaultLauncherLabel(activity)
        }

        @JavascriptInterface
        fun dismissFirstRunPrompt() {
            activity.store.firstRunPromptDismissed = true
        }

        @JavascriptInterface
        fun isFirstRunPromptDismissed(): Boolean {
            return activity.store.firstRunPromptDismissed
        }

        @JavascriptInterface
        fun getSystemPermissionStatus(): String {
            val isDef = LauncherManager.isDefaultLauncher(activity)
            val defName = LauncherManager.getDefaultLauncherLabel(activity)
            val isBatteryIgnored = LauncherManager.isIgnoringBatteryOptimizations(activity)
            val cameraGranted = ContextCompat.checkSelfPermission(
                activity, android.Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED

            return org.json.JSONObject().apply {
                put("isDefaultLauncher", isDef)
                put("defaultLauncherName", defName)
                put("isIgnoringBatteryOptimizations", isBatteryIgnored)
                put("cameraPermissionGranted", cameraGranted)
                put("firstRunPromptDismissed", activity.store.firstRunPromptDismissed)
                put("brand", android.os.Build.BRAND)
                put("manufacturer", android.os.Build.MANUFACTURER)
                put("model", android.os.Build.MODEL)
            }.toString()
        }

        @JavascriptInterface
        fun getCapabilities(): String {
            return Capabilities.probe(activity).toString()
        }

        @JavascriptInterface
        fun openLauncherChooser(): Boolean {
            activity.runOnUiThread {
                LauncherManager.openLauncherChooser(activity)
            }
            return true
        }

        @JavascriptInterface
        fun openHomeLauncherSettings(): Boolean {
            activity.runOnUiThread {
                LauncherManager.requestDefaultHomeRoleOrSettings(activity)
            }
            return true
        }

        @JavascriptInterface
        fun isDefaultLauncher(): Boolean {
            return LauncherManager.isDefaultLauncher(activity)
        }

        @JavascriptInterface
        fun requestCameraPermission() {
            activity.runOnUiThread {
                activity.requestCameraLauncher.launch(android.Manifest.permission.CAMERA)
            }
        }

        @JavascriptInterface
        fun isCameraPermissionGranted(): Boolean {
            return ContextCompat.checkSelfPermission(
                activity, android.Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        }

        @JavascriptInterface
        fun toggleFullscreen(immersive: Boolean) {
            activity.runOnUiThread {
                activity.setEdgeToEdgeFullscreen(immersive)
            }
        }

        @JavascriptInterface
        fun getInstalledApps(): String {
            return LauncherManager.getInstalledApps(activity).toString()
        }

        @JavascriptInterface
        fun launchApp(pkg: String): Boolean {
            return LauncherManager.launchApp(activity, pkg)
        }

        @JavascriptInterface
        fun openOemBatterySettings() {
            activity.runOnUiThread {
                LauncherManager.openAutoStartSettings(activity)
            }
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

    fun applyNightBrightness(s: Store) {
        if (!Root.available || s.safeMode) return
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (pm?.isInteractive != true) return // Never adjust brightness while display is asleep
        val target = if (s.isNightTime()) 1 else 120
        try {
            Settings.System.putInt(
                contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                target
            )
        } catch (_: Exception) {}
    }

    fun reloadWebSettings() {
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
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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
        playFocusCompletionChime()
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
        val s = Store(this)
        if (s.navMode == "buttons" && s.kioskLock && !s.safeMode) {
            // 100% consume only on dedicated headless hardware dock with phantom touches
            return true
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Intercept Power Button when alarm is ringing
        if (event.keyCode == KeyEvent.KEYCODE_POWER && event.action == KeyEvent.ACTION_DOWN) {
            if (AlarmEngine.isRinging) {
                android.util.Log.i("MainActivity", "Power button keyevent: stopping alarm")
                AlarmEngine.dismissAlarm(this)
                return true
            }
        }

        // Only intercept volume rocker if navMode is not touch-only
        val s = Store(this)
        if (s.navMode != "touch") {
            if (keyStateMachine.onKeyEvent(event)) {
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        AppLogger.init(applicationContext)
        DeviceProfile.load(applicationContext)
        AppLogger.i("MainActivity", "onCreate started")

        val prevUncaughtHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            AppLogger.e("Crash", "Uncaught exception on thread ${thread.name}: ${throwable.message}", throwable)
            BatteryGuard.restoreSafeCharging()
            prevUncaughtHandler?.uncaughtException(thread, throwable)
        }

        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(0xFF000000.toInt()))

        // Enforce true edge-to-edge layout
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        setEdgeToEdgeFullscreen(true)

        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        DockService.start(this)

        // Initialize Overlay View and Calibration Controller
        overlayView = CalibrationOverlayView(this) { getDisplayRotation() }
        calibrationController = CalibrationController(this, overlayView) { savedSettings ->
        }
        keyStateMachine = HardwareKeyStateMachine(this, handler)

        // Hide calibration overlay in touch-only mode
        if (store.navMode == "touch") {
            overlayView.visibility = View.GONE
        }

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenStateReceiver, filter)

        web = createWebView()

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
        web.postDelayed({ web.loadUrl("http://127.0.0.1:${DockServer.PORT}/dock/") }, 600)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Home button/gesture returns smoothly to Clock Dashboard (Page 1)
        resetToDashboard()
    }

    fun setEdgeToEdgeFullscreen(immersive: Boolean) {
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (immersive) {
            insetsController.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            insetsController.show(WindowInsetsCompat.Type.systemBars())
        }
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
                    request.grant(request.resources)
                }
            }
        }
    }

    override fun onDestroy() {
        BatteryGuard.restoreSafeCharging()
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

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
        }
        setEdgeToEdgeFullscreen(true)
        resetToDashboard()
        web.evaluateJavascript("window.refresh&&refresh(); window.render&&render(); window.onSystemStateChanged&&window.onSystemStateChanged();", null)
    }

    fun resetToDashboard() {
        DockService.instance?.proximityEngine?.notifyWoken()
        runOnUiThread {
            web.evaluateJavascript("if(typeof resetToDashboard==='function')resetToDashboard();else if(typeof goToPage==='function')goToPage(0);", null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val s = Store(this)
        if (!s.kioskLock || s.operationMode == "daily" || s.safeMode) {
            web.evaluateJavascript("window.onBackPressed ? window.onBackPressed() : false") { result ->
                val consumed = (result == "true")
                if (!consumed) {
                    moveTaskToBack(true)
                }
            }
        }
    }
}
