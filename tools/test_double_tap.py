import subprocess
import time

adb = r"C:\platform-tools\adb.exe"
dev = "af19879"

# First tap
tap1 = "su -c 'sendevent /dev/input/event0 1 114 1 && sendevent /dev/input/event0 0 0 0 && sendevent /dev/input/event0 1 114 0 && sendevent /dev/input/event0 0 0 0'"
subprocess.run([adb, "-s", dev, "shell", tap1])

time.sleep(0.12)

# Second tap
tap2 = "su -c 'sendevent /dev/input/event0 1 114 1 && sendevent /dev/input/event0 0 0 0 && sendevent /dev/input/event0 1 114 0 && sendevent /dev/input/event0 0 0 0'"
subprocess.run([adb, "-s", dev, "shell", tap2])

time.sleep(1.2)

p = subprocess.run([adb, "-s", dev, "exec-out", "screencap", "-p"], capture_output=True)
with open("phone_screen_timer_running.png", "wb") as f:
    f.write(p.stdout)
print("Captured screenshot after double tap! Size:", len(p.stdout))
