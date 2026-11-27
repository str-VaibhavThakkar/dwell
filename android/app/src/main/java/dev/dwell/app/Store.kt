package dev.dwell.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.UUID

/** Settings + tasks + timer + alarms, persisted in SharedPreferences as JSON. */
class Store(ctx: Context) {
    private val sp = ctx.getSharedPreferences("dock", Context.MODE_PRIVATE)

    val token: String get() = sp.getString("token", null) ?: UUID.randomUUID().toString().take(8)
        .also { sp.edit().putString("token", it).apply() }

    private fun int(k: String, d: Int) = sp.getInt(k, d)
    var timeoutSec get() = int("timeoutSec", 60); set(v) = sp.edit().putInt("timeoutSec", v).apply()
    val guardEnabled get() = sp.getBoolean("guardEnabled", true)
    val pauseCap get() = int("pauseCap", 60)
    val resumeCap get() = int("resumeCap", 50)
    val pauseTemp get() = int("pauseTemp", 40)
    val resumeTemp get() = int("resumeTemp", 35)
    val hourlyWake get() = sp.getBoolean("hourlyWake", true)
    val quietHours get() = sp.getBoolean("quietHours", false)
    val nightMode get() = sp.getBoolean("nightMode", true)
    val nightStart get() = int("nightStart", 23)
    val nightEnd get() = int("nightEnd", 6)
    val kioskLock get() = sp.getBoolean("kioskLock", true)
    val hardwareKeysEnabled get() = sp.getBoolean("hardwareKeysEnabled", true)
    var proximityGestures get() = sp.getBoolean("proximityGestures", true); set(v) = sp.edit().putBoolean("proximityGestures", v).apply()

    fun isNightTime(): Boolean {
        if (!nightMode) return false
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return if (nightStart <= nightEnd) hour in nightStart until nightEnd
        else hour >= nightStart || hour < nightEnd
    }

    fun settings(): JSONObject = JSONObject(sp.getString("extra", "{}")!!).apply {
        put("timeoutSec", timeoutSec); put("guardEnabled", guardEnabled)
        put("pauseCap", pauseCap); put("resumeCap", resumeCap)
        put("pauseTemp", pauseTemp); put("resumeTemp", resumeTemp)
        put("hourlyWake", hourlyWake); put("quietHours", quietHours)
        put("nightMode", nightMode)
        put("nightStart", nightStart); put("nightEnd", nightEnd)
        put("kioskLock", kioskLock)
        put("hardwareKeysEnabled", hardwareKeysEnabled)
        put("proximityGestures", proximityGestures)
        if (!has("countdowns")) put("countdowns", JSONArray()
            .put(JSONObject().put("label", "JEE 2028").put("date", "2028-01-20")))
        if (!has("lat")) { put("lat", 22.5643); put("lon", 88.3693) }
        if (!has("place")) put("place", "Kolkata, West Bengal")
    }

    private val typedInts = setOf("timeoutSec", "pauseCap", "resumeCap", "pauseTemp", "resumeTemp", "nightStart", "nightEnd")
    private val typedBools = setOf("guardEnabled", "hourlyWake", "quietHours", "nightMode", "kioskLock", "hardwareKeysEnabled", "proximityGestures")

    fun updateSettings(patch: JSONObject) {
        val e = sp.edit()
        val extra = JSONObject(sp.getString("extra", "{}")!!)
        patch.keys().forEach { k ->
            when (k) {
                in typedInts -> {
                    val raw = patch.opt(k)
                    val v = when (raw) {
                        is Number -> raw.toInt()
                        is String -> raw.substringBefore(":").trim().toIntOrNull() ?: 0
                        else -> 0
                    }
                    e.putInt(k, v)
                }
                in typedBools -> {
                    val raw = patch.opt(k)
                    val v = when (raw) {
                        is Boolean -> raw
                        is String -> raw.equals("true", ignoreCase = true) || raw == "1"
                        is Number -> raw.toInt() != 0
                        else -> false
                    }
                    e.putBoolean(k, v)
                }
                else -> extra.put(k, patch.get(k))   // lat, lon, countdowns, ...
            }
        }
        e.putString("extra", extra.toString()).apply()
    }

    // ---- tasks ----
    fun tasks() = JSONArray(sp.getString("tasks", "[]"))
    private fun saveTasks(a: JSONArray) = sp.edit().putString("tasks", a.toString()).apply()
    fun addTask(text: String) = saveTasks(tasks().put(JSONObject()
        .put("id", UUID.randomUUID().toString().take(8)).put("text", text).put("done", false)))
    fun patchTask(id: String, done: Boolean?, delete: Boolean) {
        val a = tasks(); val out = JSONArray()
        for (i in 0 until a.length()) {
            val t = a.getJSONObject(i)
            if (t.getString("id") == id) { if (delete) continue; done?.let { t.put("done", it) } }
            out.put(t)
        }
        saveTasks(out)
    }

    // ---- pomodoro (state only; the UI renders the countdown) ----
    fun timer() = JSONObject(sp.getString("timer", """{"running":false}""")!!)
    fun setTimer(t: JSONObject) = sp.edit().putString("timer", t.toString()).apply()

    // ---- alarms ----
    fun alarms(): JSONArray {
        val s = sp.getString("alarms", null)
        if (s != null) return JSONArray(s)
        val defaults = JSONArray()
            .put(JSONObject()
                .put("id", "alm_sunrise")
                .put("tag", "Sunrise Awakening")
                .put("type", "sunrise")
                .put("offsetMinutes", 0)
                .put("sound", "homecoming.mp3")
                .put("enabled", false)
                .put("days", JSONArray()))
            .put(JSONObject()
                .put("id", "alm_sunset")
                .put("tag", "Sunset Reflection")
                .put("type", "sunset")
                .put("offsetMinutes", 0)
                .put("sound", "homecoming.mp3")
                .put("enabled", false)
                .put("days", JSONArray()))
        saveAlarms(defaults)
        return defaults
    }

    fun saveAlarms(a: JSONArray) = sp.edit().putString("alarms", a.toString()).apply()

    fun addAlarm(obj: JSONObject): JSONObject {
        if (!obj.has("id") || obj.getString("id").isBlank()) {
            obj.put("id", "alm_" + UUID.randomUUID().toString().take(6))
        }
        if (!obj.has("sound")) obj.put("sound", "homecoming.mp3")
        if (!obj.has("enabled")) obj.put("enabled", true)
        if (!obj.has("type")) obj.put("type", "fixed")
        if (!obj.has("tag")) obj.put("tag", "Alarm")
        val a = alarms().put(obj)
        saveAlarms(a)
        return obj
    }

    fun patchAlarm(id: String, patch: JSONObject): JSONObject? {
        val a = alarms()
        val out = JSONArray()
        var updated: JSONObject? = null
        for (i in 0 until a.length()) {
            val al = a.getJSONObject(i)
            if (al.getString("id") == id) {
                val it = patch.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    al.put(k, patch.get(k))
                }
                updated = al
            }
            out.put(al)
        }
        if (updated != null) saveAlarms(out)
        return updated
    }

    fun deleteAlarm(id: String): Boolean {
        val a = alarms()
        val out = JSONArray()
        var removed = false
        for (i in 0 until a.length()) {
            val al = a.getJSONObject(i)
            if (al.getString("id") == id) {
                removed = true
                continue
            }
            out.put(al)
        }
        if (removed) saveAlarms(out)
        return removed
    }
}
