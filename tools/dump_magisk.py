import subprocess

adb = r"C:\platform-tools\adb.exe"
dev = "af19879"

script = "sqlite3 /data/adb/magisk.db 'SELECT uid, policy, until, logging, notification FROM policies; SELECT * FROM settings;'\n"
res = subprocess.run([adb, "-s", dev, "shell", "su -c 'sh'"], input=script, capture_output=True, text=True)
print("DB Dump:\n", res.stdout)
