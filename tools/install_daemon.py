import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"
SCRIPT = r"C:\Users\USER\Desktop\redmi_Y3_flashing\desk_dock\scripts\device\hardware_buttons_daemon.sh"

print("1. Pushing hardware_buttons_daemon.sh to device...")
subprocess.run([ADB, "-s", DEV, "push", SCRIPT, "/data/local/tmp/hardware_buttons_daemon.sh"], check=True)

print("2. Installing to /data/adb/service.d/01-hardware-buttons.sh...")
cmd = "cp /data/local/tmp/hardware_buttons_daemon.sh /data/adb/service.d/01-hardware-buttons.sh && chmod 755 /data/adb/service.d/01-hardware-buttons.sh && rm -f /data/local/tmp/hardware_buttons_daemon.sh"
subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{cmd}'"], check=True)

print("3. Removing old switch_scene.sh...")
subprocess.run([ADB, "-s", DEV, "shell", "su -c 'rm -f /data/adb/switch_scene.sh /data/adb/vol_daemon.sh'"], check=True)

print("4. Starting daemon on device...")
start_cmd = "nohup /data/adb/service.d/01-hardware-buttons.sh >/dev/null 2>&1 &"
subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{start_cmd}'"])

print("5. Checking running processes...")
res = subprocess.run([ADB, "-s", DEV, "shell", "su -c 'pgrep -f hardware-buttons'"], capture_output=True, text=True)
print("Daemon PID(s):", res.stdout.strip())
