import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

def sh(cmd):
    res = subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{cmd}'"], capture_output=True, text=True)
    return res.stdout.strip()

print("1. Checking keylayout paths:")
print("ls /system/usr/keylayout:", sh("ls /system/usr/keylayout/ | grep Generic"))
print("ls /vendor/usr/keylayout:", sh("ls /vendor/usr/keylayout/ | grep gpio"))

print("\n2. Checking if /data/system/devices exists:")
print(sh("mkdir -p /data/system/devices/keylayout && ls -la /data/system/devices/"))

print("\n3. Testing remount rw on /vendor or /system:")
res = sh("mount -o remount,rw /vendor 2>&1")
print("Remount /vendor:", res)
res2 = sh("mount -o remount,rw / 2>&1")
print("Remount /:", res2)
