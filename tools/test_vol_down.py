import subprocess
import time
import json
import urllib.request

adb = r"C:\platform-tools\adb.exe"
token = "36769d33"

def get_state():
    req = urllib.request.Request("http://192.168.29.25:8000/api/state", headers={"X-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

print("Querying /api/state before Volume Down...")
before = get_state()
print("Initial hwAction:", before.get("settings", {}).get("hwAction"))

# Simulate single tap on /dev/input/event0 (code 114)
print("\nSimulating Volume Down single tap on /dev/input/event0...")
cmd = "su -c 'sendevent /dev/input/event0 1 114 1 && sendevent /dev/input/event0 0 0 0 && sendevent /dev/input/event0 1 114 0 && sendevent /dev/input/event0 0 0 0'"
subprocess.run([adb, "shell", cmd])

# Wait for tap timeout (240ms + buffer)
time.sleep(1)

after = get_state()
print("hwAction after Volume Down tap:", after.get("settings", {}).get("hwAction"))
