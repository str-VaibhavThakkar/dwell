import subprocess
import time

ADB = r"C:\platform-tools\adb.exe"
DEVICE = "192.168.29.25:5555"
APK_PATH = r"C:\Users\USER\Desktop\redmi_Y3_flashing\desk_dock\bin\desk-dock-onclite-debug-patched.apk"

def run(cmd_list):
    res = subprocess.run(cmd_list, capture_output=True, text=True)
    return res.stdout.strip(), res.stderr.strip()

print("1. Pushing patched APK to /data/local/tmp/...")
out, err = run([ADB, "-s", DEVICE, "push", APK_PATH, "/data/local/tmp/base_patched.apk"])
print("Push:", out or err)

print("2. Locating installed base.apk path on device...")
out, _ = run([ADB, "-s", DEVICE, "shell", "pm path dev.dwell.app"])
if "package:" not in out:
    print("Error: dev.dwell.app not found on device!")
    exit(1)
target_apk = out.replace("package:", "").strip()
print("Target APK on device:", target_apk)

print("3. Replacing base.apk with root permissions...")
cmd_replace = f"cp /data/local/tmp/base_patched.apk {target_apk} && chmod 644 {target_apk} && rm -f /data/local/tmp/base_patched.apk"
out, err = run([ADB, "-s", DEVICE, "shell", f"su -c '{cmd_replace}'"])
print("Replace result:", out or err or "Success")

print("4. Restarting dev.dwell.app...")
run([ADB, "-s", DEVICE, "shell", "am force-stop dev.dwell.app"])
time.sleep(1)
out, err = run([ADB, "-s", DEVICE, "shell", "am start -n dev.dwell.app/.MainActivity"])
print("Start result:", out)

time.sleep(2)
# Ensure screen is awake
run([ADB, "-s", DEVICE, "shell", "input keyevent 224 && wm dismiss-keyguard"])
print("5. Deployment complete and app started!")
