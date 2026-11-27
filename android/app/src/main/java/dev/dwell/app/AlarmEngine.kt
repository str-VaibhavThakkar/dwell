package dev.dwell.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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

    data class NextAlarm(val triggerTimeMs: Long, val tag: String, val alarmJson: JSONObject)

    fun findNextAlarmTrigger(ctx: Context, alarms: JSONArray): NextAlarm? {
        val nowMs = System.currentTimeMillis()
        val settings = Store(ctx).settings()
        val lat = settings.optDouble("lat", 28.61)
        val lon = settings.optDouble("lon", 77.21)

        var closest: NextAlarm? = null

        for (i in 0 until alarms.length()) {
            val alm = alarms.getJSONObject(i)
            if (!alm.optBoolean("enabled", true)) continue

            val type = alm.optString("type", "fixed").lowercase()
            val daysArr = alm.optJSONArray("days")
            val repeatDays = if (daysArr != null && daysArr.length() > 0) {
                (0 until daysArr.length()).map { daysArr.getInt(it) }.toSet()
            } else null

            // Check upcoming 8 days for fixed or solar alarms
            for (dayOffset in 0..7) {
                val candidateCal = Calendar.getInstance().apply {
                    add(Calendar.DAY_OF_YEAR, dayOffset)
                }
                val candidateDayOfWeek = when (candidateCal.get(Calendar.DAY_OF_WEEK)) {
                    Calendar.MONDAY -> 1
                    Calendar.TUESDAY -> 2
                    Calendar.WEDNESDAY -> 3
                    Calendar.THURSDAY -> 4
                    Calendar.FRIDAY -> 5
                    Calendar.SATURDAY -> 6
                    Calendar.SUNDAY -> 7
                    else -> 1
                }

                if (repeatDays != null && !repeatDays.contains(candidateDayOfWeek)) {
                    continue
                }

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
                        val solar = SunCalc.getTimes(candidateCal.time, lat, lon)
                        val offsetMs = alm.optInt("offsetMinutes", 0) * 60_000L
                        val targetDate = Date(solar.sunrise.time + offsetMs)
                        val cal = Calendar.getInstance().apply { time = targetDate }
                        targetHour = cal.get(Calendar.HOUR_OF_DAY)
                        targetMinute = cal.get(Calendar.MINUTE)
                    }
                    "sunset" -> {
                        val solar = SunCalc.getTimes(candidateCal.time, lat, lon)
                        val offsetMs = alm.optInt("offsetMinutes", 0) * 60_000L
                        val targetDate = Date(solar.sunset.time + offsetMs)
                        val cal = Calendar.getInstance().apply { time = targetDate }
                        targetHour = cal.get(Calendar.HOUR_OF_DAY)
                        targetMinute = cal.get(Calendar.MINUTE)
                    }
                }

                if (targetHour >= 0 && targetMinute >= 0) {
                    val triggerCal = Calendar.getInstance().apply {
                        timeInMillis = candidateCal.timeInMillis
                        set(Calendar.HOUR_OF_DAY, targetHour)
                        set(Calendar.MINUTE, targetMinute)
                        set(Calendar.SECOND, 0)
                        set(Calendar.MILLISECOND, 0)
                    }
                    val triggerMs = triggerCal.timeInMillis
                    // Must be at least 15 seconds in the future
                    if (triggerMs > nowMs + 15_000L) {
                        val currentClosest = closest
                        if (currentClosest == null || triggerMs < currentClosest.triggerTimeMs) {
                            closest = NextAlarm(triggerMs, alm.optString("tag", "Alarm"), alm)
                        }
                        break // Found earliest upcoming occurrence for this alarm
                    }
                }
            }
        }
        return closest
    }

    fun rescheduleAlarms(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val store = Store(ctx)
        val alarms = store.alarms()
        val nextTrigger = findNextAlarmTrigger(ctx, alarms)

        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
            action = "dev.dwell.app.ALARM_TRIGGER"
            nextTrigger?.alarmJson?.let { putExtra("alarm_data", it.toString()) }
        }
        val pi = PendingIntent.getBroadcast(
            ctx,
            1001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (nextTrigger != null) {
            val showIntent = PendingIntent.getActivity(
                ctx,
                0,
                Intent(ctx, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val clockInfo = AlarmManager.AlarmClockInfo(nextTrigger.triggerTimeMs, showIntent)
            try {
                am.setAlarmClock(clockInfo, pi)
                Log.i(TAG, "Scheduled next AlarmClock: ${nextTrigger.tag} at ${Date(nextTrigger.triggerTimeMs)}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule AlarmClock: ${e.message}")
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger.triggerTimeMs, pi)
                } catch (_: Exception) {}
            }
        } else {
            am.cancel(pi)
            Log.i(TAG, "No upcoming alarms to schedule. Canceled AlarmClock.")
        }
    }

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
                        rescheduleAlarms(ctx)
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

            rescheduleAlarms(ctx)
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

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val alarmStr = intent.getStringExtra("alarm_data")
        val alarmObj = if (!alarmStr.isNullOrBlank()) {
            try { JSONObject(alarmStr) } catch (_: Exception) { null }
        } else null

        if (alarmObj != null) {
            AlarmEngine.startRinging(ctx, alarmObj)
        } else {
            AlarmEngine.tick(ctx)
        }
        AlarmEngine.rescheduleAlarms(ctx)
    }
}
