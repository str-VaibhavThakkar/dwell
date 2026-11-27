package dev.dwell.app

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File

/**
 * Universal hardware profile engine.
 * Reads device_profiles.json from assets if available, or
 * automatically discovers battery, charging control nodes, and hardware info
 * dynamically across Qualcomm, MediaTek, Exynos, and Google Tensor platforms.
 */
object DeviceProfile {
    val CODENAME: String get() = Build.DEVICE ?: "generic"
    val MODEL: String get() = Build.MODEL ?: "Android Device"
    val MANUFACTURER: String get() = Build.MANUFACTURER ?: "Android"

    private var profileLoaded = false
    private var overrideBatteryPath: String? = null
    private var overrideChargeNode: String? = null
    private var overrideDisableVal: String? = null
    private var overrideEnableVal: String? = null

    fun load(ctx: Context) {
        if (profileLoaded) return
        profileLoaded = true
        try {
            val jsonStr = ctx.assets.open("device_profiles.json").bufferedReader().use { it.readText() }
            val root = JSONObject(jsonStr)
            val profiles = root.optJSONObject("profiles") ?: return
            val devKey = CODENAME.lowercase()
            val p = profiles.optJSONObject(devKey) ?: profiles.optJSONObject(Build.PRODUCT.lowercase())
            if (p != null) {
                overrideBatteryPath = p.optString("batteryPath").takeIf { it.isNotBlank() }
                overrideChargeNode = p.optString("chargeControlNode").takeIf { it.isNotBlank() }
                overrideDisableVal = p.optString("chargeDisableVal").takeIf { it.isNotBlank() }
                overrideEnableVal = p.optString("chargeEnableVal").takeIf { it.isNotBlank() }
                AppLogger.i("DeviceProfile", "Loaded profile for $devKey: node=$overrideChargeNode")
            }
        } catch (e: Exception) {
            AppLogger.w("DeviceProfile", "Could not load device_profiles.json: ${e.message}")
        }
    }

    val BATTERY: String by lazy {
        overrideBatteryPath?.takeIf { File("$it/capacity").exists() } ?: run {
            val candidates = listOf(
                "/sys/class/power_supply/battery",
                "/sys/class/power_supply/bms",
                "/sys/class/power_supply/main",
                "/sys/class/power_supply/usb",
                "/sys/class/power_supply/BAT0"
            )
            candidates.firstOrNull { File("$it/capacity").exists() } ?: "/sys/class/power_supply/battery"
        }
    }

    val CAPACITY: String get() = "$BATTERY/capacity"
    val VOLTAGE_UV: String get() = "$BATTERY/voltage_now"      // microvolts
    val CURRENT_UA: String get() = "$BATTERY/current_now"      // microamps
    val TEMP_DECI_C: String get() = "$BATTERY/temp"            // tenths of °C
    val STATUS: String get() = "$BATTERY/status"
    val HEALTH: String get() = "$BATTERY/health"

    /** Charge-control nodes, tried in order. Value written = "disable charging". */
    val CHARGE_SWITCHES: List<Triple<String, String, String>> by lazy {
        val list = mutableListOf<Triple<String, String, String>>()
        if (overrideChargeNode != null && overrideDisableVal != null && overrideEnableVal != null) {
            list.add(Triple(overrideChargeNode!!, overrideDisableVal!!, overrideEnableVal!!))
        }
        list.addAll(listOf(
            Triple("$BATTERY/input_suspend", "1", "0"),
            Triple("$BATTERY/battery_charging_enabled", "0", "1"),
            Triple("$BATTERY/charging_enabled", "0", "1"),
            Triple("/sys/class/power_supply/battery/input_suspend", "1", "0"),
            Triple("/sys/class/power_supply/battery/battery_charging_enabled", "0", "1"),
            Triple("/sys/class/power_supply/battery/charging_enabled", "0", "1"),
            Triple("/sys/class/power_supply/main/charging_enabled", "0", "1")
        ))
        list
    }
}
