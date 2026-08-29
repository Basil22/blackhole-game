# Phase 26 Report — Android Packaging & Real-Device Alpha

## Summary

Packaged the existing Black Hole Three.js game as a native Android application using Capacitor. No gameplay changes. No physics changes. No new features.

## Architecture

```
BLACK HOLE (ES Modules)
      |
  Static HTML/CSS/JS
      |
  Capacitor WebView
      |
  Android APK / AAB
```

## Application Identity

| Field | Value |
|-------|-------|
| App Name | Black Hole |
| Package ID | com.spacestudio.blackhole |
| Version Name | 1.0 |
| Version Code | 1 |
| Min SDK | 22 (Android 5.1) |
| Target SDK | 34 (Android 14) |
| Compile SDK | 34 |

## Build Outputs

| Artifact | Size | Location |
|----------|------|----------|
| Debug APK | 4.0M | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Release APK | 3.2M | `android/app/build/outputs/apk/release/app-release.apk` |
| Release AAB | 3.0M | `android/app/build/outputs/bundle/release/app-release.aab` |

## Build Steps

```bash
npm install
bash build-www.sh
npx cap sync android
# Then from cmd.exe/PowerShell:
set JAVA_HOME=C:\Program Files\Java\jdk-21
set ANDROID_HOME=C:\Users\basil\AppData\Local\Android\Sdk
cd android
gradlew.bat assembleDebug
gradlew.bat assembleRelease
gradlew.bat bundleRelease
```

## Signing Strategy

- Debug: automatic Android debug keystore
- Release: env vars KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
- No keystores or passwords committed to repository

## What Was Changed

### New Files
- `package.json` — npm dependencies (Capacitor)
- `capacitor.config.json` — Capacitor configuration
- `build-www.sh` — static asset copier for www/
- `js/game/android.js` — back button + lifecycle handler
- `.gitignore` — excludes node_modules, build artifacts, keystores

### Modified Files
- `manifest.webmanifest` — orientation: landscape to portrait
- `AndroidManifest.xml` — portrait lock, removed INTERNET permission
- `build.gradle` — signing config, user.home fallback
- `drawable/splash.xml` — black splash
- `values/colors.xml` — black theme
- `values/styles.xml` — black background
- `ic_launcher_background.xml` — black adaptive icon background
- `mipmap-*/ic_launcher*.png` — game icon

### NOT Changed
Physics, scoring, missions, progression, campaign, audio, rendering, camera, input, objects, all tests.

## Verification

- Node tests: 449/449 green
- Browser (verify26): 13/13 green
- Regression (verify8/23/25): all green

## Back Button Behavior

| State | Action |
|-------|--------|
| Settings/Menu/Picker/Mission open | Close modal |
| Result panel open | Close result |
| Aiming | Cancel aim |
| Flying | Do nothing |
| Idle/Opening | Android default |

## Lifecycle

- Backgrounding during flight: auto-ends throw
- Audio suspends on background, resumes on foreground
- localStorage preserved across background/foreground

## What Needs Physical Device Testing

The following require installation on a real Android device (cannot be automated in headless CI):

- Touch aim/throw/release (Part K)
- Pinch zoom (Part K)
- Slider interaction (Part K)
- Audio unlock on PLAY gesture (Part O)
- Haptic feedback (Part N)
- WebGL rendering quality (Part R)
- Spaghettification visuals (Part R)
- Performance measurements (Part Q)
- Safe areas with gesture navigation (Part J)
- App background/foreground lifecycle (Part M)
- Complete alpha install test flow (Part AA)
