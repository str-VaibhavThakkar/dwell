import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

def sh(cmd):
    res = subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{cmd}'"], capture_output=True, text=True)
    return res.stdout.strip(), res.stderr.strip()

print("1. Creating /data/system/devices/keylayout directory...")
sh("mkdir -p /data/system/devices/keylayout && chmod 755 /data/system/devices/keylayout")

gpio_kl = """key 115   PAGE_UP
key 114   PAGE_DOWN
key 102   HOME
key 528   FOCUS
key 766   CAMERA
"""
sh(f"cat << 'EOF' > /data/system/devices/keylayout/soc:gpio_keys.kl\n{gpio_kl.strip()}\nEOF\nchmod 644 /data/system/devices/keylayout/soc:gpio_keys.kl")

qpnp_kl = """key 114   PAGE_DOWN
key 116   POWER
"""
sh(f"cat << 'EOF' > /data/system/devices/keylayout/qpnp_pon.kl\n{qpnp_kl.strip()}\nEOF\nchmod 644 /data/system/devices/keylayout/qpnp_pon.kl")

print("2. Verifying keylayout files in /data/system/devices/keylayout/:")
out, _ = sh("cat /data/system/devices/keylayout/soc:gpio_keys.kl")
print("soc:gpio_keys.kl:\n", out)
out2, _ = sh("cat /data/system/devices/keylayout/qpnp_pon.kl")
print("qpnp_pon.kl:\n", out2)
