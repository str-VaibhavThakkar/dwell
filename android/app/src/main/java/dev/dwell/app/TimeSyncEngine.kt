package dev.dwell.app

import android.content.Context
import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * Hardware RTC Priority & Fallback Network Time Engine.
 * 
 * 1. Hardware RTC (/dev/rtc0) & System.currentTimeMillis() is the primary autonomous time source.
 * 2. Power-loss / battery depletion is detected if clock falls behind Jan 1, 2025.
 * 3. Dual-channel fallback (SNTP UDP 123 + HTTPS TLS Date header TCP 443).
 * 4. In-process system time setting via 'cmd alarm set-time' and hardware RTC sync via 'hwclock -w'.
 */
object TimeSyncEngine {
    private const val TAG = "TimeSyncEngine"
    private val executor = Executors.newSingleThreadExecutor()

    // Sane minimum timestamp: Jan 1, 2025 00:00:00 UTC
    const val MIN_VALID_TIMESTAMP_MS = 1735689600000L

    fun isRtcValid(): Boolean {
        return System.currentTimeMillis() >= MIN_VALID_TIMESTAMP_MS
    }

    fun checkAndRecoverRtc(ctx: Context) {
        if (!isRtcValid()) {
            Log.w(TAG, "RTC power loss or invalid epoch detected (${Date()}). Triggering network fallback...")
            syncNetworkTimeAsync(null)
        }
    }

    fun queryNtp(server: String = "time.google.com", timeoutMs: Int = 3000): Long? {
        return try {
            val socket = DatagramSocket()
            socket.soTimeout = timeoutMs
            val address = InetAddress.getByName(server)
            val buffer = ByteArray(48)
            buffer[0] = 0x1B // NTP mode 3 (client), version 3

            val request = DatagramPacket(buffer, buffer.size, address, 123)
            val sendTime = System.currentTimeMillis()
            socket.send(request)

            val response = DatagramPacket(buffer, buffer.size)
            socket.receive(response)
            val recvTime = System.currentTimeMillis()
            socket.close()

            var seconds = 0L
            for (i in 40..43) {
                seconds = (seconds shl 8) or (buffer[i].toLong() and 0xFF)
            }
            var fraction = 0L
            for (i in 44..47) {
                fraction = (fraction shl 8) or (buffer[i].toLong() and 0xFF)
            }

            val ntpEpochOffset = 2208988800L
            val unixSeconds = seconds - ntpEpochOffset
            val unixMs = unixSeconds * 1000L + (fraction * 1000L / 0x100000000L)
            val roundTrip = (recvTime - sendTime)
            unixMs + (roundTrip / 2)
        } catch (e: Exception) {
            Log.w(TAG, "NTP query to $server failed: ${e.message}")
            null
        }
    }

    fun queryHttpsDate(urlStr: String = "https://www.google.com", timeoutMs: Int = 4000): Long? {
        return try {
            val url = URL(urlStr)
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.requestMethod = "HEAD"
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = false
            conn.connect()

            val dateHeader = conn.getHeaderField("Date")
            conn.disconnect()

            if (!dateHeader.isNullOrBlank()) {
                val format = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US)
                format.timeZone = TimeZone.getTimeZone("GMT")
                val parsed = format.parse(dateHeader)
                parsed?.time
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "HTTPS Date query to $urlStr failed: ${e.message}")
            null
        }
    }

    fun setSystemTime(epochMs: Long): Boolean {
        if (epochMs < MIN_VALID_TIMESTAMP_MS) {
            Log.e(TAG, "Refusing to set invalid timestamp: $epochMs")
            return false
        }
        val res = Root.sh("cmd alarm set-time $epochMs")
        if (res.code == 0) {
            Root.sh("hwclock -w")
            Log.i(TAG, "System time & hardware RTC successfully set to ${Date(epochMs)}")
            return true
        } else {
            val sec = epochMs / 1000
            val res2 = Root.sh("date @$sec")
            Root.sh("hwclock -w")
            return res2.code == 0
        }
    }

    fun syncNetworkTimeAsync(onComplete: ((Boolean, Long) -> Unit)?) {
        executor.execute {
            var time = queryNtp("time.google.com") ?: queryNtp("pool.ntp.org")
            if (time == null) {
                time = queryHttpsDate("https://www.google.com") ?: queryHttpsDate("https://1.1.1.1")
            }

            if (time != null && time >= MIN_VALID_TIMESTAMP_MS) {
                val ok = setSystemTime(time)
                onComplete?.invoke(ok, time)
            } else {
                Log.e(TAG, "All network time sources failed.")
                onComplete?.invoke(false, System.currentTimeMillis())
            }
        }
    }
}
