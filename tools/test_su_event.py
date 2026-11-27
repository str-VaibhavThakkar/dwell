import subprocess
import time

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

def sh(cmd):
    return subprocess.run([ADB, "-s", DEV, "shell", cmd], capture_output=True, text=True).stdout.strip()

print("1. Sending hardware Volume Up via su sendevent...")
cmds = [
    "sendevent /dev/input/event3 1 115 1",
    "sendevent /dev/input/event3 0 0 0",
    "sendevent /dev/input/event3 1 115 0",
    "sendevent /dev/input/event3 0 0 0"
]
combined = " && ".join(cmds)
res = subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{combined}'"], capture_output=True, text=True)
print("Sendevent result:", res.stdout or res.stderr or "OK")

time.sleep(1.2)

print("2. Checking /api/state on device...")
curl_res = sh("su -c 'curl -s http://127.0.0.1:8000/api/state'")
print("Curl state:", curl_res[:150])

print("3. Capturing screenshot...")
subprocess.run([ADB, "-s", DEV, "exec-out", "screencap", "-p"], stdout=open("real_phone_screen_v17.png", "wb"))
print("Done!")
