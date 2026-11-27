import subprocess

adb = r"C:\platform-tools\adb.exe"

test_script = """
TOKEN=$(grep '<string name="token">' /data/data/dev.dwell.app/shared_prefs/dock.xml 2>/dev/null | sed -E 's/.*<string name="token">([^<]+)<\\/string>.*/\\1/')
[ -z "$TOKEN" ] && TOKEN="36769d33"
echo "TOKEN: $TOKEN"

btn="up"
gesture="single"
ts=$(date +%s%N | cut -b1-13)
body="{\\"hwAction\\":{\\"btn\\":\\"$btn\\",\\"gesture\\":\\"$gesture\\",\\"ts\\":$ts}}"
len=${#body}
echo "BODY: $body"
echo "LEN: $len"

(
    echo -ne "POST /api/settings HTTP/1.1\\r\\nHost: 127.0.0.1:8000\\r\\nX-Token: $TOKEN\\r\\nContent-Type: application/json\\r\\nContent-Length: $len\\r\\n\\r\\n$body"
) | nc 127.0.0.1 8000
"""

res = subprocess.run([adb, "shell", "su", "-c", f"sh -c '{test_script}'"], capture_output=True, text=True)
print("Output:\n", res.stdout)
print("Error:\n", res.stderr)
