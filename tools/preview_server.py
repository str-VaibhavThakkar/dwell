import http.server
import socketserver
import os
import json
import time
import subprocess
import io

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

PORT = 8080
WEB_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web"))
if not os.path.exists(WEB_ROOT):
    WEB_ROOT = os.path.join(os.path.dirname(__file__), "extracted", "assets", "web")

ADB_PATH = r"C:\platform-tools\adb.exe" if os.path.exists(r"C:\platform-tools\adb.exe") else r"C:\scrcpy-win64-v4.1\adb.exe"
DEVICE_SERIAL = "192.168.29.25:5555"

# In-memory mock state
state = {
    "settings": {
        "place": "Kolkata, WB",
        "lat": 22.5643,
        "lon": 88.3693,
        "scene": "desk",
        "nightStart": 0,
        "nightEnd": 6,
        "pauseCap": 60,
        "resumeCap": 50,
        "pauseTemp": 40,
        "resumeTemp": 35,
        "guardEnabled": True,
        "hourlyWake": True,
        "quietHours": True,
        "autoLocation": True,
        "timeFormat": "12h",
        "countdowns": [
            {"date": "2028-01-20", "label": "JEE 2028"}
        ]
    },
    "timer": {
        "running": False,
        "label": "Focus",
        "endsAt": 0
    },
    "tasks": [
        {"id": "1", "text": "Rotational Dynamics Problem Set 4", "done": False},
        {"id": "2", "text": "Coordinate Geometry Review (Circles)", "done": True},
        {"id": "3", "text": "Thermodynamics Formula Sheet", "done": False}
    ],
    "alarms": [
        {"id": "alm_sunrise", "tag": "Sunrise Awakening", "type": "sunrise", "offsetMinutes": 0, "sound": "homecoming.mp3", "enabled": True, "days": []},
        {"id": "alm_sunset", "tag": "Sunset Reflection", "type": "sunset", "offsetMinutes": 0, "sound": "homecoming.mp3", "enabled": False, "days": []},
        {"id": "alm_morning", "tag": "Morning Routine", "type": "fixed", "time": "07:00", "sound": "homecoming.mp3", "enabled": True, "days": [1, 2, 3, 4, 5]}
    ],
    "isAlarmRinging": False,
    "ringingAlarm": None,
    "solar": {
        "sunrise": "06:38",
        "sunset": "17:24"
    },
    "battery": {
        "capacity": 58,
        "temp_c": 31.6,
        "status": "Idle · 3.85V",
        "guard": {
            "mode": "internal",
            "charging_allowed": False
        }
    },
    "pc": {
        "host": "RedmiBook 15",
        "cpu": 12,
        "ram": 45,
        "cpu_temp": 41
    }
}

screen_status = {
    "wakefulness": "Awake",
    "timeout_s": 60,
    "auto_rotate": True
}

# Snapshot cache
_cached_snapshot = None
_cached_time = 0

def capture_device_snapshot():
    global _cached_snapshot, _cached_time
    now = time.time()
    if _cached_snapshot and (now - _cached_time < 2.0):
        return _cached_snapshot, "image/jpeg"

    # Try capturing from real device over ADB
    if os.path.exists(ADB_PATH):
        try:
            cmd = [ADB_PATH, "-s", DEVICE_SERIAL, "exec-out", "screencap", "-p"]
            p = subprocess.run(cmd, capture_output=True, timeout=5)
            if p.returncode == 0 and len(p.stdout) > 1000:
                raw_png = p.stdout
                if HAS_PIL:
                    img = Image.open(io.BytesIO(raw_png)).convert("RGB")
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=85)
                    _cached_snapshot = buf.getvalue()
                    _cached_time = now
                    return _cached_snapshot, "image/jpeg"
                else:
                    _cached_snapshot = raw_png
                    _cached_time = now
                    return _cached_snapshot, "image/png"
        except Exception as e:
            pass

    return None, None

class DockHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_ROOT, **kwargs)

    def do_GET(self):
        clean_path = self.path.split("?")[0]

        # Route root to /dock/
        if clean_path in ("/", ""):
            self.send_response(302)
            self.send_header("Location", "/dock/")
            self.end_headers()
            return

        if clean_path in ("/control", "/control/"):
            filepath = os.path.join(WEB_ROOT, "control", "index.html")
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                with open(filepath, "rb") as f:
                    self.wfile.write(f.read())
                return

        # Snapshot API endpoint
        if clean_path in ("/api/screen/snapshot", "/api/screen/snapshot.png"):
            data, mime = capture_device_snapshot()
            if data:
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
                return
            else:
                self.send_response(302)
                self.send_header("Location", "/dock/")
                self.end_headers()
                return

        # API Routes
        if clean_path == "/api/state":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(state).encode("utf-8"))
            return

        if clean_path == "/api/screen/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(screen_status).encode("utf-8"))
            return

        if clean_path == "/api/alarms":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp = {
                "alarms": state["alarms"],
                "isRinging": state["isAlarmRinging"],
                "ringingAlarm": state["ringingAlarm"],
                "sounds": ["homecoming.mp3"],
                "solar": state["solar"]
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        if clean_path == "/api/alarms/sounds":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"sounds": ["homecoming.mp3"]}).encode("utf-8"))
            return

        return super().do_GET()

    def do_POST(self):
        clean_path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""
        payload = {}
        if body:
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception:
                pass

        if clean_path == "/api/settings":
            for k, v in payload.items():
                state["settings"][k] = v
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        if clean_path == "/api/timer":
            action = payload.get("action")
            if action == "start":
                minutes = payload.get("minutes", 25)
                state["timer"]["running"] = True
                state["timer"]["label"] = payload.get("label", "Focus")
                state["timer"]["endsAt"] = int((time.time() + minutes * 60) * 1000)
            elif action == "stop":
                state["timer"]["running"] = False
                state["timer"]["endsAt"] = 0
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        if clean_path == "/api/tasks":
            new_id = str(len(state["tasks"]) + 1)
            state["tasks"].append({"id": new_id, "text": payload.get("text", "New task"), "done": False})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        if clean_path == "/api/alarms":
            new_id = f"alm_{len(state['alarms']) + 1}"
            alm = {
                "id": new_id,
                "tag": payload.get("tag", "Alarm"),
                "type": payload.get("type", "fixed"),
                "sound": payload.get("sound", "homecoming.mp3"),
                "enabled": payload.get("enabled", True),
                "days": payload.get("days", [])
            }
            if alm["type"] == "fixed":
                alm["time"] = payload.get("time", "07:00")
            else:
                alm["offsetMinutes"] = payload.get("offsetMinutes", 0)
            state["alarms"].append(alm)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "alarms": state["alarms"]}).encode("utf-8"))
            return

        if clean_path.startswith("/api/alarms/"):
            sub = clean_path.split("/")[-1]
            if sub == "dismiss":
                state["isAlarmRinging"] = False
                state["ringingAlarm"] = None
            else:
                alm_id = sub
                if payload.get("delete"):
                    state["alarms"] = [a for a in state["alarms"] if a["id"] != alm_id]
                else:
                    for a in state["alarms"]:
                        if a["id"] == alm_id:
                            for k, v in payload.items():
                                a[k] = v
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "alarms": state["alarms"]}).encode("utf-8"))
            return

        if clean_path.startswith("/api/tasks/"):
            task_id = clean_path.split("/")[-1]
            if payload.get("delete"):
                state["tasks"] = [t for t in state["tasks"] if t["id"] != task_id]
            elif "done" in payload:
                for t in state["tasks"]:
                    if t["id"] == task_id:
                        t["done"] = payload["done"]
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        if clean_path.startswith("/api/screen/"):
            sub = clean_path.split("/")[-1]
            if sub == "wake":
                screen_status["wakefulness"] = "Awake"
                if os.path.exists(ADB_PATH):
                    subprocess.run([ADB_PATH, "-s", DEVICE_SERIAL, "shell", "input keyevent 224"], capture_output=True)
            elif sub == "sleep":
                screen_status["wakefulness"] = "Asleep"
                if os.path.exists(ADB_PATH):
                    subprocess.run([ADB_PATH, "-s", DEVICE_SERIAL, "shell", "input keyevent 223"], capture_output=True)
            elif sub == "timeout":
                screen_status["timeout_s"] = payload.get("timeout_seconds", 60)
            elif sub == "rotate":
                screen_status["auto_rotate"] = payload.get("auto_rotate", True)
                if "orientation" in payload:
                    ori = payload["orientation"]
                    screen_status["orientation"] = ori
                    if os.path.exists(ADB_PATH):
                        if ori == "landscape":
                            subprocess.run([ADB_PATH, "-s", DEVICE_SERIAL, "shell", "cmd window set-fix-to-user-rotation enabled && cmd window set-user-rotation lock 1"], capture_output=True)
                        elif ori == "portrait":
                            subprocess.run([ADB_PATH, "-s", DEVICE_SERIAL, "shell", "cmd window set-fix-to-user-rotation enabled && cmd window set-user-rotation lock 0"], capture_output=True)
                elif payload.get("auto_rotate"):
                    if os.path.exists(ADB_PATH):
                        subprocess.run([ADB_PATH, "-s", DEVICE_SERIAL, "shell", "cmd window set-user-rotation free && settings put system accelerometer_rotation 1"], capture_output=True)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        if clean_path.startswith("/api/system/"):
            sub = clean_path.split("/")[-1]
            if sub == "volume":
                pct = payload.get("percent", 100)
                state["volume"] = pct
                target_idx = int((pct * 15) / 100)
                if os.path.exists(ADB_PATH):
                    subprocess.run([ADB_PATH, "-s", DEVICE_SERIAL, "shell", f"cmd media_session volume --stream 3 --set {target_idx}"], capture_output=True)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"percent": pct, "volume_index": target_idx}).encode("utf-8"))
                return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

if __name__ == "__main__":
    print(f"Serving Desk Dock on http://localhost:{PORT}/dock/")
    print(f"Serving Control Panel on http://localhost:{PORT}/control")
    with socketserver.TCPServer(("", PORT), DockHandler) as httpd:
        httpd.serve_forever()
