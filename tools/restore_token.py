import subprocess

adb = r"C:\platform-tools\adb.exe"
dev = "af19879"

xml = """<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="token">36769d33</string>
</map>
"""

with open("dock_prefs.xml", "w") as f:
    f.write(xml)

# Get app UID
uid_p = subprocess.run([adb, "-s", dev, "shell", "dumpsys package dev.dwell.app | grep userId="], capture_output=True, text=True)
uid_str = uid_p.stdout.strip().split("=")[-1]
print("App UID:", uid_str)

subprocess.run([adb, "-s", dev, "push", "dock_prefs.xml", "/data/local/tmp/dock.xml"])
cmd = f"cp /data/local/tmp/dock.xml /data/data/dev.dwell.app/shared_prefs/dock.xml && chown {uid_str}:{uid_str} /data/data/dev.dwell.app/shared_prefs/dock.xml && chmod 660 /data/data/dev.dwell.app/shared_prefs/dock.xml"
subprocess.run([adb, "-s", dev, "shell", "su", "-c", cmd])

# Restart dev.dwell.app
subprocess.run([adb, "-s", dev, "shell", "am force-stop dev.dwell.app && am start -n dev.dwell.app/.MainActivity"])
print("Restored token 36769d33 and restarted dev.dwell.app!")
