#!/system/bin/sh
# Redmi Y3 Hardware Buttons Daemon (Volume Up & Down Gesture Controller)
# Volume Up: Instant Sequential Page Cycling (Dashboard -> Focus -> Tasks -> Telemetry -> Dashboard)
# Volume Down: Contextual Actions (Single Tap, Double Tap, Long Hold)
# Audio Stream: Pin to max (100%), HUD suppressed

# Wait for boot completion and local DockServer
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
done

while ! nc -w 1 127.0.0.1 8000 </dev/null >/dev/null 2>&1; do
    sleep 1
done

# Read token
TOKEN=$(grep '<string name="token">' /data/data/dev.dwell.app/shared_prefs/dock.xml 2>/dev/null | sed -E 's/.*<string name="token">([^<]+)<\/string>.*/\1/')
[ -z "$TOKEN" ] && TOKEN="36769d33"

# Initialize Volume Pinning to Maximum for Smart Speaker / Desk Dock mode
cmd media_session volume --stream 3 --set 15 >/dev/null 2>&1
settings put system volume_music 25 >/dev/null 2>&1

dispatch_action() {
    btn="$1"
    gesture="$2"
    # Wake screen if asleep (idempotent)
    input keyevent 224 >/dev/null 2>&1
    ts=$(date +%s%N | cut -b1-13)
    body="{\"hwAction\":{\"btn\":\"$btn\",\"gesture\":\"$gesture\",\"ts\":$ts}}"
    len=${#body}
    req="POST /api/settings HTTP/1.1\r\nHost: 127.0.0.1:8000\r\nX-Token: $TOKEN\r\nContent-Type: application/json\r\nContent-Length: $len\r\nConnection: close\r\n\r\n$body"
    ( printf "%b" "$req" | nc -w 1 -W 1 127.0.0.1 8000 >/dev/null 2>&1 ) &
}

# State variables for Volume Down gesture recognition
DOWN_PID=""
PENDING_TAP_PID=""
LAST_TAP_TS=0
LAST_DOWN_EV_TS=0
LAST_UP_EV_TS=0

# Monitor all input events (filters for KEY_VOLUMEUP and KEY_VOLUMEDOWN)
getevent -l | while read -r dev type code val; do
    [ "$type" != "EV_KEY" ] && continue

    NOW_EV_MS=$(date +%s%N | cut -b1-13)

    if [ "$code" = "KEY_VOLUMEUP" ]; then
        if [ "$val" = "DOWN" ]; then
            DIFF=$(( NOW_EV_MS - LAST_UP_EV_TS ))
            [ $DIFF -lt 65 ] && continue
            LAST_UP_EV_TS=$NOW_EV_MS
            # Volume Up = Dedicated sequential page switcher (instant)
            dispatch_action "up" "single"
            # Pin volume to 100%
            cmd media_session volume --stream 3 --set 15 >/dev/null 2>&1 &
        fi
    elif [ "$code" = "KEY_VOLUMEDOWN" ]; then
        if [ "$val" = "DOWN" ]; then
            DIFF=$(( NOW_EV_MS - LAST_DOWN_EV_TS ))
            [ $DIFF -lt 65 ] && continue
            LAST_DOWN_EV_TS=$NOW_EV_MS

            # Cancel any pending single-tap action from previous release
            if [ -n "$PENDING_TAP_PID" ]; then
                kill "$PENDING_TAP_PID" 2>/dev/null
                PENDING_TAP_PID=""
            fi
            
            # Start long-press timer (500ms hold)
            (
                sleep 0.5
                dispatch_action "down" "long"
                # Pin volume
                cmd media_session volume --stream 3 --set 15 >/dev/null 2>&1
            ) &
            DOWN_PID=$!
        elif [ "$val" = "UP" ]; then
            # Pin volume
            cmd media_session volume --stream 3 --set 15 >/dev/null 2>&1 &
            
            # If long-press timer is still running, it was a short tap!
            if [ -n "$DOWN_PID" ] && kill -0 "$DOWN_PID" 2>/dev/null; then
                kill "$DOWN_PID" 2>/dev/null
                DOWN_PID=""
                
                NOW_MS=$(date +%s%N | cut -b1-13)
                DIFF=$(( NOW_MS - LAST_TAP_TS ))
                
                if [ $DIFF -lt 280 ]; then
                    # Double tap detected!
                    LAST_TAP_TS=0
                    if [ -n "$PENDING_TAP_PID" ]; then
                        kill "$PENDING_TAP_PID" 2>/dev/null
                        PENDING_TAP_PID=""
                    fi
                    dispatch_action "down" "double"
                else
                    # Potential single tap: wait 240ms for possible second tap
                    LAST_TAP_TS=$NOW_MS
                    (
                        sleep 0.24
                        dispatch_action "down" "single"
                    ) &
                    PENDING_TAP_PID=$!
                fi
            else
                DOWN_PID=""
            fi
        fi
    fi
done
