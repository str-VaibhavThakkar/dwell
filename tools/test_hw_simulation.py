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

print("Querying /api/state before simulation...")
before = get_state()
print("Initial hwAction:", before.get("settings", {}).get("hwAction"))

print("\nSimulating physical Volume Up event via root sendevent on /dev/input/event3...")
cmd = "su -c 'sendevent /dev/input/event3 1 115 1 && sendevent /dev/input/event3 0 0 0 && sendevent /dev/input/event3 1 115 0 && sendevent /dev/input/event3 0 0 0'"
subprocess.run([adb, "shell", cmd])

time.sleep(1)

after = get_state()
print("hwAction after Volume Up:", after.get("settings", {}).get("hwAction"))
