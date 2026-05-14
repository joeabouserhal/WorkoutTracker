import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { bodyWeightLogs } from './schema'

export type WeightLog = {
  id: string
  weight: number
  unit: string
  loggedAt: number
}

async function ensureTable() {
  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS body_weight_logs (
      id TEXT PRIMARY KEY,
      weight REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      logged_at INTEGER NOT NULL
    )
  `)
}

export async function logBodyWeight(weightKg: number): Promise<void> {
  await ensureTable()
  const id = `bwl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.insert(bodyWeightLogs).values({
    id,
    weight: weightKg,
    unit: 'kg',
    loggedAt: Date.now(),
  })
}

export async function getBodyWeightLogs(): Promise<WeightLog[]> {
  await ensureTable()
  const rows = await db
    .select({
      id: bodyWeightLogs.id,
      weight: bodyWeightLogs.weight,
      unit: bodyWeightLogs.unit,
      loggedAt: bodyWeightLogs.loggedAt,
    })
    .from(bodyWeightLogs)
    .orderBy(asc(bodyWeightLogs.loggedAt))
  return rows.map(row => ({
    id: row.id as string,
    weight: row.weight as number,
    unit: row.unit as string,
    loggedAt: row.loggedAt as number,
  }))
}

export async function updateBodyWeightLog(id: string, weightKg: number): Promise<void> {
  await ensureTable()
  await db
    .update(bodyWeightLogs)
    .set({ weight: weightKg, unit: 'kg' })
    .where(eq(bodyWeightLogs.id, id))
}

export async function deleteBodyWeightLog(id: string): Promise<void> {
  await ensureTable()
  await db
    .delete(bodyWeightLogs)
    .where(eq(bodyWeightLogs.id, id))
}
