import subprocess
import time

adb = r"C:\platform-tools\adb.exe"

print("Current system_server PID:")
p = subprocess.run([adb, "shell", "pidof system_server"], capture_output=True, text=True)
old_pid = p.stdout.strip()
print("Old PID:", old_pid)

print("\nExecuting 'su -c stop && su -c start' to reload EventHub and InputManager...")
subprocess.run([adb, "shell", "su -c 'stop'"])
time.sleep(2)
subprocess.run([adb, "shell", "su -c 'start'"])

print("Waiting for system_server to restart...")
for i in range(25):
    time.sleep(2)
    # Check if adb is responsive
    res = subprocess.run([adb, "shell", "pidof system_server"], capture_output=True, text=True)
    new_pid = res.stdout.strip()
    if new_pid and new_pid != old_pid:
        print(f"system_server restarted successfully! New PID: {new_pid} (after { (i+1)*2 }s)")
        break
    print(f"Waiting... ({ (i+1)*2 }s)")

# Wait for boot completion
print("Waiting for sys.boot_completed...")
for i in range(20):
    time.sleep(1)
    res = subprocess.run([adb, "shell", "getprop sys.boot_completed"], capture_output=True, text=True)
    if res.stdout.strip() == "1":
        print("Boot completed!")
        break
