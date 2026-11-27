#!/system/bin/sh
# Wait for Android boot to finish
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 3
done

# Screen Duty Cycle: 1-minute sleep timeout, permit display sleep while on USB power
svc power stayon false
settings put global stay_on_while_plugged_in 0
settings put system screen_off_timeout 60000

# Wi-Fi always awake during display sleep
settings put global wifi_sleep_policy 2

# Whitelist Termux and Dock from Android Doze / Battery Optimization
dumpsys deviceidle whitelist +com.termux
dumpsys deviceidle whitelist +dev.dwell.app

# Persistent display auto-rotation enabled (sensor-driven landscape/portrait)
settings put system accelerometer_rotation 1

# Disable lockscreen / keyguard (Zero-touch entry)
locksettings clear --old "" 2>/dev/null || true
locksettings set-disabled true
settings put secure lockscreen.disabled 1
settings put system lockscreen_sounds_enabled 0

# Volume Pinning: Freeze volume to maximum for smart speaker / desk dock mode
settings put system volume_music 25
settings put system volume_music_speaker 25
settings put system volume_alarm 7
settings put system volume_alarm_speaker 7
settings put system volume_ring 7
settings put system volume_ring_speaker 7
settings put system volume_system 7
settings put system volume_voice 7
settings put system sound_effects_enabled 0

# Start persistent Wireless ADB
setprop service.adb.tcp.port 5555
stop adbd
start adbd
