<div align="center">
  <img src="https://github.com/joeabouserhal/WorkoutTracker/blob/main/android/app/src/main/res/mipmap-hdpi/ic_launcher_monochrome.png" alt="WorkoutTracker logo" width="120" />

# WorkoutTracker

A modern **React Native** app for planning workouts, tracking progress, and staying consistent with your fitness goals.
</div>

---

## Features

- Create and track workouts with custom exercises
- Track muscle fatigue and post-workout targeted muscles
- Monitor progress over time
- View workout history in calendar and daily flows
- Manage templates, schedules, profile settings, and app themes
- Back up and restore workout data

---

## Tech Stack

- **React Native** + **TypeScript**
- **Drizzle ORM**
- **SQLite** via `op-sqlite`
- **Zustand** for state management
- **React Navigation**
- **React Native Reanimated**

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** 22.11+
- A configured **React Native Android development environment**
- **Android Studio** and Android SDK tools
- **Python** 3.10+ for the Android build helper script

---

## Getting Started

### 1. Clone the Repository

```sh
git clone <repository-url>
cd WorkoutTracker
```

### 2. Install Dependencies

```sh
npm install
```

### 3. Start Metro

```sh
npm start
```

### 4. Run on Android

```sh
npm run android
```

---

## Android Builds

This project includes an Android-only build helper at `build.py`. The script wraps Gradle, lets you choose debug or release builds, supports smaller ARM-only release artifacts, and copies finished outputs into `builds/`.

### Interactive Build

Run from the project root:

```sh
python build.py
```

The script will ask for:

- Build type: `release` or `debug`
- Release target
- Whether to run `gradlew clean`

### Common Commands

Recommended release build with split ARM APKs:

```sh
python build.py --build-type release --target split-arm-apk --clean yes
```

Smallest single APK for modern Android phones:

```sh
python build.py --build-type release --target arm64-apk --clean yes
```

Google Play app bundle:

```sh
python build.py --build-type release --target play-aab --clean yes
```

Debug APK:

```sh
python build.py --build-type debug --clean no
```

### Release Targets

- `split-arm-apk`: separate `arm64-v8a` and `armeabi-v7a` APKs; recommended for smallest direct-install files
- `arm64-apk`: one APK for modern 64-bit Android devices
- `arm-apk`: one APK containing `arm64-v8a` and `armeabi-v7a`
- `play-aab`: Android App Bundle for Google Play distribution
- `universal-apk`: compatibility APK including ARM and x86 ABIs

Release targets avoid `x86` and `x86_64` by default because they usually make direct APKs much larger and are mainly useful for emulator or ChromeOS distribution.

### Output Location

Successful builds are copied to:

```sh
builds/
```

Example output names:

```sh
WorkoutTracker_Release_arm64_v8a_20260514_153000.apk
WorkoutTracker_Release_play_aab_20260514_153000.aab
WorkoutTracker_Debug_debug_20260514_153000.apk
```

### Release Signing

Release builds expect these values in `android/gradle.properties`:

```properties
MYAPP_RELEASE_STORE_FILE=...
MYAPP_RELEASE_KEY_ALIAS=...
MYAPP_RELEASE_STORE_PASSWORD=...
MYAPP_RELEASE_KEY_PASSWORD=...
```

The script checks for these keys before release builds. To bypass the check and let Gradle handle the failure or fallback, run:

```sh
python build.py --build-type release --target split-arm-apk --skip-keystore-check
```

---

## Manual Android Release Build

You can still build directly with Gradle:

```sh
cd android
./gradlew assembleRelease
```

On Windows PowerShell:

```sh
cd android
.\gradlew.bat assembleRelease
```

---

## Troubleshooting

### Windows APK Build Cache Issues

If APK builds fail on Windows, clear these folders/files:

- `android\build`
- `android\.cxx`
- `android\.gradle`
- `android\app\build`
- `android\app\.cxx`
- `node_modules\react-native-reanimated\android\build`
- `node_modules\react-native-reanimated\android\.cxx`
- `%USERPROFILE%\.gradle\caches`

Then clean and rebuild:

```sh
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease
```

Or use the helper:

```sh
python build.py --build-type release --target split-arm-apk --clean yes
```

---

## Available Scripts

- `npm start`: Start Metro bundler
- `npm run android`: Run on Android
- `npm test`: Run tests
- `npm run lint`: Run linter

---

## Contributing

Contributions, improvements, and fixes are welcome. Feel free to open an issue or submit a pull request.
