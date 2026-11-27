package dev.dwell.app

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Environment
import android.util.Log
import java.io.File

object AlarmAudioPlayer {
    private const val TAG = "AlarmAudio"
    private var mediaPlayer: MediaPlayer? = null
    @Volatile var isPlaying: Boolean = false
        private set

    fun getAvailableSounds(context: Context): List<String> {
        val sounds = mutableListOf("homecoming.mp3")
        try {
            // Check SD card folder /sdcard/DeskDock/alarms/
            val extDir = File(Environment.getExternalStorageDirectory(), "DeskDock/alarms")
            if (!extDir.exists()) extDir.mkdirs()
            extDir.listFiles()?.forEach { file ->
                if (file.isFile && isAudioExtension(file.extension)) {
                    if (!sounds.contains(file.name)) sounds.add(file.name)
                }
            }

            // Check internal app alarms dir
            val internalDir = File(context.filesDir, "alarms")
            if (!internalDir.exists()) internalDir.mkdirs()
            internalDir.listFiles()?.forEach { file ->
                if (file.isFile && isAudioExtension(file.extension)) {
                    if (!sounds.contains(file.name)) sounds.add(file.name)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error listing custom sounds: ${e.message}")
        }
        return sounds
    }

    private fun isAudioExtension(ext: String): Boolean {
        val lower = ext.lowercase()
        return lower in listOf("mp3", "ogg", "wav", "m4a", "aac", "flac")
    }

    fun play(context: Context, soundName: String = "homecoming.mp3") {
        stop()
        try {
            val mp = MediaPlayer()
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )

            var loaded = false
            // 1. Check custom path in external /sdcard/DeskDock/alarms/
            val extFile = File(Environment.getExternalStorageDirectory(), "DeskDock/alarms/$soundName")
            if (extFile.exists() && extFile.canRead()) {
                mp.setDataSource(extFile.absolutePath)
                loaded = true
            }

            // 2. Check internal filesDir/alarms
            if (!loaded) {
                val intFile = File(context.filesDir, "alarms/$soundName")
                if (intFile.exists() && intFile.canRead()) {
                    mp.setDataSource(intFile.absolutePath)
                    loaded = true
                }
            }

            // 3. Fallback / Default: bundled raw resource or asset
            if (!loaded) {
                try {
                    val afd = context.assets.openFd("web/audio/$soundName")
                    mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                    afd.close()
                    loaded = true
                } catch (_: Exception) {
                    val resId = context.resources.getIdentifier("homecoming", "raw", context.packageName)
                    if (resId != 0) {
                        val afd = context.resources.openRawResourceFd(resId)
                        mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                        afd.close()
                        loaded = true
                    }
                }
            }

            // 4. Ultimate fallback to homecoming.mp3
            if (!loaded) {
                Log.w(TAG, "Could not load sound '$soundName', falling back to bundled homecoming.mp3")
                val afd = context.assets.openFd("web/audio/homecoming.mp3")
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()
            }

            mp.isLooping = true
            mp.prepare()
            mp.start()
            mediaPlayer = mp
            isPlaying = true
            Log.i(TAG, "Alarm audio started playing: $soundName")
        } catch (e: Exception) {
            Log.e(TAG, "Error playing alarm sound '$soundName': ${e.message}", e)
        }
    }

    fun stop() {
        try {
            mediaPlayer?.let {
                if (it.isPlaying) it.stop()
                it.reset()
                it.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping media player: ${e.message}")
        } finally {
            mediaPlayer = null
            isPlaying = false
        }
    }
}
