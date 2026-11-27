package dev.dwell.app

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

object Capabilities {

    fun probe(ctx: Context): JSONObject {
        val pm = ctx.packageManager
        val powerManager = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val sensorManager = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

        val hasRoot = Root.available
        val canWriteSettings = try { Settings.System.canWrite(ctx) } catch (_: Exception) { false }
        val canScheduleExactAlarms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager?.canScheduleExactAlarms() ?: true
        } else true

        val notificationsEnabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled()
        val ignoringBatteryOptimizations = powerManager?.isIgnoringBatteryOptimizations(ctx.packageName) ?: false

        val hasCamera = pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
        val hasFrontCamera = pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_FRONT)
        val cameraGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

        val proxSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
        val hasProximity = proxSensor != null
        val isContinuousProx = (proxSensor?.maximumRange ?: 0f) > 5.0f
        val hasLight = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT) != null

        val isDefaultLauncher = LauncherManager.isDefaultLauncher(ctx)
        val defaultLauncherName = LauncherManager.getDefaultLauncherLabel(ctx)

        // Tier classification:
        // Tier 3: Root available
        // Tier 1: User-granted critical permissions (Exact alarm, notification, ignoring battery)
        // Tier 0: Base / Stock out-of-the-box
        val tier = when {
            hasRoot -> 3
            canScheduleExactAlarms && notificationsEnabled -> 1
            else -> 0
        }

        return JSONObject().apply {
            put("tier", tier)
            put("apiLevel", Build.VERSION.SDK_INT)
            put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("deviceBrand", Build.BRAND)
            put("deviceModel", Build.MODEL)
            put("rootAvailable", hasRoot)
            put("isDefaultLauncher", isDefaultLauncher)
            put("defaultLauncherName", defaultLauncherName)
            put("canWriteSettings", canWriteSettings)
            put("canScheduleExactAlarms", canScheduleExactAlarms)
            put("notificationsEnabled", notificationsEnabled)
            put("ignoringBatteryOptimizations", ignoringBatteryOptimizations)
            put("hasCamera", hasCamera)
            put("hasFrontCamera", hasFrontCamera)
            put("cameraPermissionGranted", cameraGranted)
            put("hasProximity", hasProximity)
            put("isContinuousProx", isContinuousProx)
            put("hasLight", hasLight)

            // Human-readable availability explanations
            put("explanations", JSONObject().apply {
                if (!hasFrontCamera) put("mirror", "No front camera hardware detected on this device.")
                else if (!cameraGranted) put("mirror", "Camera permission required to display mirror.")

                if (!hasRoot) {
                    put("chargeGuard", "Battery charging threshold control requires Root (ACC or sysfs write). Notification reminders active instead.")
                    put("timeSync", "Direct hardware RTC chip write requires Root. System NTP time is used.")
                }

                if (!hasProximity) {
                    put("airGestures", "No proximity sensor found on this device.")
                }

                if (!canScheduleExactAlarms) {
                    put("alarms", "Exact alarm permission is disabled. Alarms may be delayed by Android Doze.")
                }

                if (!ignoringBatteryOptimizations) {
                    put("batteryOptimization", "App is subject to OEM battery killing. Tap to exclude.")
                }
            })
        }
    }
}
