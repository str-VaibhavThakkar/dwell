#!/system/bin/sh
# Battery Protection Daemon for Redmi Y3 (onclite)
# Enforces 50%-60% nominal charge (~3.8V) and 40°C thermal protection

NODE_SUSPEND="/sys/class/power_supply/battery/input_suspend"
NODE_CAPACITY="/sys/class/power_supply/battery/capacity"
NODE_TEMP="/sys/class/power_supply/battery/temp"
NODE_VOLTAGE="/sys/class/power_supply/battery/voltage_now"
LOG_FILE="/data/local/tmp/battery_guard.log"

echo "[$(date)] Battery Guard Service Started" > "$LOG_FILE"

while true; do
    if [ -f "$NODE_CAPACITY" ] && [ -f "$NODE_TEMP" ]; then
        SOC=$(cat "$NODE_CAPACITY" 2>/dev/null || echo 0)
        TEMP=$(cat "$NODE_TEMP" 2>/dev/null || echo 0)
        VOLT=$(cat "$NODE_VOLTAGE" 2>/dev/null || echo 0)

        # Thermal Emergency Cutoff (>= 40.0°C)
        if [ "$TEMP" -ge 400 ]; then
            echo 1 > "$NODE_SUSPEND"
            echo "[$(date)] THERMAL CUTOFF: Temp=$TEMP (>=40°C), charging paused" >> "$LOG_FILE"
        # Overcharge Protection (>= 60%)
        elif [ "$SOC" -ge 60 ]; then
            echo 1 > "$NODE_SUSPEND"
            echo "[$(date)] CHARGE CAP REACHED: SOC=$SOC% (>=60%), V=$VOLT, charging paused" >> "$LOG_FILE"
        # Resume Charging (<= 50% AND Temp <= 35.0°C)
        elif [ "$SOC" -le 50 ] && [ "$TEMP" -le 350 ]; then
            echo 0 > "$NODE_SUSPEND"
        fi
    fi
    sleep 15
done
