import subprocess
import time

adb = r"C:\platform-tools\adb.exe"
dev = "af19879"

# Simulate Volume Up
cmd = "su -c 'sendevent /dev/input/event3 1 115 1 && sendevent /dev/input/event3 0 0 0 && sendevent /dev/input/event3 1 115 0 && sendevent /dev/input/event3 0 0 0'"
subprocess.run([adb, "-s", dev, "shell", cmd])

time.sleep(0.6)

p = subprocess.run([adb, "-s", dev, "exec-out", "screencap", "-p"], capture_output=True)
with open("phone_screen_after_volup_live.png", "wb") as f:
    f.write(p.stdout)
print("Captured screenshot after Volume Up! Size:", len(p.stdout))
