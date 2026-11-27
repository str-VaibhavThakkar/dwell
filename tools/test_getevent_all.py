import subprocess
import time

adb = r"C:\platform-tools\adb.exe"

# Start getevent -l without device
p = subprocess.Popen([adb, "shell", "su -c 'getevent -l'"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(0.5)

# Send event to event3
cmd = "su -c 'sendevent /dev/input/event3 1 115 1 && sendevent /dev/input/event3 0 0 0 && sendevent /dev/input/event3 1 115 0 && sendevent /dev/input/event3 0 0 0'"
subprocess.run([adb, "shell", cmd])
time.sleep(0.5)

p.terminate()
out, err = p.communicate()
print("getevent -l (all devices):")
for line in out.strip().splitlines()[-10:]:
    print(repr(line))
