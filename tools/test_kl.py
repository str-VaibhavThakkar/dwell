import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEVICE = "192.168.29.25:5555"

def adb_su(cmd_str):
    res = subprocess.run([ADB, "-s", DEVICE, "shell", f"su -c '{cmd_str}'"], capture_output=True, text=True)
    return res.stdout.strip(), res.stderr.strip()

print("Testing bind mount on keylayout...")
# First check if /vendor/usr/keylayout/gpio-keys.kl exists
out, err = adb_su("ls -la /vendor/usr/keylayout/gpio-keys.kl")
print("gpio-keys.kl:", out)

# Check Generic.kl
out_gen, _ = adb_su("ls -la /system/usr/keylayout/Generic.kl")
print("Generic.kl:", out_gen)
