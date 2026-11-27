package dev.dwell.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Settings + tasks + timer + alarms, persisted in SharedPreferences as JSON. */
class Store(private val ctx: Context) {
    private val sp = ctx.getSharedPreferences("dock", Context.MODE_PRIVATE)

    init {
        if (!sp.contains("first_run_initialized")) {
            val rootOk = Root.available
            val safe = !rootOk
            val editor = sp.edit()
            editor.putBoolean("first_run_initialized", true)
            editor.putBoolean("safeMode", safe)
            if (safe) {
                // Non-rooted daily-driver / testing safe defaults: non-invasive, full touch, no screen waking
                editor.putBoolean("kioskLock", false)
                editor.putString("operationMode", "daily")
                editor.putString("navMode", "touch")
                editor.putBoolean("hourlyWake", false)
                editor.putBoolean("proximityGestures", false)
                editor.putBoolean("guardEnabled", false)
                editor.putBoolean("nightMode", false)
            } else {
                // Rooted dedicated hardware dock defaults
                editor.putBoolean("kioskLock", true)
                editor.putString("operationMode", "dock")
                editor.putString("navMode", "both")
                editor.putBoolean("hourlyWake", true)
                editor.putBoolean("proximityGestures", true)
                editor.putBoolean("guardEnabled", true)
                editor.putBoolean("nightMode", true)
            }
            editor.apply()
        }
    }

    val token: String get() = sp.getString("token", null) ?: UUID.randomUUID().toString().take(8)
        .also { sp.edit().putString("token", it).apply() }

    private fun int(k: String, d: Int) = sp.getInt(k, d)
    val safeMode get() = sp.getBoolean("safeMode", !Root.available)
    var timeoutSec get() = int("timeoutSec", 120); set(v) = sp.edit().putInt("timeoutSec", v).apply()
    val guardEnabled get() = sp.getBoolean("guardEnabled", !safeMode)
    val pauseCap get() = int("pauseCap", 60)
    val resumeCap get() = int("resumeCap", 50)
    val pauseTemp get() = int("pauseTemp", 40)
    val resumeTemp get() = int("resumeTemp", 35)
    val hourlyWake get() = sp.getBoolean("hourlyWake", !safeMode)
    val quietHours get() = sp.getBoolean("quietHours", false)
    val nightMode get() = sp.getBoolean("nightMode", !safeMode)
    val nightStart get() = int("nightStart", 23)
    val nightEnd get() = int("nightEnd", 6)
    val kioskLock get() = sp.getBoolean("kioskLock", !safeMode)
    var proximityGestures get() = sp.getBoolean("proximityGestures", !safeMode); set(v) = sp.edit().putBoolean("proximityGestures", v).apply()
    var navMode get() = sp.getString("navMode", if (safeMode) "touch" else "both") ?: if (safeMode) "touch" else "both"; set(v) = sp.edit().putString("navMode", v).apply()
    var operationMode get() = sp.getString("operationMode", if (safeMode) "daily" else "dock") ?: if (safeMode) "daily" else "dock"; set(v) = sp.edit().putString("operationMode", v).apply()
    var setupComplete get() = sp.getBoolean("setupComplete", false); set(v) = sp.edit().putBoolean("setupComplete", v).apply()
    var firstRunPromptDismissed get() = sp.getBoolean("firstRunPromptDismissed", false); set(v) = sp.edit().putBoolean("firstRunPromptDismissed", v).apply()

    fun isNightTime(): Boolean {
        if (!nightMode) return false
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        return if (nightStart <= nightEnd) hour in nightStart until nightEnd
        else hour >= nightStart || hour < nightEnd
    }

    fun settings(): JSONObject = JSONObject(sp.getString("extra", "{}")!!).apply {
        put("safeMode", safeMode)
        put("timeoutSec", timeoutSec); put("guardEnabled", guardEnabled)
        put("pauseCap", pauseCap); put("resumeCap", resumeCap)
        put("pauseTemp", pauseTemp); put("resumeTemp", resumeTemp)
        put("hourlyWake", hourlyWake); put("quietHours", quietHours)
        put("nightMode", nightMode)
        put("nightStart", nightStart); put("nightEnd", nightEnd)
        put("kioskLock", kioskLock)
        put("proximityGestures", proximityGestures)
        put("navMode", navMode)
        put("operationMode", operationMode)
        put("setupComplete", setupComplete)
        put("firstRunPromptDismissed", firstRunPromptDismissed)
        if (!has("countdowns")) put("countdowns", JSONArray()
            .put(JSONObject().put("label", "New Year").put("date", "2027-01-01")))
        if (!has("lat")) { put("lat", 28.61); put("lon", 77.21) }
        if (!has("place")) put("place", "New Delhi")
    }

    private val typedInts = setOf("timeoutSec", "pauseCap", "resumeCap", "pauseTemp", "resumeTemp", "nightStart", "nightEnd")
    private val typedBools = setOf("safeMode", "guardEnabled", "hourlyWake", "quietHours", "nightMode", "kioskLock", "proximityGestures", "setupComplete", "firstRunPromptDismissed")
    private val typedStrings = setOf("navMode", "operationMode")

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
                in typedStrings -> e.putString(k, patch.optString(k, ""))
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

    fun saveAlarms(a: JSONArray) {
        sp.edit().putString("alarms", a.toString()).apply()
        try { AlarmEngine.rescheduleAlarms(ctx) } catch (_: Exception) {}
    }

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
