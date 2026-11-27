package dev.dwell.app

import java.util.Date
import kotlin.math.*

/**
 * Astronomical solar calculations in pure Kotlin, matching SunCalc.js algorithms.
 * Used for dynamic sunrise and sunset alarms without external dependencies.
 */
object SunCalc {
    private const val PI = Math.PI
    private const val RAD = PI / 180.0
    private const val DAY_MS = 86400000.0
    private const val J1970 = 2440588.0
    private const val J2000 = 2451545.0
    private const val J0 = 0.0009
    private val OBLIQUITY = 23.4397 * RAD

    data class SolarTimes(
        val sunrise: Date,
        val sunset: Date
    )

    private fun toJulian(date: Date): Double = date.time / DAY_MS - 0.5 + J1970
    private fun fromJulian(j: Double): Date = Date(((j + 0.5 - J1970) * DAY_MS).toLong())
    private fun toDays(date: Date): Double = toJulian(date) - J2000

    private fun rightAscension(l: Double, b: Double): Double =
        atan2(sin(l) * cos(OBLIQUITY) - tan(b) * sin(OBLIQUITY), cos(l))

    private fun declination(l: Double, b: Double): Double =
        asin(sin(b) * cos(OBLIQUITY) + cos(b) * sin(OBLIQUITY) * sin(l))

    private fun solarMeanAnomaly(d: Double): Double =
        RAD * (357.5291 + 0.98560028 * d)

    private fun eclipticLongitude(m: Double): Double {
        val c = RAD * (1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m))
        val p = RAD * 102.9372
        return m + c + p + PI
    }

    private fun julianCycle(d: Double, lw: Double): Double =
        round(d - J0 - lw / (2 * PI))

    private fun approxTransit(ht: Double, lw: Double, n: Double): Double =
        J0 + (ht + lw) / (2 * PI) + n

    private fun solarTransitJ(ds: Double, m: Double, l: Double): Double =
        J2000 + ds + 0.0053 * sin(m) - 0.0069 * sin(2 * l)

    private fun hourAngle(h: Double, phi: Double, d: Double): Double {
        val cosH = (sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d))
        return when {
            cosH <= -1.0 -> PI
            cosH >= 1.0 -> 0.0
            else -> acos(cosH)
        }
    }

    fun getTimes(date: Date, lat: Double, lon: Double): SolarTimes {
        val lw = RAD * -lon
        val phi = RAD * lat
        val d = toDays(date)
        val n = julianCycle(d, lw)
        val ds = approxTransit(0.0, lw, n)
        val m = solarMeanAnomaly(ds)
        val l = eclipticLongitude(m)
        val dec = declination(l, 0.0)
        val jnoon = solarTransitJ(ds, m, l)

        val h0 = -0.833 * RAD // Standard sunrise/sunset solar altitude
        val w = hourAngle(h0, phi, dec)
        val jset = approxTransit(w, lw, n)
        val jrise = jnoon - (solarTransitJ(jset, m, l) - jnoon)

        val sunriseDate = fromJulian(jrise)
        val sunsetDate = fromJulian(solarTransitJ(jset, m, l))

        return SolarTimes(sunrise = sunriseDate, sunset = sunsetDate)
    }
}
