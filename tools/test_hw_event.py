import subprocess
import time

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

def adb_sh(cmd):
    res = subprocess.run([ADB, "-s", DEV, "shell", cmd], capture_output=True, text=True)
    return res.stdout.strip()

print("1. Injecting physical KEY_VOLUMEUP to /dev/input/event3...")
# Send key down
adb_sh("sendevent /dev/input/event3 1 115 1")
adb_sh("sendevent /dev/input/event3 0 0 0")
time.sleep(0.05)
# Send key up
adb_sh("sendevent /dev/input/event3 1 115 0")
adb_sh("sendevent /dev/input/event3 0 0 0")

print("2. Waiting 1 second for daemon and UI...")
time.sleep(1.2)

print("3. Checking current state...")
res = subprocess.run([ADB, "-s", DEV, "shell", "curl -s http://127.0.0.1:8000/api/state"], capture_output=True, text=True)
print("State hwAction:", res.stdout[:200])

print("4. Capturing screenshot...")
subprocess.run([ADB, "-s", DEV, "exec-out", "screencap", "-p"], stdout=open("real_phone_screen_v16.png", "wb"))
print("Done!")
