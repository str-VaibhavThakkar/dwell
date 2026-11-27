#!/system/bin/sh
# Wait for Android boot and DockServer to be up
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 3
done

# Wait for local port 8000
while ! nc -w 1 127.0.0.1 8000 </dev/null >/dev/null 2>&1; do
    sleep 2
done

# Listen to volume keys across input devices
getevent -l | while read -r dev type code val; do
    if [ "$val" = "DOWN" ]; then
        if [ "$code" = "KEY_VOLUMEUP" ]; then
            /data/adb/switch_scene.sh UP >/dev/null 2>&1
        elif [ "$code" = "KEY_VOLUMEDOWN" ]; then
            /data/adb/switch_scene.sh DOWN >/dev/null 2>&1
        fi
    fi
done
