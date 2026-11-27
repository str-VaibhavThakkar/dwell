package dev.dwell.app

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject

class DockServer(private val ctx: Context, private val store: Store) : NanoHTTPD(PORT) {
    companion object { const val PORT = 8000 }

    @Volatile private var pcStats: JSONObject? = null
    @Volatile private var pcSeen = 0L

    private fun json(o: Any, status: Response.Status = Response.Status.OK): Response {
        val res = newFixedLengthResponse(status, "application/json", o.toString())
        res.addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        res.addHeader("Pragma", "no-cache")
        res.addHeader("Expires", "0")
        return res
    }
    private fun err(code: Response.Status, msg: String) = json(JSONObject().put("error", msg), code)

    private fun authed(s: IHTTPSession): Boolean {
        val ip = s.remoteIpAddress ?: ""
        if (ip == "127.0.0.1" || ip == "::1" || ip.endsWith(":127.0.0.1")) return true
        val t = s.headers["x-token"] ?: s.parameters["token"]?.firstOrNull()
        return t == store.token
    }

    private fun body(s: IHTTPSession): JSONObject {
        val m = HashMap<String, String>(); s.parseBody(m)
        return m["postData"]?.takeIf { it.isNotBlank() }?.let { JSONObject(it) } ?: JSONObject()
    }

    private fun asset(path: String): Response {
        val clean = path.trim('/').ifEmpty { "dock" }.let { if (!it.contains('.')) "$it/index.html" else it }
        if (clean.contains("..")) return err(Response.Status.FORBIDDEN, "no")
        val mime = when (clean.substringAfterLast('.')) {
            "html" -> "text/html"; "js" -> "application/javascript"; "css" -> "text/css"
            "svg" -> "image/svg+xml"; "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"
            "woff2" -> "font/woff2"; "mp3" -> "audio/mpeg"
            "ogg" -> "audio/ogg"; "wav" -> "audio/wav"; else -> "application/octet-stream"
        }
        val res = try { newChunkedResponse(Response.Status.OK, mime, ctx.assets.open("web/$clean")) }
        catch (e: Exception) { err(Response.Status.NOT_FOUND, "not found") }
        if (clean.endsWith(".html") || clean.endsWith(".js") || clean.endsWith(".css")) {
            res.addHeader("Cache-Control", "no-cache, must-revalidate")
        }
        return res
    }

    override fun serve(s: IHTTPSession): Response = try { route(s) }
        catch (e: Exception) { err(Response.Status.INTERNAL_ERROR, e.message ?: "error") }

    private fun route(s: IHTTPSession): Response {
        val uri = s.uri; val post = s.method == Method.POST

        val host = s.headers["host"]?.substringBefore(':') ?: ""
        val isLocalHost = host.isBlank() || host == "localhost" || host == "127.0.0.1" || host == "::1" || host.endsWith(".local") || host.matches(Regex("""^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"""))
        if (!isLocalHost) {
            return err(Response.Status.FORBIDDEN, "invalid host header")
        }

        // Public unauthenticated LAN discovery endpoint
        if (uri == "/discover" || uri == "/api/discover") {
            return json(JSONObject()
                .put("device", DeviceProfile.MODEL)
                .put("codename", DeviceProfile.CODENAME)
                .put("manufacturer", DeviceProfile.MANUFACTURER)
                .put("ip", getLocalIpAddress())
                .put("port", PORT)
                .put("token", store.token)
                .put("operationMode", store.operationMode)
                .put("navMode", store.navMode)
                .put("version", "2.0.0-universal"))
        }

        if (!uri.startsWith("/api/")) return asset(uri)   // static UI is public; it holds no data
        if (!authed(s)) return err(Response.Status.UNAUTHORIZED, "bad token")

        return when {
            uri == "/api/state" -> json(JSONObject()
                .put("device", DeviceProfile.MODEL)
                .put("codename", DeviceProfile.CODENAME)
                .put("manufacturer", DeviceProfile.MANUFACTURER)
                .put("battery", Battery.snapshot())
                .put("tasks", store.tasks())
                .put("timer", store.timer())
                .put("alarms", store.alarms())
                .put("isAlarmRinging", AlarmEngine.isRinging)
                .put("ringingAlarm", AlarmEngine.currentRingingAlarm ?: JSONObject.NULL)
                .put("solar", AlarmEngine.getSolarSummary(ctx))
                .put("settings", store.settings())
                .put("proximityAvailable", DockService.instance?.proximityEngine?.isAvailable ?: false)
                .put("pc", if (System.currentTimeMillis() - pcSeen < 6000) pcStats else JSONObject.NULL)
                .put("token", if (s.remoteIpAddress?.contains("127.0.0.1") == true) store.token else null)
                .put("mirrorActive", MainActivity.isMirrorActive)
                .put("now", System.currentTimeMillis()))

            uri == "/api/pc" && post -> { pcStats = body(s); pcSeen = System.currentTimeMillis(); json(JSONObject().put("ok", true)) }

            uri == "/api/tasks" && post -> { store.addTask(body(s).getString("text")); json(store.tasks()) }
            uri.startsWith("/api/tasks/") && post -> {
                val b = body(s)
                store.patchTask(uri.removePrefix("/api/tasks/"),
                    if (b.has("done")) b.getBoolean("done") else null, b.optBoolean("delete"))
                json(store.tasks())
            }

            uri == "/api/timer" && post -> {
                val b = body(s); val now = System.currentTimeMillis()
                val t = when (b.optString("action")) {
                    "start" -> JSONObject().put("running", true).put("label", b.optString("label", "Focus"))
                        .put("endsAt", now + b.optInt("minutes", 25) * 60_000L)
                    else -> JSONObject().put("running", false)
                }
                store.setTimer(t); json(t)
            }

            // Alarms Endpoints
            uri == "/api/alarms" && !post -> json(JSONObject()
                .put("alarms", store.alarms())
                .put("isRinging", AlarmEngine.isRinging)
                .put("ringingAlarm", AlarmEngine.currentRingingAlarm ?: JSONObject.NULL)
                .put("sounds", JSONArray(AlarmAudioPlayer.getAvailableSounds(ctx)))
                .put("solar", AlarmEngine.getSolarSummary(ctx)))

            uri == "/api/alarms" && post -> {
                val newAlm = store.addAlarm(body(s))
                MainActivity.instance?.reloadWebAlarms()
                json(JSONObject().put("ok", true).put("alarm", newAlm).put("alarms", store.alarms()))
            }

            (uri == "/api/alarms/dismiss" || uri == "/api/alarms/stop") && post -> {
                AlarmEngine.dismissAlarm(ctx)
                MainActivity.instance?.reloadWebAlarms()
                json(JSONObject().put("ok", true).put("isRinging", false).put("playing", false))
            }

            uri == "/api/alarms/test" && post -> {
                val b = body(s)
                val testAlarm = if (store.alarms().length() > 0) store.alarms().getJSONObject(0)
                else JSONObject().put("tag", "SUNRISE AWAKENING").put("type", "sunrise").put("sound", "homecoming.mp3")
                if (b.has("tag")) testAlarm.put("tag", b.getString("tag"))
                if (b.has("sound")) testAlarm.put("sound", b.getString("sound"))
                AlarmEngine.startRinging(ctx, testAlarm)
                json(JSONObject().put("ok", true).put("ringing", true))
            }

            uri == "/api/alarms/sounds" -> json(JSONObject()
                .put("sounds", JSONArray(AlarmAudioPlayer.getAvailableSounds(ctx))))

            uri.startsWith("/api/alarms/") && post -> {
                val id = uri.removePrefix("/api/alarms/")
                val b = body(s)
                if (b.optBoolean("delete", false)) {
                    store.deleteAlarm(id)
                } else {
                    store.patchAlarm(id, b)
                }
                MainActivity.instance?.reloadWebAlarms()
                json(JSONObject().put("ok", true).put("alarms", store.alarms()))
            }

            uri == "/api/settings" && post -> {
                val b = body(s)
                store.updateSettings(b)
                if (b.has("proximityGestures")) {
                    DockService.instance?.proximityEngine?.setEnabled(store.proximityGestures)
                }
                try {
                    Screen.setTimeout(store.timeoutSec)
                    HourlyWake.schedule(ctx)
                } catch (e: Exception) {
                    AppLogger.w("DockServer", "Failed applying screen timeout/hourly wake: ${e.message}")
                }
                MainActivity.instance?.reloadWebSettings()
                json(store.settings())
            }

            uri == "/api/screen/status" -> json(Screen.status(ctx).put("battery_temp", Battery.snapshot().opt("temp_c")))
            uri == "/api/screen/wake" && post -> json(JSONObject().put("wakefulness", Screen.wake()))
            uri == "/api/screen/sleep" && post -> json(JSONObject().put("wakefulness", Screen.sleep()))
            uri == "/api/calibration/enter" && post -> {
                MainActivity.instance?.runOnUiThread { MainActivity.instance?.onEnterCalibrationMode() }
                json(JSONObject().put("ok", true))
            }
            uri == "/api/calibration/exit" && post -> {
                MainActivity.instance?.runOnUiThread { MainActivity.instance?.calibrationController?.exitAndSave() }
                json(JSONObject().put("ok", true))
            }
            uri == "/api/screen/proximity" && post -> {
                val b = body(s)
                val enabled = b.getBoolean("enabled")
                store.proximityGestures = enabled
                DockService.instance?.proximityEngine?.setEnabled(enabled)
                json(JSONObject().put("ok", true).put("proximity_gestures", enabled))
            }
            uri == "/api/screen/timeout" && post -> {
                val sec = body(s).getInt("timeout_seconds").coerceIn(15, 3600)
                store.timeoutSec = sec; Screen.setTimeout(sec); json(Screen.status(ctx))
            }
            uri == "/api/screen/rotate" && post -> {
                val b = body(s)
                if (b.has("orientation")) {
                    Screen.setOrientation(b.getString("orientation"))
                } else if (b.has("auto_rotate")) {
                    Screen.setAutoRotate(b.getBoolean("auto_rotate"))
                }
                json(Screen.status(ctx))
            }

            uri == "/api/screen/snapshot" -> {
                if (MainActivity.isMirrorActive) {
                    val svg = """<svg xmlns="http://www.w3.org/2000/svg" width="720" height="340" viewBox="0 0 720 340"><rect width="720" height="340" fill="#000000"/><circle cx="360" cy="115" r="30" fill="#141A22" stroke="#CBB79F" stroke-width="2"/><text x="360" y="125" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#CBB79F">📷</text><text x="360" y="180" font-family="monospace" font-size="14" fill="#CBB79F" font-weight="bold" text-anchor="middle" letter-spacing="2">CAMERA IS TURNED ON</text><text x="360" y="210" font-family="sans-serif" font-size="12" fill="#888888" text-anchor="middle">Mirror mode active · Live stream paused to conserve bandwidth</text></svg>""".trimIndent()
                    val res = newFixedLengthResponse(Response.Status.OK, "image/svg+xml", svg)
                    res.addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                    res.addHeader("Pragma", "no-cache")
                    return res
                }
                val tmpFile = java.io.File(ctx.cacheDir, "screen_snap.png")
                Root.sh("screencap -p ${tmpFile.absolutePath}", 4)
                if (tmpFile.exists() && tmpFile.length() > 0) {
                    try {
                        val bytes = tmpFile.readBytes()
                        val res = newFixedLengthResponse(Response.Status.OK, "image/png", java.io.ByteArrayInputStream(bytes), bytes.size.toLong())
                        res.addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                        res.addHeader("Pragma", "no-cache")
                        res.addHeader("Expires", "0")
                        res
                    } catch (e: Exception) {
                        err(Response.Status.INTERNAL_ERROR, "failed reading snapshot: ${e.message}")
                    }
                } else {
                    err(Response.Status.INTERNAL_ERROR, "failed to capture snapshot")
                }
            }

            uri == "/api/system/adb-auth" -> {
                // ADB key injection is intentionally disabled in OSS Universal flavor
                err(Response.Status.FORBIDDEN, "ADB key injection is disabled in universal build")
            }

            uri == "/api/system/time-sync" && post -> {
                val b = body(s)
                val clientTs = b.optLong("timestamp", 0L)
                if (clientTs >= TimeSyncEngine.MIN_VALID_TIMESTAMP_MS) {
                    val ok = TimeSyncEngine.setSystemTime(clientTs)
                    MainActivity.instance?.reloadWebTime()
                    json(JSONObject().put("ok", ok).put("now", System.currentTimeMillis()).put("source", "client"))
                } else {
                    TimeSyncEngine.syncNetworkTimeAsync { _, _ ->
                        MainActivity.instance?.reloadWebTime()
                    }
                    json(JSONObject().put("ok", true).put("message", "Network time sync triggered").put("now", System.currentTimeMillis()))
                }
            }

            uri == "/api/system/logs" -> {
                val limit = s.parameters["limit"]?.firstOrNull()?.toIntOrNull() ?: 500
                val format = s.parameters["format"]?.firstOrNull() ?: "json"
                if (format == "text") {
                    val res = newFixedLengthResponse(Response.Status.OK, "text/plain; charset=utf-8", AppLogger.getLogsAsText(limit))
                    res.addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                    res.addHeader("Pragma", "no-cache")
                    res
                } else {
                    val entries = AppLogger.getLogs(limit)
                    json(JSONObject()
                        .put("count", entries.size)
                        .put("logs", JSONArray(entries)))
                }
            }

            uri == "/api/system/logs/clear" && post -> {
                AppLogger.clear()
                json(JSONObject().put("ok", true).put("message", "Logs cleared"))
            }

            uri == "/api/system/launchers" -> {
                json(LauncherManager.getSummary(ctx))
            }

            uri == "/api/system/launchers/set-default" && post -> {
                val b = body(s)
                val pkg = b.optString("package", ctx.packageName)
                val act = b.optString("activity", MainActivity::class.java.name)
                val ok = LauncherManager.setAsDefault(pkg, act)
                LauncherManager.launchActivity(ctx, pkg, act)
                if (!ok) {
                    LauncherManager.openSystemHomeSettings(ctx)
                }
                Screen.wake()
                json(JSONObject().put("ok", ok).put("fallback", !ok).put("package", pkg).put("activity", act))
            }

            uri == "/api/system/launchers/restore-stock" && post -> {
                val ok = LauncherManager.openSystemHomeSettings(ctx)
                json(JSONObject().put("ok", ok).put("message", "Opened Home Settings"))
            }

            uri == "/api/system/launchers/open" && post -> {
                val b = body(s)
                val pkg = b.optString("package")
                val act = b.optString("activity")
                val ok = if (pkg.isNotBlank() && act.isNotBlank()) {
                    LauncherManager.launchActivity(ctx, pkg, act)
                } else false
                json(JSONObject().put("ok", ok))
            }

            uri == "/api/system/launchers/settings" && post -> {
                val ok = LauncherManager.openSystemHomeSettings(ctx)
                json(JSONObject().put("ok", ok))
            }

            else -> err(Response.Status.NOT_FOUND, "no route")
        }
    }

    private var nsdManager: android.net.nsd.NsdManager? = null
    private var registrationListener: android.net.nsd.NsdManager.RegistrationListener? = null

    fun registerMdns() {
        try {
            nsdManager = ctx.getSystemService(Context.NSD_SERVICE) as? android.net.nsd.NsdManager ?: return
            val serviceInfo = android.net.nsd.NsdServiceInfo().apply {
                serviceName = "Thing Dock (${DeviceProfile.MODEL})"
                serviceType = "_thingdock._tcp."
                port = PORT
                setAttribute("token", store.token)
                setAttribute("version", "2.0.0")
            }
            registrationListener = object : android.net.nsd.NsdManager.RegistrationListener {
                override fun onServiceRegistered(serviceInfo: android.net.nsd.NsdServiceInfo?) {
                    android.util.Log.i("DockServer", "mDNS registered: ${serviceInfo?.serviceName}")
                }
                override fun onRegistrationFailed(serviceInfo: android.net.nsd.NsdServiceInfo?, errorCode: Int) {
                    android.util.Log.w("DockServer", "mDNS registration failed: $errorCode")
                }
                override fun onServiceUnregistered(serviceInfo: android.net.nsd.NsdServiceInfo?) {}
                override fun onUnregistrationFailed(serviceInfo: android.net.nsd.NsdServiceInfo?, errorCode: Int) {}
            }
            nsdManager?.registerService(serviceInfo, android.net.nsd.NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            android.util.Log.w("DockServer", "mDNS registration exception: ${e.message}")
        }
    }

    fun unregisterMdns() {
        try {
            registrationListener?.let { nsdManager?.unregisterService(it) }
        } catch (_: Exception) {}
        registrationListener = null
        nsdManager = null
    }

    fun getLocalIpAddress(): String {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addrs = iface.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (_: Exception) {}
        return "127.0.0.1"
    }
}
