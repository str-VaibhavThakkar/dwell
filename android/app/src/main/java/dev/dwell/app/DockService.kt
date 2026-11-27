package dev.dwell.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class DockService : Service() {
    private var server: DockServer? = null
    private val bg = Executors.newSingleThreadScheduledExecutor()
    var proximityEngine: ProximityGestureEngine? = null
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        AppLogger.init(applicationContext)
        AppLogger.i("DockService", "Service onCreate started")
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("dock", "Desk Dock", NotificationManager.IMPORTANCE_MIN))
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            this, 0, openIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        val n = Notification.Builder(this, "dock")
            .setContentTitle("Desk Dock Running")
            .setContentText("Tap to open Desk Dock")
            .setContentIntent(pendingIntent)
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)

        val store = Store(this)
        Log.i("Dock", "LAN token: ${store.token}  ->  http://<phone-ip>:${DockServer.PORT}/control?token=${store.token}")
        server = DockServer(this, store).also {
            it.start(5000, false)
            it.registerMdns()
        }
        proximityEngine = ProximityGestureEngine(this, store.proximityGestures).also { it.start() }
        bg.execute {
            if (Root.available) {
                Screen.applyPolicies(store.timeoutSec)
                TimeSyncEngine.checkAndRecoverRtc(this)
            } else Log.e("Dock", "NO ROOT")
        }
        bg.scheduleWithFixedDelay({ runCatching { BatteryGuard.tick(store) } }, 5, 30, TimeUnit.SECONDS)
        bg.scheduleWithFixedDelay({ runCatching { AlarmEngine.tick(this) } }, 2, 10, TimeUnit.SECONDS)
        bg.scheduleWithFixedDelay({
            runCatching {
                if (MainActivity.instance == null) {
                    AppLogger.w("DockService", "MainActivity is not running! Reviving launcher...")
                    val intent = Intent(this, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    }
                    startActivity(intent)
                }
            }
        }, 10, 15, TimeUnit.SECONDS)
        bg.scheduleWithFixedDelay({
            runCatching {
                val bat = Battery.snapshot()
                val pct = bat.optInt("percent", -1)
                val temp = bat.optDouble("temp_c", -1.0)
                val charging = bat.optBoolean("charging", false)
                val scr = Screen.status(this).optString("wakefulness", "unknown")
                AppLogger.i("HealthCheck", "Battery: $pct% ($temp°C, charging=$charging), Screen: $scr, Alarms: ${AlarmEngine.isRinging}")
            }
        }, 1, 15, TimeUnit.MINUTES)
        HourlyWake.schedule(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() {
        AppLogger.i("DockService", "Service onDestroy called")
        proximityEngine?.stop()
        proximityEngine = null
        if (instance == this) instance = null
        server?.unregisterMdns()
        server?.stop()
        bg.shutdownNow()
        super.onDestroy()
    }

    companion object {
        var instance: DockService? = null
            private set
        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, DockService::class.java))
    }
}
