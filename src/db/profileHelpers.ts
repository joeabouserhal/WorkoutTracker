import { desc, eq } from 'drizzle-orm'
import { db } from './client'
import { bodyWeightLogs, profile } from './schema'

export const PROFILE_ID = 'user_profile'

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
  const hasAvatarIconColumn = result.rows.some(
    (row: { name?: unknown }) => row.name === 'avatar_icon'
  )

  if (!hasNameColumn) {
    await db.$client.execute('ALTER TABLE profile ADD COLUMN name TEXT')
  }
  if (!hasWeightColumn) {
    await db.$client.execute('ALTER TABLE profile ADD COLUMN weight REAL')
  }
  if (!hasAvatarIconColumn) {
    await db.$client.execute('ALTER TABLE profile ADD COLUMN avatar_icon TEXT')
  }
}

export async function getProfile() {
  await ensureProfileTable()

  const row = (await db
    .select({
      id: profile.id,
      name: profile.name,
      height: profile.height,
      heightUnit: profile.heightUnit,
      defaultWeightUnit: profile.defaultWeightUnit,
      avatarIcon: profile.avatarIcon,
    })
    .from(profile)
    .where(eq(profile.id, PROFILE_ID))
    .limit(1))[0]
  if (!row) return null

  // Current weight is always the latest body_weight_logs entry
  let weight: number | null = null
  try {
    const bwlRow = (await db
      .select({ weight: bodyWeightLogs.weight })
      .from(bodyWeightLogs)
      .orderBy(desc(bodyWeightLogs.loggedAt))
      .limit(1))[0]
    weight = bwlRow?.weight ?? null
  } catch {
    // Table not yet created; weight stays null
  }

  return {
    id: row.id,
    name: row.name,
    height: row.height,
    weight,
    heightUnit: row.heightUnit,
    defaultWeightUnit: row.defaultWeightUnit,
    avatarIcon: row.avatarIcon,
  }
}

export async function upsertProfile(data: {
  name?: string
  height?: number
  weight?: number
  heightUnit?: string
  defaultWeightUnit?: string
  avatarIcon?: string | null
}) {
  await ensureProfileTable()

  const values: Partial<typeof profile.$inferInsert> = {}

  if ('name' in data) {
    values.name = data.name ?? null
  }
  if ('height' in data) {
    values.height = data.height ?? null
  }
  if ('weight' in data) {
    values.weight = data.weight ?? null
  }
  if ('heightUnit' in data) {
    values.heightUnit = data.heightUnit ?? 'cm'
  }
  if ('defaultWeightUnit' in data) {
    values.defaultWeightUnit = data.defaultWeightUnit ?? 'kg'
  }
  if ('avatarIcon' in data) {
    values.avatarIcon = data.avatarIcon ?? null
  }

  if (Object.keys(values).length === 0) return

  await db.insert(profile).values({
    id: PROFILE_ID,
    heightUnit: 'cm',
    defaultWeightUnit: 'kg',
  }).onConflictDoNothing()
  await db.update(profile).set(values).where(eq(profile.id, PROFILE_ID))
}
