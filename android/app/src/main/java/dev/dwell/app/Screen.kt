package dev.dwell.app

import android.content.Context
import android.os.PowerManager
import android.provider.Settings
import org.json.JSONObject

object Screen {
    fun wakefulness(): String =
        Regex("mWakefulness=(\\w+)").find(Root.sh("dumpsys power").out)?.groupValues?.get(1) ?: "Unknown"

    /** KEYCODE_WAKEUP (idempotent), verify, fall back to KEYCODE_POWER only if still not awake. */
    fun wake(): String {
        Root.sh("input keyevent 224")
        Thread.sleep(500)
        if (wakefulness() != "Awake") Root.sh("input keyevent 26")
        Root.sh("am start -n ${BuildConfigPkg.PKG}/.MainActivity")
        MainActivity.instance?.resetToDashboard()
        return wakefulness()
    }

    fun sleep(): String { Root.sh("input keyevent 223"); Thread.sleep(300); return wakefulness() }

    fun setTimeout(sec: Int) = Root.sh("settings put system screen_off_timeout ${sec * 1000}")
    
    fun setAutoRotate(on: Boolean) {
        if (on) {
            Root.sh("settings put system accelerometer_rotation 1")
            Root.sh("cmd window set-user-rotation free")
            MainActivity.instance?.setOrientationMode("sensor")
        } else {
            Root.sh("settings put system accelerometer_rotation 0")
        }
    }

    fun setOrientation(mode: String) {
        Root.sh("settings put system accelerometer_rotation 0")
        val userRot = if (mode.equals("portrait", ignoreCase = true)) 0 else 1
        Root.sh("settings put system user_rotation $userRot")
        Root.sh("cmd window set-fix-to-user-rotation enabled")
        Root.sh("cmd window set-user-rotation lock $userRot")
        MainActivity.instance?.setOrientationMode(mode)
    }

    fun currentOrientation(cr: android.content.ContentResolver? = null): String {
        val resolver = cr ?: MainActivity.instance?.contentResolver ?: DockService.instance?.contentResolver
        if (resolver != null) {
            val isSensor = try { Settings.System.getInt(resolver, Settings.System.ACCELEROMETER_ROTATION, 1) == 1 } catch (_: Exception) { true }
            if (isSensor) return "auto"
            val rot = try { Settings.System.getInt(resolver, "user_rotation", 1) } catch (_: Exception) { 1 }
            return if (rot in listOf(1, 3)) "landscape" else "portrait"
        }
        return "landscape"
    }

    fun status(ctx: Context? = null): JSONObject {
        val context = ctx ?: MainActivity.instance ?: DockService.instance?.applicationContext
        val cr = context?.contentResolver
        val pm = context?.getSystemService(Context.POWER_SERVICE) as? PowerManager

        val wake = if (pm != null) {
            if (pm.isInteractive) "Awake" else "Asleep"
        } else {
            "Awake"
        }

        val timeoutSec = if (cr != null) {
            try {
                Settings.System.getInt(cr, Settings.System.SCREEN_OFF_TIMEOUT, 60000) / 1000
            } catch (_: Exception) { 60 }
        } else {
            60
        }

        val autoRot = if (cr != null) {
            try {
                Settings.System.getInt(cr, Settings.System.ACCELEROMETER_ROTATION, 1) == 1
            } catch (_: Exception) { true }
        } else {
            true
        }

        val orient = currentOrientation(cr)
        val prox = if (context != null) Store(context).proximityGestures else true

        return JSONObject()
            .put("wakefulness", wake)
            .put("timeout_s", timeoutSec)
            .put("auto_rotate", autoRot)
            .put("orientation", orient)
            .put("proximity_gestures", prox)
    }

    /** One-time / boot-time OS policy (section 7.1 of the blueprint). */
    fun applyPolicies(timeoutSec: Int) {
        val pkg = BuildConfigPkg.PKG
        listOf(
            "sqlite3 /data/adb/magisk.db \"UPDATE settings SET value=0 WHERE key='su_notification'; UPDATE policies SET notification=0;\"",
            "settings put system screen_off_timeout ${timeoutSec * 1000}",
            "svc power stayon false",
            "settings put global stay_on_while_plugged_in 0",
            "settings put system accelerometer_rotation 1",
            "locksettings set-disabled true",
            "settings put secure lockscreen.disabled 1",
            "settings put secure screensaver_enabled 0",
            "settings put secure screensaver_activate_on_dock 0",
            "settings put secure screensaver_activate_on_sleep 0",
            "settings put secure doze_enabled 0",
            "settings put secure doze_always_on 0",
            "settings put secure doze_pulse_on_pick_up 0",
            "settings put secure doze_pulse_on_double_tap 0",
            "settings put secure ambient_display_wake_screen_lock_state 0",
            "settings put global wifi_sleep_policy 2",
            "dumpsys deviceidle whitelist +$pkg",
            "appops set $pkg SCHEDULE_EXACT_ALARM allow",
            "pm grant $pkg android.permission.POST_NOTIFICATIONS",
            "cmd package set-home-activity $pkg/.MainActivity",
        ).forEach { Root.sh(it) }
    }
}

object BuildConfigPkg { const val PKG = "dev.dwell.app" }
