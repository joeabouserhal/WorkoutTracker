import { db } from './client'

export const PROFILE_ID = 'user_profile'

type ProfileRow = {
  id: string
  name: string | null
  height: number | null
  weight: number | null
  height_unit: string
  default_weight_unit: string
}

async function ensureProfileTable() {
  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS profile (
      id TEXT PRIMARY KEY,
      name TEXT,
      height REAL,
      weight REAL,
      height_unit TEXT NOT NULL DEFAULT 'cm',
      default_weight_unit TEXT NOT NULL DEFAULT 'kg'
    )
  `)

  const result = await db.$client.execute('PRAGMA table_info(profile)')
  const hasNameColumn = result.rows.some(
    (row: { name?: unknown }) => row.name === 'name'
  )
  const hasWeightColumn = result.rows.some(
    (row: { name?: unknown }) => row.name === 'weight'
  )

  if (!hasNameColumn) {
    await db.$client.execute('ALTER TABLE profile ADD COLUMN name TEXT')
  }
  if (!hasWeightColumn) {
    await db.$client.execute('ALTER TABLE profile ADD COLUMN weight REAL')
  }
}

export async function getProfile() {
  await ensureProfileTable()

  const result = await db.$client.execute(
    'SELECT id, name, height, height_unit, default_weight_unit FROM profile WHERE id = ?',
    [PROFILE_ID]
  )

  const row = result.rows[0] as Omit<ProfileRow, 'weight'> | undefined
  if (!row) return null

  // Current weight is always the latest body_weight_logs entry
  let weight: number | null = null
  try {
    const bwlResult = await db.$client.execute(
      'SELECT weight FROM body_weight_logs ORDER BY logged_at DESC LIMIT 1'
    )
    const bwlRow = bwlResult.rows[0] as { weight: number } | undefined
    weight = bwlRow?.weight ?? null
  } catch {
    // Table not yet created; weight stays null
  }

  return {
    id: row.id,
    name: row.name,
    height: row.height,
    weight,
    heightUnit: row.height_unit,
    defaultWeightUnit: row.default_weight_unit,
  }
}

export async function upsertProfile(data: {
  name?: string
  height?: number
  weight?: number
  heightUnit?: string
  defaultWeightUnit?: string
}) {
  await ensureProfileTable()

  const fields: string[] = []
  const values: Array<number | string | null> = []

  if ('name' in data) {
    fields.push('name = ?')
    values.push(data.name ?? null)
  }
  if ('height' in data) {
    fields.push('height = ?')
    values.push(data.height ?? null)
  }
  if ('weight' in data) {
    fields.push('weight = ?')
    values.push(data.weight ?? null)
  }
  if ('heightUnit' in data) {
    fields.push('height_unit = ?')
    values.push(data.heightUnit ?? 'cm')
  }
  if ('defaultWeightUnit' in data) {
    fields.push('default_weight_unit = ?')
    values.push(data.defaultWeightUnit ?? 'kg')
  }

  if (fields.length === 0) return

  await db.$client.execute(
    `INSERT OR IGNORE INTO profile (
      id,
      height_unit,
      default_weight_unit
    ) VALUES (?, ?, ?)`,
    [PROFILE_ID, 'cm', 'kg'],
  )
  await db.$client.execute(
    `UPDATE profile SET ${fields.join(', ')} WHERE id = ?`,
    [...values, PROFILE_ID],
  )
}
