package dev.dwell.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DockLogicTest {

    @Test
    fun testTimerStateCalculation() {
        val now = 1700000000000L
        val minutes = 25
        val timerObj = JSONObject()
            .put("running", true)
            .put("label", "Deep Work")
            .put("endsAt", now + minutes * 60_000L)

        assertTrue(timerObj.getBoolean("running"))
        assertEquals("Deep Work", timerObj.getString("label"))
        assertEquals(now + 1500000L, timerObj.getLong("endsAt"))
    }

    @Test
    fun testAlarmDaysArraySerialization() {
        val daysArray = JSONArray(listOf(1, 2, 3, 4, 5))
        val alarm = JSONObject()
            .put("id", "alm_test")
            .put("tag", "School")
            .put("time", "07:30")
            .put("days", daysArray)
            .put("enabled", true)

        assertEquals("alm_test", alarm.getString("id"))
        assertEquals(5, alarm.getJSONArray("days").length())
        assertEquals(1, alarm.getJSONArray("days").getInt(0))
        assertEquals(5, alarm.getJSONArray("days").getInt(4))
    }

    @Test
    fun testSettingsTypedCoercion() {
        val patch = JSONObject()
            .put("timeoutSec", "60")
            .put("pauseCap", 65)
            .put("guardEnabled", "true")
            .put("nightMode", 1)

        val timeout = patch.optInt("timeoutSec", 60)
        val pauseCap = patch.optInt("pauseCap", 60)
        val guard = patch.opt("guardEnabled").toString().toBoolean()
        val night = patch.optInt("nightMode", 0) != 0

        assertEquals(60, timeout)
        assertEquals(65, pauseCap)
        assertTrue(guard)
        assertTrue(night)
    }

    @Test
    fun testSolarOffsetCalculation() {
        // Test solar sunrise at 05:45 + offset 15 minutes = 06:00
        val baseH = 5
        val baseM = 45
        val offset = 15
        val total = (baseH * 60 + baseM + offset) % 1440
        val targetH = total / 60
        val targetM = total % 60

        assertEquals(6, targetH)
        assertEquals(0, targetM)
    }
}
