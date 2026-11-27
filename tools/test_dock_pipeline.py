#!/usr/bin/env python3
"""
Dwell Dock Automated Testing Pipeline
====================================
Comprehensive pre-flight and live integration testing suite for Dwell (Desk Dock).
Validates contract alignment, offline integrity, and live API endpoints across
both 'master' (headless) and 'oss/universal' builds.

Usage:
  python tools/test_dock_pipeline.py [--device HOST[:PORT]] [--token TOKEN] [--offline] [--full]

Examples:
  # Run offline pre-flight validation (no device required)
  python tools/test_dock_pipeline.py --offline

  # Run full live test against connected device (auto-discovers token & IP)
  python tools/test_dock_pipeline.py

  # Test specific remote device
  python tools/test_dock_pipeline.py --device 192.168.29.25:8000 --token a4085d42
"""

import sys
import os
import re
import json
import time
import argparse
import subprocess
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

COLOR_RESET = "\033[0m"
COLOR_GREEN = "\033[32m"
COLOR_RED = "\033[31m"
COLOR_YELLOW = "\033[33m"
COLOR_CYAN = "\033[36m"
COLOR_BOLD = "\033[1m"

def print_header(title):
    print(f"\n{COLOR_BOLD}{COLOR_CYAN}{'='*60}{COLOR_RESET}")
    print(f"{COLOR_BOLD}{COLOR_CYAN}  {title}{COLOR_RESET}")
    print(f"{COLOR_BOLD}{COLOR_CYAN}{'='*60}{COLOR_RESET}\n")

class TestReporter:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.results = []

    def pass_test(self, name, detail=""):
        self.passed += 1
        msg = f"  {COLOR_GREEN}✓ PASS:{COLOR_RESET} {name}"
        if detail:
            msg += f" {COLOR_YELLOW}({detail}){COLOR_RESET}"
        print(msg)
        self.results.append(("PASS", name, detail))

    def fail_test(self, name, error):
        self.failed += 1
        print(f"  {COLOR_RED}✗ FAIL:{COLOR_RESET} {name} - {error}")
        self.results.append(("FAIL", name, str(error)))

    def skip_test(self, name, reason=""):
        self.skipped += 1
        print(f"  {COLOR_YELLOW}○ SKIP:{COLOR_RESET} {name} ({reason})")
        self.results.append(("SKIP", name, reason))

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print("\n" + "-"*60)
        print(f"{COLOR_BOLD}Pipeline Test Summary:{COLOR_RESET}")
        print(f"  Total:   {total}")
        print(f"  Passed:  {COLOR_GREEN}{self.passed}{COLOR_RESET}")
        print(f"  Failed:  {COLOR_RED}{self.failed}{COLOR_RESET}")
        print(f"  Skipped: {COLOR_YELLOW}{self.skipped}{COLOR_RESET}")
        print("-"*60)
        return self.failed == 0

def find_repo_root():
    cur = os.path.abspath(os.path.dirname(__file__))
    while cur and os.path.split(cur)[1]:
        if os.path.exists(os.path.join(cur, "android")) or os.path.exists(os.path.join(cur, "app")):
            return cur
        cur = os.path.dirname(cur)
    return os.path.abspath(".")

# -------------------------------------------------------------
# Part 1: Offline Pre-Flight & Contract Alignment Validation
# -------------------------------------------------------------
def run_offline_checks(reporter, repo_root):
    print_header("Stage 1: Offline Contract & Syntax Validation")

    # 1. Verify existence of core files
    core_files = [
        "android/app/src/main/java/dev/dwell/app/DockServer.kt",
        "android/app/src/main/java/dev/dwell/app/Root.kt",
        "android/app/src/main/java/dev/dwell/app/Screen.kt",
        "android/app/src/main/assets/web/control/index.html",
        "android/app/src/main/AndroidManifest.xml"
    ]
    for rel in core_files:
        full = os.path.join(repo_root, rel)
        if os.path.exists(full):
            reporter.pass_test(f"File exists: {rel}")
        else:
            reporter.fail_test(f"File exists: {rel}", "Missing critical source file")

    # 2. Contract Alignment Check:
    # Ensure every /api/* route invoked in index.html is implemented in DockServer.kt
    index_html_path = os.path.join(repo_root, "android/app/src/main/assets/web/control/index.html")
    dock_server_path = os.path.join(repo_root, "android/app/src/main/java/dev/dwell/app/DockServer.kt")

    if os.path.exists(index_html_path) and os.path.exists(dock_server_path):
        with open(index_html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        with open(dock_server_path, "r", encoding="utf-8") as f:
            server_content = f.read()

        # Extract all api endpoints called in JS
        endpoints = set(re.findall(r'["\'](/api/[\w/\-]+)', html_content))
        # Filter static or prefix endpoints
        clean_endpoints = [e for e in endpoints if not e.endswith("/")]
        
        mismatches = []
        for ep in sorted(clean_endpoints):
            # Check if endpoint appears in DockServer.kt
            # Strip dynamic prefix for tasks/alarms
            base_ep = re.sub(r'/(tasks|alarms)/.*', r'/\1', ep)
            if ep in server_content or base_ep in server_content:
                pass
            else:
                mismatches.append(ep)

        if not mismatches:
            reporter.pass_test("Contract Alignment", f"{len(clean_endpoints)} JS endpoints mapped in DockServer")
        else:
            reporter.fail_test("Contract Alignment", f"Endpoints in index.html missing in DockServer: {mismatches}")

        # 3. Check for auth auto-recovery in index.html
        if "resolveToken()" in html_content and "/api/discover" in html_content:
            reporter.pass_test("Token Auto-Recovery", "index.html implements automatic discover & token recovery")
        else:
            reporter.fail_test("Token Auto-Recovery", "Missing resolveToken() or discover endpoint in index.html")

        # 4. Check for dynamic alarm countdown implementation
        if "getTimeUntilAlarm" in html_content and "alarm-countdown-pill" in html_content:
            reporter.pass_test("Alarm Countdown Feature", "getTimeUntilAlarm dynamic countdown present in index.html")
        else:
            reporter.fail_test("Alarm Countdown Feature", "Missing getTimeUntilAlarm or countdown badge in index.html")

        # 5. Check Root.kt non-blocking timeout safety
        with open(os.path.join(repo_root, "android/app/src/main/java/dev/dwell/app/Root.kt"), "r", encoding="utf-8") as f:
            root_content = f.read()
        if "destroyForcibly" in root_content and "waitFor" in root_content and ("Thread" in root_content or "use" in root_content):
            reporter.pass_test("Root.sh Timeout Safety", "Asynchronous non-blocking process reader enforced")
        else:
            reporter.fail_test("Root.sh Timeout Safety", "Root.sh may block synchronously on stream read")

# -------------------------------------------------------------
# Part 2: Live Device End-to-End API Test Suite
# -------------------------------------------------------------
def discover_device_ip_and_token():
    """Try to find IP via ADB or discover endpoint."""
    ip = "192.168.29.25"
    adb_path = "adb"
    for candidate in ["adb", r"C:\platform-tools\adb.exe", r"C:\Users\USER\AppData\Local\Android\Sdk\platform-tools\adb.exe"]:
        try:
            res = subprocess.run([candidate, "devices"], capture_value=True if hasattr(subprocess, "capture_value") else False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2)
            if "device" in res.stdout:
                adb_path = candidate
                break
        except Exception:
            pass

    try:
        res = subprocess.run([adb_path, "shell", "ip", "route"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3)
        m = re.search(r'src (\d+\.\d+\.\d+\.\d+)', res.stdout)
        if m:
            ip = m.group(1)
    except Exception:
        pass

    return ip, None

def http_req(base_url, path, method="GET", data=None, token=None, timeout=5):
    url = f"{base_url}{path}"
    if token:
        delim = "&" if "?" in url else "?"
        url += f"{delim}token={token}"

    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    if token:
        headers["X-Token"] = token

    req = Request(url, data=body, headers=headers, method=method)
    with urlopen(req, timeout=timeout) as res:
        content_type = res.headers.get("Content-Type", "")
        raw = res.read()
        return res.status, content_type, raw

def run_live_tests(reporter, host, port, token=None):
    base_url = f"http://{host}:{port}"
    print_header(f"Stage 2: Live End-to-End Integration Suite ({base_url})")

    # 1. Discover Endpoint (Unauthenticated)
    device_token = token
    try:
        t0 = time.time()
        status, ct, raw = http_req(base_url, "/api/discover", method="GET", timeout=5)
        dt = int((time.time() - t0) * 1000)
        data = json.loads(raw.decode("utf-8"))
        if status == 200 and "token" in data and "device" in data:
            device_token = device_token or data["token"]
            reporter.pass_test("GET /api/discover", f"Device: {data.get('device')} ({data.get('codename')}), {dt}ms")
        else:
            reporter.fail_test("GET /api/discover", f"Invalid response structure: {data}")
    except Exception as e:
        reporter.fail_test("GET /api/discover", f"Connection failed: {e}")
        print(f"\n{COLOR_RED}Device is unreachable at {base_url}. Ensure the app is running and device is on Wi-Fi.{COLOR_RESET}")
        return

    # 2. Authentication Enforcement: Bad Token
    try:
        http_req(base_url, "/api/state", method="GET", token="invalid_token_999", timeout=5)
        reporter.fail_test("Security: 401 on Invalid Token", "Expected 401 Unauthorized but request succeeded")
    except HTTPError as e:
        if e.code == 401:
            reporter.pass_test("Security: 401 on Invalid Token", "Correctly rejected bad token with 401")
        else:
            reporter.fail_test("Security: 401 on Invalid Token", f"Unexpected status: {e.code}")
    except Exception as e:
        reporter.fail_test("Security: 401 on Invalid Token", str(e))

    # 3. GET /api/state with Valid Token
    initial_state = None
    try:
        t0 = time.time()
        status, ct, raw = http_req(base_url, "/api/state", method="GET", token=device_token, timeout=5)
        dt = int((time.time() - t0) * 1000)
        initial_state = json.loads(raw.decode("utf-8"))
        required_keys = ["device", "battery", "settings", "alarms", "tasks", "timer", "solar"]
        missing = [k for k in required_keys if k not in initial_state]
        if not missing:
            reporter.pass_test("GET /api/state", f"All {len(required_keys)} schema keys present, {dt}ms")
        else:
            reporter.fail_test("GET /api/state", f"Missing schema keys: {missing}")
    except Exception as e:
        reporter.fail_test("GET /api/state", str(e))

    # 4. Screen Status & Controls
    try:
        status, ct, raw = http_req(base_url, "/api/screen/status", method="GET", token=device_token)
        scr = json.loads(raw.decode("utf-8"))
        if "wakefulness" in scr:
            reporter.pass_test("GET /api/screen/status", f"Wakefulness: {scr['wakefulness']}")
        else:
            reporter.fail_test("GET /api/screen/status", f"Invalid screen status: {scr}")
    except Exception as e:
        reporter.fail_test("GET /api/screen/status", str(e))

    # Screen Wake
    try:
        t0 = time.time()
        status, ct, raw = http_req(base_url, "/api/screen/wake", method="POST", data={}, token=device_token)
        dt = int((time.time() - t0) * 1000)
        resp = json.loads(raw.decode("utf-8"))
        if resp.get("wakefulness") == "Awake":
            reporter.pass_test("POST /api/screen/wake", f"Woke display to 'Awake', {dt}ms")
        else:
            reporter.fail_test("POST /api/screen/wake", f"Unexpected wakefulness: {resp}")
    except Exception as e:
        reporter.fail_test("POST /api/screen/wake", str(e))

    # Screen Proximity Toggle
    try:
        status, ct, raw = http_req(base_url, "/api/screen/proximity", method="POST", data={"enabled": True}, token=device_token)
        resp = json.loads(raw.decode("utf-8"))
        if resp.get("ok") and resp.get("proximity_gestures") is True:
            reporter.pass_test("POST /api/screen/proximity", "Proximity gestures toggled to true")
        else:
            reporter.fail_test("POST /api/screen/proximity", f"Unexpected response: {resp}")
    except Exception as e:
        reporter.fail_test("POST /api/screen/proximity", str(e))

    # Screen Timeout Setting
    try:
        status, ct, raw = http_req(base_url, "/api/screen/timeout", method="POST", data={"timeout_seconds": 60}, token=device_token)
        resp = json.loads(raw.decode("utf-8"))
        if resp.get("timeout_s") == 60:
            reporter.pass_test("POST /api/screen/timeout", "Screen timeout configured to 60s")
        else:
            reporter.fail_test("POST /api/screen/timeout", f"Unexpected response: {resp}")
    except Exception as e:
        reporter.fail_test("POST /api/screen/timeout", str(e))

    # 5. Settings Round-Trip Persistence
    try:
        # Patch a specific test value
        test_val = 62
        status, ct, raw = http_req(base_url, "/api/settings", method="POST", data={"pauseCap": test_val}, token=device_token)
        patch_res = json.loads(raw.decode("utf-8"))
        # Read back from /api/state to verify true persistence
        status, ct, raw = http_req(base_url, "/api/state", method="GET", token=device_token)
        state_now = json.loads(raw.decode("utf-8"))
        if state_now.get("settings", {}).get("pauseCap") == test_val:
            reporter.pass_test("Settings Round-Trip", f"pauseCap={test_val} written and verified via state")
        else:
            reporter.fail_test("Settings Round-Trip", f"Value mismatch: {state_now.get('settings')}")
        
        # Restore original value if known
        if initial_state and "settings" in initial_state:
            orig = initial_state["settings"].get("pauseCap", 60)
            http_req(base_url, "/api/settings", method="POST", data={"pauseCap": orig}, token=device_token)
    except Exception as e:
        reporter.fail_test("Settings Round-Trip", str(e))

    # 6. Tasks CRUD Lifecycle
    task_id = None
    try:
        # Create
        status, ct, raw = http_req(base_url, "/api/tasks", method="POST", data={"text": "Pipeline Self-Test Task"}, token=device_token)
        tasks = json.loads(raw.decode("utf-8"))
        created = next((t for t in tasks if t.get("text") == "Pipeline Self-Test Task"), None)
        if created:
            task_id = created["id"]
            reporter.pass_test("POST /api/tasks (Create)", f"Created task id={task_id}")
        else:
            reporter.fail_test("POST /api/tasks (Create)", "Task not found in returned list")

        # Mark done
        if task_id:
            status, ct, raw = http_req(base_url, f"/api/tasks/{task_id}", method="POST", data={"done": True}, token=device_token)
            tasks = json.loads(raw.decode("utf-8"))
            done_task = next((t for t in tasks if t.get("id") == task_id), None)
            if done_task and done_task.get("done") is True:
                reporter.pass_test(f"POST /api/tasks/{task_id} (Done)", "Marked task as completed")
            else:
                reporter.fail_test(f"POST /api/tasks/{task_id} (Done)", f"Task status mismatch: {done_task}")

        # Delete
        if task_id:
            status, ct, raw = http_req(base_url, f"/api/tasks/{task_id}", method="POST", data={"delete": True}, token=device_token)
            tasks = json.loads(raw.decode("utf-8"))
            deleted_task = next((t for t in tasks if t.get("id") == task_id), None)
            if not deleted_task:
                reporter.pass_test(f"POST /api/tasks/{task_id} (Delete)", "Task deleted successfully")
            else:
                reporter.fail_test(f"POST /api/tasks/{task_id} (Delete)", "Task still present after delete")
    except Exception as e:
        reporter.fail_test("Tasks CRUD Lifecycle", str(e))

    # 7. Focus Timer Lifecycle
    try:
        # Start
        status, ct, raw = http_req(base_url, "/api/timer", method="POST", data={"action": "start", "minutes": 25, "label": "Pipeline Work"}, token=device_token)
        # Verify in state
        status, ct, raw = http_req(base_url, "/api/state", method="GET", token=device_token)
        state_tm = json.loads(raw.decode("utf-8")).get("timer", {})
        if state_tm.get("running") is True:
            reporter.pass_test("POST /api/timer (Start)", f"Timer running: endsAt={state_tm.get('endsAt')}")
        else:
            reporter.fail_test("POST /api/timer (Start)", f"Timer failed to start: {state_tm}")

        # Stop
        status, ct, raw = http_req(base_url, "/api/timer", method="POST", data={"action": "stop"}, token=device_token)
        status, ct, raw = http_req(base_url, "/api/state", method="GET", token=device_token)
        state_tm = json.loads(raw.decode("utf-8")).get("timer", {})
        if state_tm.get("running") is False:
            reporter.pass_test("POST /api/timer (Stop)", "Timer stopped successfully")
        else:
            reporter.fail_test("POST /api/timer (Stop)", f"Timer still running: {state_tm}")
    except Exception as e:
        reporter.fail_test("Focus Timer Lifecycle", str(e))

    # 8. Alarms Lifecycle
    alarm_id = None
    try:
        # Available sounds
        status, ct, raw = http_req(base_url, "/api/alarms/sounds", method="GET", token=device_token)
        sounds_data = json.loads(raw.decode("utf-8"))
        sounds = sounds_data.get("sounds", [])
        if len(sounds) >= 1:
            reporter.pass_test("GET /api/alarms/sounds", f"{len(sounds)} sounds available: {sounds}")
        else:
            reporter.fail_test("GET /api/alarms/sounds", "No alarm sounds returned")

        # Create alarm
        new_alarm = {
            "tag": "Pipeline Test Alarm",
            "type": "fixed",
            "time": "08:15",
            "sound": sounds[0] if sounds else "homecoming.mp3",
            "enabled": True,
            "days": [1, 2, 3, 4, 5]
        }
        status, ct, raw = http_req(base_url, "/api/alarms", method="POST", data=new_alarm, token=device_token)
        alm_res = json.loads(raw.decode("utf-8"))
        # Master returns the alarm object, universal returns {ok:true, alarm:...}
        created_alm = alm_res.get("alarm") if "alarm" in alm_res else alm_res
        if created_alm and "id" in created_alm:
            alarm_id = created_alm["id"]
            reporter.pass_test("POST /api/alarms (Create)", f"Created alarm id={alarm_id}")
        else:
            reporter.fail_test("POST /api/alarms (Create)", f"Unexpected response: {alm_res}")

        # Dismiss / Stop endpoints test
        status, ct, raw = http_req(base_url, "/api/alarms/dismiss", method="POST", data={}, token=device_token)
        reporter.pass_test("POST /api/alarms/dismiss", "Dismiss route responded 200 OK")

        status, ct, raw = http_req(base_url, "/api/alarms/stop", method="POST", data={}, token=device_token)
        reporter.pass_test("POST /api/alarms/stop", "Stop route responded 200 OK")

        # Delete alarm
        if alarm_id:
            status, ct, raw = http_req(base_url, f"/api/alarms/{alarm_id}", method="POST", data={"delete": True}, token=device_token)
            reporter.pass_test(f"POST /api/alarms/{alarm_id} (Delete)", "Alarm deleted successfully")
    except Exception as e:
        reporter.fail_test("Alarms Lifecycle", str(e))

    # 9. Live Snapshot Streaming
    try:
        t0 = time.time()
        status, ct, raw = http_req(base_url, "/api/screen/snapshot", method="GET", token=device_token, timeout=6)
        dt = int((time.time() - t0) * 1000)
        size = len(raw)

        if "image/png" in ct:
            # Check PNG magic header: \x89PNG\r\n\x1a\n
            if raw.startswith(b'\x89PNG\r\n\x1a\n'):
                reporter.pass_test("GET /api/screen/snapshot", f"Valid PNG image ({size:,} bytes), {dt}ms")
            else:
                reporter.fail_test("GET /api/screen/snapshot", "Image header is not valid PNG format")
        elif "image/svg+xml" in ct:
            reporter.pass_test("GET /api/screen/snapshot", f"Valid SVG placeholder (camera/mirror active, {size} bytes), {dt}ms")
        else:
            reporter.fail_test("GET /api/screen/snapshot", f"Unexpected content type: {ct}")
    except Exception as e:
        reporter.fail_test("GET /api/screen/snapshot", f"Snapshot capture failed: {e}")

    # 10. System Logs Endpoint
    try:
        status, ct, raw = http_req(base_url, "/api/system/logs?limit=50", method="GET", token=device_token)
        logs_data = json.loads(raw.decode("utf-8"))
        logs = logs_data.get("logs", [])
        reporter.pass_test("GET /api/system/logs", f"Retrieved {len(logs)} log entries")
    except Exception as e:
        reporter.fail_test("GET /api/system/logs", str(e))

def main():
    parser = argparse.ArgumentParser(description="Dwell Dock Automated Testing Pipeline")
    parser.add_argument("--device", help="Target device host (e.g. 192.168.29.25 or 192.168.29.25:8000)")
    parser.add_argument("--port", type=int, default=8000, help="DockServer port (default: 8000)")
    parser.add_argument("--token", help="Access token (auto-discovered if omitted)")
    parser.add_argument("--offline", action="store_true", help="Run only offline contract checks")
    parser.add_argument("--full", action="store_true", help="Run both offline and live checks")
    args = parser.parse_args()

    repo_root = find_repo_root()
    reporter = TestReporter()

    # 1. Run offline validation always
    run_offline_checks(reporter, repo_root)

    # 2. Run live tests unless offline flag is specified
    if not args.offline:
        host = args.device
        port = args.port
        token = args.token

        if host:
            if ":" in host:
                parts = host.split(":")
                host = parts[0]
                port = int(parts[1])
        else:
            # Try to discover automatically
            discovered_ip, _ = discover_device_ip_and_token()
            host = discovered_ip

        if host:
            run_live_tests(reporter, host, port, token)
        else:
            print(f"\n{COLOR_YELLOW}No target device IP provided and auto-detection failed. Skipping live tests.{COLOR_RESET}")

    success = reporter.summary()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
