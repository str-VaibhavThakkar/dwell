# Dwell — Repository Directory Layout
**Brand:** Dwell  
**Tagline:** Display Well  
**Package:** `dev.dwell.app`  
**License:** Apache 2.0  
**Status:** Active & Open Source  

---

## 1. Directory Tree Overview

```
desk_dock/
├── README.md                          # Primary project manual (features, install, daily use, API)
├── CONTRIBUTING.md                    # Community guidelines and development setup
├── LICENSE                            # Apache 2.0 open-source license
├── DIRECTORY_LAYOUT.md                # This directory layout specification
│
├── .github/                           # GitHub Actions CI/CD workflows and community templates
│   ├── workflows/build.yml            # Automated APK build & release publishing
│   ├── ISSUE_TEMPLATE/                # Bug report & feature request templates
│   └── PULL_REQUEST_TEMPLATE.md       # PR checklist and guidelines
│
├── android/                           # Complete Android Studio / Gradle Kotlin project (dev.dwell.app)
│   ├── app/
│   │   ├── build.gradle.kts           # App-level Gradle dependencies and build configuration
│   │   └── src/main/
│   │       ├── AndroidManifest.xml    # App manifest: launcher, permissions, boot receivers
│   │       ├── assets/web/            # Source web UI: dock/ (canvas/sky), control/, fonts/, lib/
│   │       ├── java/dev/dwell/app/    # Core Kotlin services:
│   │       │   ├── Battery.kt         # PMIC sysfs battery monitoring and guard logic
│   │       │   ├── DeviceProfile.kt   # Runtime hardware sysfs node mapping
│   │       │   ├── DockServer.kt      # Embedded NanoHTTPD web server (port 8000)
│   │       │   ├── DockService.kt     # Android foreground service hosting server & guard
│   │       │   ├── HourlyWake.kt      # AlarmManager top-of-the-hour exact wake scheduler
│   │       │   ├── MainActivity.kt    # Fullscreen WebView launcher with screen wake flags
│   │       │   ├── Screen.kt          # System power, timeout, lockscreen & rotation management
│   │       │   └── Store.kt           # SharedPreferences persistence engine
│   │       └── res/                   # Android resource drawables, mipmaps, and layouts
│   ├── build.gradle.kts               # Root Gradle project configuration
│   ├── gradle/                        # Gradle wrapper distribution files
│   ├── gradlew                        # Linux/macOS Gradle wrapper executable
│   ├── gradlew.bat                    # Windows Gradle wrapper batch script
│   └── settings.gradle.kts            # Project module settings
│
├── scripts/                           # Shell automation and hardware control scripts
│   ├── device/                        # Scripts deployed directly to device (/data/adb/)
│   │   ├── 00-desk-dock.sh            # Boot init: screen timeout 120s, no-lockscreen, wifi, adb 5555
│   │   ├── battery-guard.sh           # Standalone fallback root battery protection daemon
│   │   ├── vol_daemon.sh              # Hardware volume key listener daemon (getevent -l)
│   │   ├── switch_scene.sh            # Scene switcher HTTP helper client (port 8000)
│   │   └── termux-exec.sh             # ADB execution wrapper for Termux environment
│   └── host/                          # Reserved for host PC provisioning and shell helpers
│
├── tools/                             # Host PC companion tools and testing servers
│   ├── preview_server.py              # Zero-dependency local browser preview server (port 8080)
│   ├── telemetry_server.py            # PC telemetry bridge & ADB battery reader (port 8000)
│   ├── pc_agent.py                    # PC stats daemon (pushes CPU/RAM/Temp to phone /api/pc)
│   └── provision.sh                   # One-shot automated ADB installation and setup script
│
├── web_remote/                        # Standalone web control interfaces
│   ├── control_index.html             # Enhanced standalone remote control page (AMOLED black / pastel)
│   └── pc_hub.html                    # PC control hub and live mirror UI
│
├── docs/                              # Project blueprints, architecture designs, and media
│   ├── blueprint_v2.md                # Master Blueprint V2 (Screen duty cycle, hourly wake, battery)
│   ├── PROJECT_OUTLINE.md             # Original 5-view module architecture specification
│   └── screenshots/                   # Active screenshots of Shorya's application (12 PNG files)
│
└── archive/                           # Preserved legacy and scratch artifacts (non-active)
    ├── legacy_react_frontend/         # Old React 19 + Vite frontend (node_modules purged, 152 MB reclaimed)
    │   ├── src/                       # Original React 5-tab components (StandBy, JEE 2028, Focus, etc.)
    │   ├── public/                    # Static assets
    │   ├── dist/                      # Pre-compiled static web bundle
    │   ├── package.json               # Node dependency declarations
    │   ├── vite.config.ts             # Vite bundler configuration
    │   ├── Review 5-Theme Painterly Engine Plan.md # Architectural plan for React engine
    │   └── screenshots/               # Legacy React screenshots (tab0 to tab4, 10 PNG files)
    └── builds/                        # Scratch builds
        └── base_patched.apk           # Prior patched APK artifact (1.05 MB)
```

---

## 2. Directory Roles & Responsibilities

| Directory | Target Environment | Description & Purpose |
| :--- | :--- | :--- |
| `bin/` | Host / Device | Holds ready-to-flash compiled binaries (`desk-dock-onclite-debug.apk` and `termux.apk`) so flashing does not require an Android SDK build environment. |
| `android/` | Android SDK / Studio | Promoted primary Kotlin application codebase (`dev.dock.onclite`). Contains all Java/Kotlin services, Android manifests, Gradle build tools, and web assets (`assets/web/`). |
| `scripts/device/` | Android Root (`/data/adb/`) | Critical device-side shell scripts managing boot settings, battery protection, hardware volume listening, and Termux wrappers. |
| `tools/` | Host PC (Python / Bash) | Companion tools for local development and runtime telemetry: `preview_server.py` (points to `android/` assets), `pc_agent.py`, `telemetry_server.py`, and `provision.sh`. |
| `web_remote/` | Web Browser | Independent HTML/CSS/JS control pages accessible from any laptop or smartphone on the local Wi-Fi network. |
| `docs/` | Reference | Engineering blueprints, original 5-view outlines, and active production screenshots. |
| `archive/` | Historical Reference | Inactive legacy source code (the original React 19 frontend with `node_modules` safely purged) and scratch binaries. Kept completely separate from active builds. |

---

## 3. Migration Disposition Map

| Original File / Folder Path | New Canonical Path | Action Taken | Rationale |
| :--- | :--- | :--- | :--- |
| `desk_dock/Made_by_Shorya/README.md` | `desk_dock/README.md` | Promoted | Established Shorya's comprehensive guide as primary project documentation. |
| `desk_dock/hello/desk-dock/*` | `desk_dock/android/*` | Promoted | Promoted full Kotlin Android project to first-class active codebase. |
| `desk_dock/hello/` | — | Removed | Eliminated redundant wrapper folder and nested git clone. |
| `desk_dock/Made_by_Shorya/desk-dock-onclite-debug.apk` | `desk_dock/bin/desk-dock-onclite-debug.apk` | Moved | Primary release binary placed in dedicated `bin/` folder. |
| `desk_dock/base.apk` | — | Deleted | Redundant duplicate (verified identical SHA-256 hash to `desk-dock-onclite-debug.apk`). |
| `desk_dock/base_patched.apk` | `desk_dock/archive/builds/base_patched.apk` | Archived | Preserved scratch binary in archive. |
| `desk_dock/termux.apk` | `desk_dock/bin/termux.apk` | Moved | Preserved optional utility installer in `bin/`. |
| `desk_dock/00-desk-dock.sh` | `desk_dock/scripts/device/00-desk-dock.sh` | Moved | Grouped device init script under `scripts/device/`. |
| `desk_dock/battery-guard.sh` | `desk_dock/scripts/device/battery-guard.sh` | Moved | Grouped device battery guard under `scripts/device/`. |
| `desk_dock/vol_daemon.sh` | `desk_dock/scripts/device/vol_daemon.sh` | Moved | Grouped hardware key listener under `scripts/device/`. |
| `desk_dock/switch_scene.sh` | `desk_dock/scripts/device/switch_scene.sh` | Moved | Grouped scene switcher under `scripts/device/`. |
| `desk_dock/termux-exec.sh` | `desk_dock/scripts/device/termux-exec.sh` | Moved | Grouped Termux wrapper under `scripts/device/`. |
| `desk_dock/Made_by_Shorya/preview_server.py` | `desk_dock/tools/preview_server.py` | Moved & Updated | Updated `WEB_ROOT` to point directly to `android/app/src/main/assets/web/`. |
| `desk_dock/telemetry_server.py` | `desk_dock/tools/telemetry_server.py` | Moved | Placed host PC telemetry bridge under `tools/`. |
| `desk_dock/hello/desk-dock/tools/pc_agent.py` | `desk_dock/tools/pc_agent.py` | Moved | Placed host PC stats agent under `tools/`. |
| `desk_dock/hello/desk-dock/tools/provision.sh` | `desk_dock/tools/provision.sh` | Moved | Placed ADB provisioning script under `tools/`. |
| `desk_dock/control_index.html` | `desk_dock/web_remote/control_index.html` | Moved | Placed enhanced pastel remote under `web_remote/`. |
| `desk_dock/pc_hub.html` | `desk_dock/web_remote/pc_hub.html` | Moved | Placed PC control hub and mirror under `web_remote/`. |
| `desk_dock/desk_dock_dashboard_blueprint_V2.md` | `desk_dock/docs/blueprint_v2.md` | Moved | Placed master engineering blueprint under `docs/`. |
| `desk_dock/PROJECT_OUTLINE.md` | `desk_dock/docs/PROJECT_OUTLINE.md` | Moved | Placed original 5-view specification under `docs/`. |
| `desk_dock/Made_by_Shorya/screenshots/*` | `desk_dock/docs/screenshots/*` | Moved | Placed active app screenshots under `docs/screenshots/`. |
| `desk_dock/Made_by_Shorya/` | — | Removed | Cleanly retired after promoting all constituent assets. |
| `desk_dock/frontend/node_modules/` | — | Purged | Safely removed **152.18 MB** across **6,295 files** of dead dependencies. |
| `desk_dock/frontend/*` (remainder) | `desk_dock/archive/legacy_react_frontend/*` | Archived | Preserved React 19 source code, blueprints, and configs in archive. |
| `desk_dock/screenshots/*` | `desk_dock/archive/legacy_react_frontend/screenshots/*` | Archived | Preserved legacy React tab screenshots alongside archived frontend. |

---

## 4. Integrity & Verification Evidence

1. **Binary SHA-256 Hash Verification**:
   - `desk_dock/bin/desk-dock-onclite-debug.apk`:
     `462CB530F7D4872CE90678BB5E469D4F56C353C0C87A43CB4F580D8741CEB382` (1,108,313 bytes)
   - `desk_dock/bin/termux.apk`:
     `72C8D3CF7CB12D8C550A6B2750BD00BC99AD084C70F8FF0D2FFA9189E685CE4F` (33,172,989 bytes)
   - `desk_dock/archive/builds/base_patched.apk`:
     `9052E4C3A2D8FC50F2CC1A75BEF9B78E5B9C43B1C280681809796DAE2EED2B45` (1,049,469 bytes)

2. **Backend Script Existence**:
   All 5 device scripts exist, are intact, and verified under `desk_dock/scripts/device/`:
   - `00-desk-dock.sh` (1,031 bytes)
   - `battery-guard.sh` (1,352 bytes)
   - `vol_daemon.sh` (605 bytes)
   - `switch_scene.sh` (1,499 bytes)
   - `termux-exec.sh` (348 bytes)

3. **Disk Space Reclaimed**:
   - `desk_dock/archive/legacy_react_frontend/node_modules` confirmed non-existent (`Test-Path` returned `False`).
   - Total space freed: **152.18 MB**.
