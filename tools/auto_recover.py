import subprocess
import time
import socket
import os

adb = r"C:\platform-tools\adb.exe"
apk_path = os.path.abspath(r"desk_dock\bin\signed\app-debug-aligned-debugSigned.apk")
daemon_path = os.path.abspath(r"desk_dock\scripts\device\hardware_buttons_daemon.sh")

print(f"Auto-recover daemon started.")
print(f"Target signed APK: {apk_path}")
print(f"Waiting for phone connection (via USB or Wi-Fi 192.168.29.25:5555)...")

def is_wifi_open():
    s = socket.socket()
    s.settimeout(0.5)
    try:
        s.connect(('192.168.29.25', 5555))
        return True
    except:
        return False
    finally:
        s.close()

def get_devices():
    res = subprocess.run([adb, "devices"], capture_output=True, text=True)
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip() and not line.startswith("*")]
    devs = []
    for line in lines[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            devs.append(parts[0])
    return devs

while True:
    # 1. Check if already visible in adb devices
    devices = get_devices()
    if not devices:
        # Check if Wi-Fi is open
        if is_wifi_open():
            print("Port 5555 open! Connecting via ADB...")
            subprocess.run([adb, "connect", "192.168.29.25:5555"])
            time.sleep(1)
            devices = get_devices()

    if devices:
        dev = devices[0]
        print(f"Phone detected: {dev}!")
        
        print("Disabling/removing deskdock_keys module to eradicate green focus border...")
        subprocess.run([adb, "-s", dev, "shell", "su -c 'touch /data/adb/modules/deskdock_keys/disable 2>/dev/null; rm -rf /data/adb/modules/deskdock_keys 2>/dev/null'"])

        print("Pushing updated hardware_buttons_daemon.sh with contact debouncing...")
        subprocess.run([adb, "-s", dev, "push", daemon_path, "/data/local/tmp/01-hardware-buttons.sh"])
        subprocess.run([adb, "-s", dev, "shell", "su -c 'cp /data/local/tmp/01-hardware-buttons.sh /data/adb/service.d/01-hardware-buttons.sh && chmod 755 /data/adb/service.d/01-hardware-buttons.sh && pkill -f 01-hardware-buttons.sh; nohup /data/adb/service.d/01-hardware-buttons.sh >/dev/null 2>&1 &'"])

        print("Installing updated signed APK...")
        inst = subprocess.run([adb, "-s", dev, "install", "-r", "-d", apk_path], capture_output=True, text=True)
        print("Install output:\n", inst.stdout or inst.stderr)
        
        print("Starting dev.dwell.app/.MainActivity...")
        start = subprocess.run([adb, "-s", dev, "shell", "am start -n dev.dwell.app/.MainActivity"], capture_output=True, text=True)
        print("Start output:\n", start.stdout)
        
        print("Waking screen, locking volume to max, ensuring port 5555 stays open...")
        subprocess.run([adb, "-s", dev, "shell", "input keyevent 224 && cmd media_session volume --stream 3 --set 15 && setprop service.adb.tcp.port 5555"])
        
        time.sleep(2)
        print("Capturing confirmation screenshot...")
        p = subprocess.run([adb, "-s", dev, "exec-out", "screencap", "-p"], capture_output=True)
        with open("phone_screen_recovered_success.png", "wb") as f:
            f.write(p.stdout)
        print("Screenshot saved to phone_screen_recovered_success.png! Recovery COMPLETE!")
        break

    time.sleep(1)
