package dev.dwell.app

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileWriter
import java.io.PrintWriter
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/**
 * Privacy-safe, zero-permission, circular in-app diagnostic logger.
 * Stores only application operational metrics, lifecycle transitions,
 * power states, and caught exceptions. Never records private user data.
 */
object AppLogger {
    private const val TAG_PREFIX = "DockLog"
    private const val MAX_MEMORY_ENTRIES = 500
    private const val MAX_FILE_SIZE_BYTES = 512 * 1024L // 512 KB

    private val memoryLog = ArrayDeque<String>(MAX_MEMORY_ENTRIES)
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private var logFile: File? = null
    private var isInitialized = false

    @Synchronized
    fun init(ctx: Context) {
        if (isInitialized) return
        try {
            val logDir = File(ctx.filesDir, "logs").apply { if (!exists()) mkdirs() }
            logFile = File(logDir, "dock.log")
            isInitialized = true
            i("AppLogger", "Diagnostic logger initialized. Log file: ${logFile?.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG_PREFIX, "Failed to initialize log file: ${e.message}")
        }
    }

    private fun formatEntry(level: String, tag: String, msg: String): String {
        val time = dateFormat.format(Date())
        return "[$time] [$level] [$tag] $msg"
    }

    @Synchronized
    private fun writeEntry(entry: String) {
        if (memoryLog.size >= MAX_MEMORY_ENTRIES) {
            memoryLog.pollFirst()
        }
        memoryLog.addLast(entry)

        val file = logFile ?: return
        try {
            if (file.exists() && file.length() > MAX_FILE_SIZE_BYTES) {
                val oldFile = File(file.parentFile, "dock.log.1")
                if (oldFile.exists()) oldFile.delete()
                file.renameTo(oldFile)
            }
            FileWriter(file, true).use { fw ->
                PrintWriter(fw).use { pw ->
                    pw.println(entry)
                }
            }
        } catch (_: Exception) {}
    }

    fun d(tag: String, msg: String) {
        Log.d(tag, msg)
        writeEntry(formatEntry("DEBUG", tag, msg))
    }

    fun i(tag: String, msg: String) {
        Log.i(tag, msg)
        writeEntry(formatEntry("INFO", tag, msg))
    }

    fun w(tag: String, msg: String) {
        Log.w(tag, msg)
        writeEntry(formatEntry("WARN", tag, msg))
    }

    fun e(tag: String, msg: String, tr: Throwable? = null) {
        Log.e(tag, msg, tr)
        val fullMsg = if (tr != null) "$msg\n${Log.getStackTraceString(tr)}" else msg
        writeEntry(formatEntry("ERROR", tag, fullMsg))
    }

    @Synchronized
    fun getLogs(limit: Int = MAX_MEMORY_ENTRIES): List<String> {
        val count = limit.coerceAtMost(memoryLog.size)
        return memoryLog.toList().takeLast(count)
    }

    @Synchronized
    fun getLogsAsText(limit: Int = MAX_MEMORY_ENTRIES): String {
        return getLogs(limit).joinToString("\n")
    }

    @Synchronized
    fun clear() {
        memoryLog.clear()
        try {
            logFile?.delete()
            logFile?.createNewFile()
        } catch (_: Exception) {}
        i("AppLogger", "Logs cleared by user request.")
    }
}
