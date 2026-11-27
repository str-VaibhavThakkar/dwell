import subprocess

adb = r"C:\platform-tools\adb.exe"
dev = "af19879"

script = """
sqlite3 /data/adb/magisk.db <<EOF
UPDATE policies SET notification=0;
REPLACE INTO settings VALUES ('su_notification', '0');
EOF
"""

subprocess.run([adb, "-s", dev, "shell", "su -c 'sh'"], input=script, text=True)
print("Updated magisk.db cleanly!")
