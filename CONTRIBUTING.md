# Contributing to Dwell

Thank you for your interest in contributing to **Dwell**! 

Dwell is built on the belief that great tools come from real user experiences. Having been users long before builders, we believe listening to users, discussing ideas openly, and encouraging community contributions is the single most important way to build a reliable, lasting product.

---

## Architecture & Branch Specialization

Dwell maintains two specialized branches on a single repository:

1. **`master` (Dedicated Headless Dock)**:
   - Built for converting a spare Android phone (with or without a functioning touchscreen/buttons) into a permanent smart desk clock and ambient dashboard.
   - Operated via hardware volume rocker remapping, proximity air wave gestures, and local network control hub (NanoHTTPD on port 8000).
   - Requires Magisk root for battery charging protection and deep power management.

2. **`oss/universal` (Daily Driver & Ambient Launcher)**:
   - Designed for daily running devices where you want an ambient, distraction-free home screen launcher without compromising everyday phone functionality.
   - Full interactive touch UI, on-screen settings, permission guidance, and standard launcher integration.
   - Works on any Android 8.0+ device without requiring root access.

> **Important**: When submitting a pull request, please target the appropriate branch (`master` or `oss/universal`). Cross-cutting platform fixes (such as WebGL optimizations, astronomical solar math, or network sync) may be adapted for both.

---

## Design & UI Guidelines

To maintain Dwell's distinct ambient feel, please adhere to these core invariants:
- **AMOLED `#000000` Black**: Interfaces use pure `#000000` background to maximize contrast, minimize power consumption, and avoid night glare.
- **Crisp Geometry**: Avoid excessive pill shapes (`border-radius: 9999px`). Prefer architectural rectangles (`border-radius: 4px` to `8px`).
- **Tactile Shadows**: Avoid neon glow effects (`box-shadow: 0 0 ...px`). Use clean tactile depth (`box-shadow: 0 2px 0 var(--border)`).
- **Muted Color Palette**: Use soft pastel tones (pastel sand `#CBB79F`, sage `#9AB6A2`, slate `#A2B4C5`, rose `#C89E9E`).

---

## Development Setup

### Prerequisites
- JDK 17 (e.g. Temurin or Microsoft OpenJDK 17)
- Android SDK (API 34, minimum API 26)
- Git & ADB

### Building the Project
```bash
git clone https://github.com/str-VaibhavThakkar/dwell.git
cd dwell/android
./gradlew assembleDebug
```
The compiled debug APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Testing on Device
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n dev.dwell.app/.MainActivity
```

---

## Submitting Pull Requests

1. Fork the repository and create your branch from either `master` or `oss/universal`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Verify local compilation with `./gradlew assembleDebug`.
3. Ensure no private local paths, personal calibration data, or credentials are included.
4. Commit with clear, descriptive messages following conventional commit guidelines.
5. Push to your fork and submit a Pull Request.

Every pull request will be reviewed thoughtfully. We welcome constructive criticism, new ideas, and code contributions!
