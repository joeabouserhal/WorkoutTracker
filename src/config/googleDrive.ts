export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
]

export const GOOGLE_DRIVE_CONFIG = {
  // Optional. Android Drive backup uses the Android OAuth client registered
  // in Google Cloud Console and does not need this value for access tokens.
  webClientId: '522397052415-nmrjaghcgvkgt4pdmmti1hp2g4cpg534.apps.googleusercontent.com',

  // Optional for iOS later. Android needs an
  // OAuth client configured in Google Cloud Console for package com.joeabouserhal.workouttracker.
  iosClientId: '',

  backupFileName: 'workouttracker-backup.json',
}

export function hasGoogleDriveConfig() {
  return true
}
