<div align="center">
  <img src="https://github.com/joeabouserhal/WorkoutTracker/blob/main/android/app/src/main/res/mipmap-hdpi/ic_launcher_monochrome.png" alt="WorkoutTracker logo" width="120" />

# WorkoutTracker

A modern **React Native** app for planning workouts, tracking progress, and staying consistent with your fitness goals.
</div>

---

## ✨ Features

- 🏋️ Create and track workouts with custom exercises
- 📈 Monitor progress over time
- 📅 View workout schedule in a calendar-style flow
- 👤 Manage personal profile settings
- 🎨 Switch themes for a personalized experience
- 🔔 Get workout reminders and notifications

---

## 🧰 Tech Stack

- **React Native** + **TypeScript**
- **Drizzle ORM**
- **SQLite** (via `op-sqlite`)
- **Zustand** for state management
- **React Navigation**
- **React Native Reanimated**

---

## ✅ Prerequisites

Before you begin, make sure you have:

- **Node.js** 18+
- A configured **React Native development environment**
- **Android Studio** (Android)
- **Xcode** (iOS on macOS)

---

## 🚀 Getting Started

### 1) Clone the repository

```sh
git clone <repository-url>
cd WorkoutTracker
```

### 2) Install dependencies

```sh
npm install
```

### 3) Install iOS dependencies (macOS only)

```sh
cd ios
bundle install
bundle exec pod install
cd ..
```

---

## ▶️ Run the App

### Start Metro

```sh
npm start
```

### Run on Android

```sh
npm run android
```

### Run on iOS

```sh
npm run ios
```

---

## 📦 Build Android Release APK

```sh
cd android
./gradlew assembleRelease
```

---

## 🛠️ Troubleshooting

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
./gradlew clean
./gradlew assembleRelease
```

---

## 📜 Available Scripts

- `npm start` — Start Metro bundler
- `npm run android` — Run on Android
- `npm run ios` — Run on iOS
- `npm test` — Run tests
- `npm run lint` — Run linter

---

## 🤝 Contributing

Contributions, improvements, and fixes are welcome. Feel free to open an issue or submit a pull request.
