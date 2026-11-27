import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEV = "192.168.29.25:5555"

cmd = """
line="/dev/input/event3: EV_KEY KEY_VOLUMEUP DOWN"
read dev type code val << EOF
$line
EOF
echo "dev=$dev type=$type code=$code val=$val"
"""

res = subprocess.run([ADB, "-s", DEV, "shell", f"su -c '{cmd.strip()}'"], capture_output=True, text=True)
print("Result:\n", res.stdout)
