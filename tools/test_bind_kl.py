import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

sh_content = """#!/system/bin/sh
# 1. Modify Generic.kl
cp /system/usr/keylayout/Generic.kl /data/local/tmp/Generic.kl
sed -i "s/key 114   VOLUME_DOWN/key 114   PAGE_DOWN/" /data/local/tmp/Generic.kl
sed -i "s/key 115   VOLUME_UP/key 115   PAGE_UP/" /data/local/tmp/Generic.kl
mount -o bind /data/local/tmp/Generic.kl /system/usr/keylayout/Generic.kl

# 2. Modify gpio-keys.kl
cp /vendor/usr/keylayout/gpio-keys.kl /data/local/tmp/gpio-keys.kl
sed -i "s/key 114   VOLUME_DOWN/key 114   PAGE_DOWN/" /data/local/tmp/gpio-keys.kl
sed -i "s/key 115   VOLUME_UP/key 115   PAGE_UP/" /data/local/tmp/gpio-keys.kl
mount -o bind /data/local/tmp/gpio-keys.kl /vendor/usr/keylayout/gpio-keys.kl

echo "Generic.kl:"
grep -E "key 114|key 115" /system/usr/keylayout/Generic.kl
echo "gpio-keys.kl:"
grep -E "key 114|key 115" /vendor/usr/keylayout/gpio-keys.kl
"""

with open("desk_dock/tools/run_bind.sh", "w", newline="\n") as f:
    f.write(sh_content)

subprocess.run([ADB, "-s", DEV, "push", "desk_dock/tools/run_bind.sh", "/data/local/tmp/run_bind.sh"], check=True)
res = subprocess.run([ADB, "-s", DEV, "shell", "su -c 'sh /data/local/tmp/run_bind.sh'"], capture_output=True, text=True)
print("Output:\n", res.stdout)
