import subprocess

ADB = r"C:\platform-tools\adb.exe"
DEVICE = "192.168.29.25:5555"

def adb_su(cmd_str):
    res = subprocess.run([ADB, "-s", DEVICE, "shell", f"su -c '{cmd_str}'"], capture_output=True, text=True)
    return res.stdout.strip(), res.stderr.strip()

print("Querying Magisk settings:")
out, err = adb_su("magisk --sqlite \"SELECT * FROM settings;\"")
print("Output:", out)
if err:
    print("Error:", err)

# Disable su notification in Magisk DB
print("\nDisabling su notification (popups):")
out2, err2 = adb_su("magisk --sqlite \"REPLACE INTO settings (key, value) VALUES ('su_notification', 0);\"")
print("Result:", out2)

# Verify
out3, err3 = adb_su("magisk --sqlite \"SELECT * FROM settings WHERE key='su_notification';\"")
print("Verified su_notification:", out3)
