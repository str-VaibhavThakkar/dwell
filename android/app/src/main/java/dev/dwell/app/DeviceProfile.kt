package dev.dwell.app

/**
 * Hardware profile for host device, QCOM PMIC or standard Linux sysfs.
 */
object DeviceProfile {
    val MODEL: String get() = android.os.Build.MODEL
    val CODENAME: String get() = android.os.Build.DEVICE
    val MANUFACTURER: String get() = android.os.Build.MANUFACTURER

    const val BATTERY = "/sys/class/power_supply/battery"
    const val CAPACITY = "$BATTERY/capacity"
    const val VOLTAGE_UV = "$BATTERY/voltage_now"      // microvolts
    const val CURRENT_UA = "$BATTERY/current_now"      // microamps (negative = charging on QCOM)
    const val TEMP_DECI_C = "$BATTERY/temp"            // tenths of °C
    const val STATUS = "$BATTERY/status"
    const val HEALTH = "$BATTERY/health"

    /** Charge-control nodes, tried in order. Value written = "disable charging". */
    val CHARGE_SWITCHES = listOf(
        Triple("$BATTERY/input_suspend", "1", "0"),
        Triple("$BATTERY/battery_charging_enabled", "0", "1"),
        Triple("$BATTERY/charging_enabled", "0", "1"),
    )
}
