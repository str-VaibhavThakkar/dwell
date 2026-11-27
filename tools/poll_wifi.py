import subprocess
import time
import socket

adb = r"C:\platform-tools\adb.exe"

print("Waiting for phone to reconnect to Wi-Fi...")
for attempt in range(30):
    time.sleep(2)
    # Check ping or port 5555
    s = socket.socket()
    s.settimeout(0.5)
    try:
        s.connect(("192.168.29.25", 5555))
        s.close()
        print(f"Port 5555 is reachable after {(attempt+1)*2}s!")
        break
    except:
        pass
    finally:
        s.close()

# Try adb connect
subprocess.run([adb, "connect", "192.168.29.25:5555"])
res = subprocess.run([adb, "devices"], capture_output=True, text=True)
print("ADB Devices:\n", res.stdout)
