# Dwell — Android Codebase

This folder contains the complete Android application codebase for **Dwell** (`dev.dwell.app`).

## Development & Build Instructions

### Prerequisites
- JDK 17 (Microsoft OpenJDK 17 or Eclipse Temurin 17)
- Android SDK (API 34 compileSdk, minSdk 26)

### Build Commands
From this directory:

```bash
# Build Debug APK
./gradlew assembleDebug

# Clean project
./gradlew clean

# Run lint checks
./gradlew lint
```

The compiled APK will be generated at:
`app/build/outputs/apk/debug/app-debug.apk`

### Core Packages (`app/src/main/java/dev/dwell/app/`)
- `Battery.kt`: Linux sysfs power supply monitoring and charge guard logic.
- `DeviceProfile.kt`: Runtime hardware and battery sysfs node detection.
- `DockServer.kt`: Embedded NanoHTTPD web server (port 8000) hosting API endpoints and web client.
- `DockService.kt`: Foreground service managing the local web server, battery guard, and hardware events.
- `HardwareKeyStateMachine.kt`: Debounced hardware volume key event listener and gesture state machine.
- `MainActivity.kt`: Fullscreen immersive launcher hosting the WebView and calibration overlays.
- `ProximityGestureEngine.kt`: Infrared optical proximity sensor engine for touchless air-wave sleep/wake.
- `Screen.kt`: System brightness, display timeout, and lockscreen management.
- `Store.kt`: SharedPreferences data store for alarms, study tasks, and configuration settings.
- `TimeSyncEngine.kt`: Local Linux system clock and RTC synchronization engine.

See the root [README.md](../README.md) for full project documentation and usage instructions.
