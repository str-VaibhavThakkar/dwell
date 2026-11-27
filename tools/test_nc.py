import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

def sh(cmd):
    res = subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{cmd}'"], capture_output=True, text=True)
    return res.stdout.strip(), res.stderr.strip()

test_script = """
TOKEN="36769d33"
TS=$(date +%s%N | cut -b1-13)
BODY="{\\\"hwAction\\\":{\\\"btn\\\":\\\"up\\\",\\\"gesture\\\":\\\"single\\\",\\\"ts\\\":$TS}}"
LEN=${#BODY}
(
    echo -ne "POST /api/settings HTTP/1.1\\r\\nHost: 127.0.0.1:8000\\r\\nX-Token: $TOKEN\\r\\nContent-Type: application/json\\r\\nContent-Length: $LEN\\r\\n\\r\\n$BODY"
) | nc 127.0.0.1 8000
"""

out, err = sh(test_script.strip())
print("NC output:\n", out)
if err:
    print("NC error:\n", err)
