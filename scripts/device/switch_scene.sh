#!/system/bin/sh
# Scene cycle helper for Redmi Y3 volume buttons
DIR="UP"
if [ "$1" = "DOWN" ]; then
    DIR="DOWN"
fi

TOKEN=$(grep '<string name="token">' /data/data/dev.dwell.app/shared_prefs/dock.xml 2>/dev/null | sed -E 's/.*<string name="token">([^<]+)<\/string>.*/\1/')
if [ -z "$TOKEN" ]; then
    TOKEN="36769d33"
fi

# Detect current scene from dock.xml
CURRENT="desk"
if grep -q 'scene&quot;:&quot;mountains&quot;' /data/data/dev.dwell.app/shared_prefs/dock.xml 2>/dev/null; then
    CURRENT="mountains"
elif grep -q 'scene&quot;:&quot;sakura&quot;' /data/data/dev.dwell.app/shared_prefs/dock.xml 2>/dev/null; then
    CURRENT="sakura"
elif grep -q 'scene&quot;:&quot;sky&quot;' /data/data/dev.dwell.app/shared_prefs/dock.xml 2>/dev/null; then
    CURRENT="sky"
fi

NEXT="desk"
if [ "$DIR" = "UP" ]; then
    case "$CURRENT" in
        "desk") NEXT="mountains" ;;
        "mountains") NEXT="sakura" ;;
        "sakura") NEXT="sky" ;;
        "sky") NEXT="desk" ;;
    esac
else
    case "$CURRENT" in
        "desk") NEXT="sky" ;;
        "sky") NEXT="sakura" ;;
        "sakura") NEXT="mountains" ;;
        "mountains") NEXT="desk" ;;
    esac
fi

BODY="{\"scene\":\"$NEXT\"}"
LEN=${#BODY}

# Send to local NanoHTTPD server on phone
(
  echo -ne "POST /api/settings HTTP/1.1\r\nHost: 127.0.0.1:8000\r\nX-Token: $TOKEN\r\nContent-Type: application/json\r\nContent-Length: $LEN\r\n\r\n$BODY"
) | nc -w 1 127.0.0.1 8000 >/dev/null 2>&1

echo "Switched from $CURRENT to $NEXT"
