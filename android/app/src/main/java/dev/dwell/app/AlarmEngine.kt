package dev.dwell.app

import android.content.Context
import android.os.PowerManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

object AlarmEngine {
    private const val TAG = "AlarmEngine"

    @Volatile var isRinging: Boolean = false
        private set
    @Volatile var currentRingingAlarm: JSONObject? = null
        private set

    private var wakeLock: PowerManager.WakeLock? = null
    private var lastFiredKey: String = ""

    fun tick(ctx: Context) {
        if (isRinging) return // already actively ringing

        try {
            val store = Store(ctx)
            val alarms = store.alarms()
            if (alarms.length() == 0) return

            val now = Calendar.getInstance()
            val currentYear = now.get(Calendar.YEAR)
            val currentDay = now.get(Calendar.DAY_OF_YEAR)
            val currentHour = now.get(Calendar.HOUR_OF_DAY)
            val currentMinute = now.get(Calendar.MINUTE)
            val currentDayOfWeek = when (now.get(Calendar.DAY_OF_WEEK)) {
                Calendar.MONDAY -> 1
                Calendar.TUESDAY -> 2
                Calendar.WEDNESDAY -> 3
                Calendar.THURSDAY -> 4
                Calendar.FRIDAY -> 5
                Calendar.SATURDAY -> 6
                Calendar.SUNDAY -> 7
                else -> 1
            }

            val settings = store.settings()
            val lat = settings.optDouble("lat", 28.61)
            val lon = settings.optDouble("lon", 77.21)
            val solar = SunCalc.getTimes(Date(), lat, lon)

            for (i in 0 until alarms.length()) {
                val alm = alarms.getJSONObject(i)
                if (!alm.optBoolean("enabled", true)) continue

                // Check repeat days if specified
                val daysArr = alm.optJSONArray("days")
                if (daysArr != null && daysArr.length() > 0) {
                    var matchesDay = false
                    for (d in 0 until daysArr.length()) {
                        if (daysArr.getInt(d) == currentDayOfWeek) {
                            matchesDay = true
                            break
                        }
                    }
                    if (!matchesDay) continue
                }

                val type = alm.optString("type", "fixed").lowercase()
                var targetHour = -1
                var targetMinute = -1

                when (type) {
                    "fixed" -> {
                        val timeStr = alm.optString("time", "07:00")
                        val parts = timeStr.split(":")
                        if (parts.size >= 2) {
                            targetHour = parts[0].trim().toIntOrNull() ?: -1
                            targetMinute = parts[1].trim().toIntOrNull() ?: -1
                        }
                    }
                    "sunrise" -> {
                        val offsetMs = alm.optInt("offsetMinutes", 0) * 60_000L
                        val targetDate = Date(solar.sunrise.time + offsetMs)
                        val cal = Calendar.getInstance().apply { time = targetDate }
                        targetHour = cal.get(Calendar.HOUR_OF_DAY)
                        targetMinute = cal.get(Calendar.MINUTE)
                    }
                    "sunset" -> {
                        val offsetMs = alm.optInt("offsetMinutes", 0) * 60_000L
                        val targetDate = Date(solar.sunset.time + offsetMs)
                        val cal = Calendar.getInstance().apply { time = targetDate }
                        targetHour = cal.get(Calendar.HOUR_OF_DAY)
                        targetMinute = cal.get(Calendar.MINUTE)
                    }
                }

                if (targetHour == currentHour && targetMinute == currentMinute) {
                    val almId = alm.optString("id", "alm_$i")
                    val fireKey = "$almId-$currentYear-$currentDay-$currentHour-$currentMinute"
                    if (fireKey != lastFiredKey) {
                        lastFiredKey = fireKey
                        Log.i(TAG, "Triggering alarm: ${alm.optString("tag")} ($type at $currentHour:$currentMinute)")
                        startRinging(ctx, alm)
                        break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking alarms in tick: ${e.message}", e)
        }
    }

    fun startRinging(ctx: Context, alarm: JSONObject) {
        if (isRinging) return
        isRinging = true
        currentRingingAlarm = alarm

        try {
            // 1. Acquire WakeLock and turn screen on
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = pm?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "DeskDock:AlarmRingingWakeLock"
            )
            wakeLock?.acquire(10 * 60 * 1000L) // 10 minutes max timeout

            // 2. Wake screen and activate display overlay in MainActivity
            MainActivity.instance?.wakeForAlarm(alarm)

            // 3. Play alarm audio stream
            val soundName = alarm.optString("sound", "homecoming.mp3")
            AlarmAudioPlayer.play(ctx, soundName)

            Log.i(TAG, "Alarm actively ringing: ${alarm.optString("tag")}")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting alarm ring: ${e.message}", e)
        }
    }

    fun dismissAlarm(ctx: Context) {
        if (!isRinging) return
        val alarm = currentRingingAlarm
        isRinging = false
        currentRingingAlarm = null

        try {
            // 1. Stop audio
            AlarmAudioPlayer.stop()

            // 2. Release wake lock
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null

            // 3. Tell MainActivity to clear alarm overlay
            MainActivity.instance?.hideAlarmRinging()

            // 4. If one-time alarm (empty days array), disable it
            alarm?.let { alm ->
                val daysArr = alm.optJSONArray("days")
                if (daysArr == null || daysArr.length() == 0) {
                    val store = Store(ctx)
                    store.patchAlarm(alm.optString("id"), JSONObject().put("enabled", false))
                }
            }

            Log.i(TAG, "Alarm successfully dismissed: ${alarm?.optString("tag")}")
        } catch (e: Exception) {
            Log.e(TAG, "Error dismissing alarm: ${e.message}", e)
        }
    }

    fun getSolarSummary(ctx: Context): JSONObject {
        val store = Store(ctx)
        val settings = store.settings()
        val lat = settings.optDouble("lat", 28.61)
        val lon = settings.optDouble("lon", 77.21)
        val times = SunCalc.getTimes(Date(), lat, lon)
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        return JSONObject()
            .put("sunrise", sdf.format(times.sunrise))
            .put("sunset", sdf.format(times.sunset))
    }
}
