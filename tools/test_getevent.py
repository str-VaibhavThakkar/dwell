import subprocess
import time

adb = r"C:\platform-tools\adb.exe"

# Start getevent -l in background
p = subprocess.Popen([adb, "shell", "su -c 'getevent -l /dev/input/event3'"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(0.5)

# Send event with proper root quoting
cmd = "su -c 'sendevent /dev/input/event3 1 115 1 && sendevent /dev/input/event3 0 0 0 && sendevent /dev/input/event3 1 115 0 && sendevent /dev/input/event3 0 0 0'"
res = subprocess.run([adb, "shell", cmd], capture_output=True, text=True)
print("sendevent stdout:", res.stdout)
print("sendevent stderr:", res.stderr)
time.sleep(0.5)

p.terminate()
out, err = p.communicate()
print("getevent output on event3:")
print(out)
