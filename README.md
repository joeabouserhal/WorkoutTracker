![Logo](https://github.com/joeabouserhal/WorkoutTracker/blob/main/android/app/src/main/res/mipmap-xxxhdpi/ic_notification.png)
# WorkoutTracker

A React Native application for tracking workouts, progress, and managing fitness routines.

## Features

- Track workouts with exercises
- Progress tracking
- Calendar view
- Profile management
- Themes support
- Notifications for workouts

## Prerequisites

- Node.js (version 18 or higher)
- React Native development environment set up
- Android Studio for Android development
- Xcode for iOS development (macOS only)

## Installation

1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd WorkoutTracker
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. For iOS, install CocoaPods:
   ```sh
   cd ios
   bundle install
   bundle exec pod install
   cd ..
   ```

## Running the App

1. Start Metro:
   ```sh
   npm start
   ```

2. Run on Android:
   ```sh
   npm run android
   ```

3. Run on iOS:
   ```sh
   npm run ios
   ```

## Building APK

To build a release APK for Android:

```sh
cd android
./gradlew assembleRelease
```

## Troubleshooting

### Windows APK Build Issues

If you encounter issues while compiling the APK on Windows, try deleting the following directories and files to clear caches:

- `android\build`
- `android\.cxx`
- `android\.gradle`
- `android\app\build`
- `android\app\.cxx`
- `node_modules\react-native-reanimated\android\build`
- `node_modules\react-native-reanimated\android\.cxx`
- `%USERPROFILE%\.gradle\caches`

After deleting these, clean and rebuild:

```sh
cd android
./gradlew clean
./gradlew assembleRelease
```

## Scripts

- `npm start`: Start Metro server
- `npm run android`: Run on Android
- `npm run ios`: Run on iOS
- `npm test`: Run tests
- `npm run lint`: Run linter

## Technologies Used

- React Native
- TypeScript
- Drizzle ORM
- SQLite (via op-sqlite)
- Zustand for state management
- React Navigation
- React Native Reanimated
- And more...
