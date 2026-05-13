import { Platform } from 'react-native'
import RNFS from 'react-native-fs'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  saveDocuments,
  types,
} from '@react-native-documents/picker'
import { db } from '@/db/client'
import {
  GOOGLE_DRIVE_CONFIG,
  GOOGLE_DRIVE_SCOPES,
  hasGoogleDriveConfig,
} from '@/config/googleDrive'
import { getBool, getString, removeKey, setBool, setString } from '@/storage/mmkv'
import {
  MMKV_LOCAL_SETS,
  MMKV_PENDING_WORKOUT_ACTION,
  MMKV_REST_ENDS_AT,
  MMKV_STARTED_AT,
  MMKV_WORKOUT_ID,
} from '@/store/sessionStore'
import { seedDatabaseIfEmpty } from '@/db/seedData'
import { REST_TIMER_DEFAULT_SECONDS_KEY } from './restTimerSettings'

const APP_BACKUP_VERSION = 3
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const THEME_STORAGE_KEY = 'app_theme'
const AUTO_BACKUP_AFTER_WORKOUT_KEY = 'google_drive_auto_backup_after_workout'

const BACKUP_TABLES = [
  'sections',
  'methods',
  'exercise_types',
  'exercise_type_method_exclusions',
  'exercises',
  'workouts',
  'workout_exercises',
  'sets',
  'body_weight_logs',
  'profile',
  'workout_templates',
  'workout_template_exercises',
] as const

const RESTORE_DELETE_ORDER = [
  'workout_template_exercises',
  'workout_templates',
  'sets',
  'workout_exercises',
  'workouts',
  'exercises',
  'exercise_type_method_exclusions',
  'exercise_types',
  'methods',
  'sections',
  'body_weight_logs',
  'profile',
] as const

type BackupTableName = typeof BACKUP_TABLES[number]
type SqlValue = string | number | null

type BackupTable = {
  columns: string[]
  rows: Record<string, SqlValue>[]
}

export type AppBackupPayload = {
  version: number
  app: 'WorkoutTracker'
  createdAt: string
  settings: Record<string, string>
  tables: Record<BackupTableName, BackupTable>
}

export type GoogleDriveAccount = {
  name: string | null
  email: string
  photo: string | null
}

export type DriveBackupFile = {
  id: string
  name: string
  modifiedTime?: string
  size?: string
}

export type BackupResult = {
  fileId: string
  createdAt: string
  rowCount: number
}

export type RestoreResult = {
  fileName: string
  createdAt: string
  rowCount: number
}

export type LocalBackupExportResult = {
  fileName: string
  uri: string
  createdAt: string
  rowCount: number
}

let googleConfigured = false

export function getAutoBackupAfterWorkoutEnabled() {
  return getBool(AUTO_BACKUP_AFTER_WORKOUT_KEY) === true
}

export function setAutoBackupAfterWorkoutEnabled(enabled: boolean) {
  setBool(AUTO_BACKUP_AFTER_WORKOUT_KEY, enabled)
}

function quoteIdentifier(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`)
  }
  return `"${identifier}"`
}

function normalizeSqlValue(value: unknown): SqlValue {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return value
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return value == null ? null : String(value)
}

function getRowCount(payload: AppBackupPayload) {
  return BACKUP_TABLES.reduce((total, tableName) => (
    total + (payload.tables[tableName]?.rows.length ?? 0)
  ), 0)
}

function getBackupSettings() {
  const settings: Record<string, string> = {}
  const restSeconds = getString(REST_TIMER_DEFAULT_SECONDS_KEY)
  const theme = getString(THEME_STORAGE_KEY)
  if (restSeconds) settings[REST_TIMER_DEFAULT_SECONDS_KEY] = restSeconds
  if (theme) settings[THEME_STORAGE_KEY] = theme
  return settings
}

function restoreBackupSettings(settings: Record<string, string>) {
  for (const [key, value] of Object.entries(settings)) {
    setString(key, value)
  }
}

function clearActiveWorkoutSessionStorage() {
  removeKey(MMKV_WORKOUT_ID)
  removeKey(MMKV_STARTED_AT)
  removeKey(MMKV_REST_ENDS_AT)
  removeKey(MMKV_PENDING_WORKOUT_ACTION)
  removeKey(MMKV_LOCAL_SETS)
}

function getReadableFilePath(uri: string) {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri
}

function getEncodedFileUri(path: string) {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`
}

function getSafeLocalCopyFileName(name: string | null) {
  const fileName = name?.trim().replace(/[\\/]/g, '_') || 'workouttracker-backup.json'
  return fileName.toLowerCase().endsWith('.json') ? fileName : `${fileName}.json`
}

async function ensureBackupTables() {
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS methods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    owner_exercise_type_id TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_types (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    method_locked INTEGER NOT NULL DEFAULT 0,
    locked_method_id TEXT,
    sub_muscle_ids TEXT NOT NULL DEFAULT '[]'
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_type_method_exclusions (
    exercise_type_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    PRIMARY KEY (exercise_type_id, method_id)
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    exercise_type_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    default_unit TEXT NOT NULL DEFAULT 'kg'
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    name TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    notes TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workout_exercises (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    workout_exercise_id TEXT NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'working',
    weight REAL NOT NULL,
    weight_unit TEXT NOT NULL DEFAULT 'kg',
    reps INTEGER NOT NULL,
    est_one_rm REAL,
    volume REAL,
    completed_at INTEGER NOT NULL
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS body_weight_logs (
    id TEXT PRIMARY KEY,
    weight REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg',
    logged_at INTEGER NOT NULL
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS profile (
    id TEXT PRIMARY KEY,
    name TEXT,
    height REAL,
    weight REAL,
    height_unit TEXT NOT NULL DEFAULT 'cm',
    default_weight_unit TEXT NOT NULL DEFAULT 'kg'
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workout_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workout_template_exercises (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    exercise_type_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    set_count INTEGER NOT NULL DEFAULT 3,
    order_index INTEGER NOT NULL DEFAULT 0
  )`)

  const methodColumns = await getTableColumns('methods')
  if (!methodColumns.includes('owner_exercise_type_id')) {
    await db.$client.execute('ALTER TABLE methods ADD COLUMN owner_exercise_type_id TEXT')
  }
  if (!methodColumns.includes('is_hidden')) {
    await db.$client.execute('ALTER TABLE methods ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0')
  }

  const exerciseTypeColumns = await getTableColumns('exercise_types')
  if (!exerciseTypeColumns.includes('is_hidden')) {
    await db.$client.execute('ALTER TABLE exercise_types ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0')
  }
  if (!exerciseTypeColumns.includes('sub_muscle_ids')) {
    await db.$client.execute("ALTER TABLE exercise_types ADD COLUMN sub_muscle_ids TEXT NOT NULL DEFAULT '[]'")
  }
}

async function getTableColumns(tableName: string) {
  const result = await db.$client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
  return (result.rows as Array<{ name?: unknown }>)
    .map((row) => row.name)
    .filter((name): name is string => typeof name === 'string')
}

function getBackupTableQuery(tableName: BackupTableName) {
  switch (tableName) {
    case 'sections':
      return `
        SELECT * FROM sections
        WHERE is_custom = 1
          OR id IN (
            SELECT et.section_id
            FROM exercise_types et
            WHERE et.is_custom = 1
          )
          OR id IN (
            SELECT et.section_id
            FROM exercise_types et
            JOIN exercises e ON e.exercise_type_id = et.id
          )
          OR id IN (
            SELECT et.section_id
            FROM exercise_types et
            JOIN workout_template_exercises te ON te.exercise_type_id = et.id
          )
      `
    case 'methods':
      return `
        SELECT * FROM methods
        WHERE is_custom = 1
          OR id IN (SELECT method_id FROM exercises)
          OR id IN (SELECT method_id FROM workout_template_exercises)
          OR id IN (
            SELECT locked_method_id
            FROM exercise_types
            WHERE locked_method_id IS NOT NULL
              AND (
                is_custom = 1
                OR id IN (SELECT exercise_type_id FROM exercises)
                OR id IN (SELECT exercise_type_id FROM workout_template_exercises)
              )
          )
          OR id IN (
            SELECT ex.method_id
            FROM exercise_type_method_exclusions ex
            JOIN exercise_types et ON et.id = ex.exercise_type_id
            WHERE et.is_custom = 1
          )
      `
    case 'exercise_types':
      return `
        SELECT * FROM exercise_types
        WHERE is_custom = 1
          OR id IN (SELECT exercise_type_id FROM exercises)
          OR id IN (SELECT exercise_type_id FROM workout_template_exercises)
      `
    case 'exercise_type_method_exclusions':
      return `
        SELECT ex.*
        FROM exercise_type_method_exclusions ex
        JOIN exercise_types et ON et.id = ex.exercise_type_id
        WHERE et.is_custom = 1
      `
    case 'exercises':
      return 'SELECT * FROM exercises'
    case 'workouts':
      return 'SELECT * FROM workouts WHERE ended_at IS NOT NULL'
    case 'workout_exercises':
      return `
        SELECT we.*
        FROM workout_exercises we
        JOIN workouts w ON w.id = we.workout_id
        WHERE w.ended_at IS NOT NULL
      `
    case 'sets':
      return `
        SELECT s.*
        FROM sets s
        JOIN workout_exercises we ON we.id = s.workout_exercise_id
        JOIN workouts w ON w.id = we.workout_id
        WHERE w.ended_at IS NOT NULL
      `
    case 'body_weight_logs':
    case 'profile':
    case 'workout_templates':
    case 'workout_template_exercises':
      return `SELECT * FROM ${quoteIdentifier(tableName)}`
    default: {
      const exhaustive: never = tableName
      return exhaustive
    }
  }
}

export async function createBackupPayload(): Promise<AppBackupPayload> {
  await ensureBackupTables()
  const tables = {} as Record<BackupTableName, BackupTable>

  for (const tableName of BACKUP_TABLES) {
    const columns = await getTableColumns(tableName)
    const result = await db.$client.execute(getBackupTableQuery(tableName))
    const rows = (result.rows as Record<string, unknown>[]).map((row) => (
      columns.reduce<Record<string, SqlValue>>((entry, column) => {
        entry[column] = normalizeSqlValue(row[column])
        return entry
      }, {})
    ))
    tables[tableName] = { columns, rows }
  }

  return {
    version: APP_BACKUP_VERSION,
    app: 'WorkoutTracker',
    createdAt: new Date().toISOString(),
    settings: getBackupSettings(),
    tables,
  }
}

export async function restoreBackupPayload(payload: AppBackupPayload): Promise<number> {
  if (payload.app !== 'WorkoutTracker' || !payload.tables) {
    throw new Error('This file is not a valid WorkoutTracker backup.')
  }

  await ensureBackupTables()
  await db.$client.execute('BEGIN IMMEDIATE TRANSACTION')
  try {
    for (const tableName of RESTORE_DELETE_ORDER) {
      await db.$client.execute(`DELETE FROM ${quoteIdentifier(tableName)}`)
    }

    for (const tableName of BACKUP_TABLES) {
      const backupTable = payload.tables[tableName]
      if (!backupTable) continue

      const currentColumns = new Set(await getTableColumns(tableName))
      const columns = backupTable.columns.filter((column) => currentColumns.has(column))
      if (columns.length === 0) continue

      const placeholders = columns.map(() => '?').join(', ')
      const sql = `INSERT OR REPLACE INTO ${quoteIdentifier(tableName)} (${columns
        .map(quoteIdentifier)
        .join(', ')}) VALUES (${placeholders})`

      for (const row of backupTable.rows) {
        await db.$client.execute(sql, columns.map((column) => normalizeSqlValue(row[column])))
      }
    }

    await db.$client.execute('COMMIT')
  } catch (e) {
    await db.$client.execute('ROLLBACK')
    throw e
  }

  await seedDatabaseIfEmpty()
  restoreBackupSettings(payload.settings ?? {})
  clearActiveWorkoutSessionStorage()
  return getRowCount(payload)
}

function configureGoogleSignIn() {
  if (googleConfigured) return
  if (!hasGoogleDriveConfig()) {
    throw new Error('Google Drive is not configured yet. Add your Web client ID in src/config/googleDrive.ts.')
  }
  GoogleSignin.configure({
    ...(Platform.OS === 'ios'
      ? {
        webClientId: GOOGLE_DRIVE_CONFIG.webClientId || undefined,
        iosClientId: GOOGLE_DRIVE_CONFIG.iosClientId || undefined,
      }
      : {}),
  })
  googleConfigured = true
}

function mapGoogleUser(user: NonNullable<ReturnType<typeof GoogleSignin.getCurrentUser>>): GoogleDriveAccount {
  return {
    name: user.user.name,
    email: user.user.email,
    photo: user.user.photo,
  }
}

export function getGoogleDriveAccount(): GoogleDriveAccount | null {
  configureGoogleSignIn()
  const currentUser = GoogleSignin.getCurrentUser()
  return currentUser ? mapGoogleUser(currentUser) : null
}

function hasDriveScope(user: NonNullable<ReturnType<typeof GoogleSignin.getCurrentUser>>) {
  return GOOGLE_DRIVE_SCOPES.every((scope) => user.scopes.includes(scope))
}

export async function signInToGoogleDrive(): Promise<GoogleDriveAccount | null> {
  configureGoogleSignIn()
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const response = await GoogleSignin.signIn()
  if (response.type !== 'success') return null
  return mapGoogleUser(response.data)
}

export async function signOutFromGoogleDrive() {
  configureGoogleSignIn()
  await GoogleSignin.signOut()
}

async function getAccessToken() {
  configureGoogleSignIn()
  let currentUser = GoogleSignin.getCurrentUser()
  if (!currentUser) {
    const account = await signInToGoogleDrive()
    if (!account) throw new Error('Google sign-in was cancelled.')
    currentUser = GoogleSignin.getCurrentUser()
  }

  if (!currentUser || !hasDriveScope(currentUser)) {
    const scopedResponse = await GoogleSignin.addScopes({ scopes: GOOGLE_DRIVE_SCOPES })
    if (scopedResponse?.type === 'cancelled') {
      throw new Error('Google Drive permission was cancelled.')
    }
    if (!scopedResponse || scopedResponse.type !== 'success' || !hasDriveScope(scopedResponse.data)) {
      throw new Error('Google Drive permission was not granted.')
    }
  }

  const tokens = await GoogleSignin.getTokens()
  if (!tokens.accessToken) throw new Error('Could not get Google Drive access token.')
  return tokens.accessToken
}

async function readDriveError(response: Response) {
  const text = await response.text().catch(() => '')
  let detail = text
  try {
    const json = JSON.parse(text) as {
      error?: {
        message?: string
        status?: string
        errors?: Array<{ reason?: string; message?: string }>
      }
    }
    const reason = json.error?.errors?.[0]?.reason
    const message = json.error?.message
    detail = [reason, message].filter(Boolean).join(': ')
  } catch {
    detail = text
  }

  if (response.status === 401 || response.status === 403) {
    return detail
      ? `${detail}. Make sure the OAuth consent screen includes the Drive app data scope.`
      : 'Google Drive denied access. Make sure the OAuth consent screen includes the Drive app data scope.'
  }

  return detail ? `${response.status} ${detail}` : `${response.status} ${response.statusText}`
}

function escapeDriveQueryString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function getLatestBackupFile(accessToken: string): Promise<DriveBackupFile | null> {
  const query = encodeURIComponent(
    `name = '${escapeDriveQueryString(GOOGLE_DRIVE_CONFIG.backupFileName)}' and trashed = false`,
  )
  const response = await fetch(
    `${DRIVE_FILES_URL}?spaces=appDataFolder&pageSize=1&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)&q=${query}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!response.ok) throw new Error(`Could not check Drive backups: ${await readDriveError(response)}`)
  const json = await response.json() as { files?: DriveBackupFile[] }
  return json.files?.[0] ?? null
}

function buildMultipartUploadBody(metadata: Record<string, unknown>, content: string) {
  const boundary = `workouttracker_backup_${Date.now()}`
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n')

  return { body, boundary }
}

export async function backupToGoogleDrive(): Promise<BackupResult> {
  const payload = await createBackupPayload()
  const content = JSON.stringify(payload)
  const accessToken = await getAccessToken()
  const existingFile = await getLatestBackupFile(accessToken)
  const metadata = existingFile
    ? { name: GOOGLE_DRIVE_CONFIG.backupFileName, mimeType: 'application/json' }
    : {
      name: GOOGLE_DRIVE_CONFIG.backupFileName,
      mimeType: 'application/json',
      parents: ['appDataFolder'],
    }
  const { body, boundary } = buildMultipartUploadBody(metadata, content)
  const url = existingFile
    ? `${DRIVE_UPLOAD_URL}/${existingFile.id}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`
  const response = await fetch(url, {
    method: existingFile ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!response.ok) throw new Error(`Could not upload backup: ${await readDriveError(response)}`)
  const json = await response.json() as { id?: string }
  return {
    fileId: json.id ?? existingFile?.id ?? '',
    createdAt: payload.createdAt,
    rowCount: getRowCount(payload),
  }
}

export async function restoreFromGoogleDrive(): Promise<RestoreResult> {
  const accessToken = await getAccessToken()
  const latestFile = await getLatestBackupFile(accessToken)
  if (!latestFile) throw new Error('No Google Drive backup was found for this app.')

  const response = await fetch(`${DRIVE_FILES_URL}/${latestFile.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Could not download backup: ${await readDriveError(response)}`)

  const payload = JSON.parse(await response.text()) as AppBackupPayload
  const rowCount = await restoreBackupPayload(payload)
  return {
    fileName: latestFile.name,
    createdAt: payload.createdAt,
    rowCount,
  }
}

export async function deleteGoogleDriveBackup(): Promise<{ fileName: string; deletedAt: string }> {
  const accessToken = await getAccessToken()
  const latestFile = await getLatestBackupFile(accessToken)
  if (!latestFile) throw new Error('No Google Drive backup was found for this app.')

  const response = await fetch(`${DRIVE_FILES_URL}/${latestFile.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Could not delete backup: ${await readDriveError(response)}`)

  return {
    fileName: latestFile.name,
    deletedAt: new Date().toISOString(),
  }
}

export async function getGoogleDriveBackupStatus(): Promise<DriveBackupFile | null> {
  const accessToken = await getAccessToken()
  return getLatestBackupFile(accessToken)
}

export async function validateGoogleDriveConnection(): Promise<{
  account: GoogleDriveAccount
  latestBackup: DriveBackupFile | null
}> {
  const account = getGoogleDriveAccount()
  if (!account) throw new Error('Google Drive is not connected.')
  const accessToken = await getAccessToken()
  const latestBackup = await getLatestBackupFile(accessToken)
  return { account, latestBackup }
}

export async function exportBackupLocally(): Promise<LocalBackupExportResult | null> {
  const payload = await createBackupPayload()
  const content = JSON.stringify(payload, null, 2)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `workouttracker-backup-${stamp}.json`
  const tempDir = RNFS.TemporaryDirectoryPath || RNFS.CachesDirectoryPath
  const tempPath = `${tempDir}/${fileName}`

  try {
    await RNFS.writeFile(tempPath, content, 'utf8')
    const [savedFile] = await saveDocuments({
      sourceUris: [getEncodedFileUri(tempPath)],
      mimeType: 'application/json',
      fileName,
      copy: true,
    })

    if (savedFile.error) {
      throw new Error(`Could not save local backup: ${savedFile.error}`)
    }

    return {
      fileName: savedFile.name ?? fileName,
      uri: savedFile.uri,
      createdAt: payload.createdAt,
      rowCount: getRowCount(payload),
    }
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return null
    }
    throw e
  } finally {
    try {
      if (await RNFS.exists(tempPath)) {
        await RNFS.unlink(tempPath)
      }
    } catch (e) {
      console.warn('Could not remove temporary backup export file', e)
    }
  }
}

export async function importBackupLocally(): Promise<RestoreResult | null> {
  try {
    const [pickedFile] = await pick({
      mode: 'import',
      allowMultiSelection: false,
      type: [types.json, types.plainText, types.allFiles],
    })
    const [localCopy] = await keepLocalCopy({
      destination: 'cachesDirectory',
      files: [{
        uri: pickedFile.uri,
        fileName: getSafeLocalCopyFileName(pickedFile.name),
      }],
    })
    if (localCopy.status === 'error') {
      throw new Error(`Could not read selected backup: ${localCopy.copyError}`)
    }

    const content = await RNFS.readFile(getReadableFilePath(localCopy.localUri), 'utf8')
    const payload = JSON.parse(content) as AppBackupPayload
    const rowCount = await restoreBackupPayload(payload)
    return {
      fileName: pickedFile.name ?? 'Local backup',
      createdAt: payload.createdAt,
      rowCount,
    }
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return null
    }
    if (e instanceof SyntaxError) {
      throw new Error('This file is not a valid WorkoutTracker backup JSON.')
    }
    throw e
  }
}
