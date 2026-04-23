import { db } from './client'

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
  await db.$client.execute(
    'INSERT INTO body_weight_logs (id, weight, unit, logged_at) VALUES (?, ?, ?, ?)',
    [id, weightKg, 'kg', Date.now()],
  )
}

export async function getBodyWeightLogs(): Promise<WeightLog[]> {
  await ensureTable()
  const result = await db.$client.execute(
    'SELECT id, weight, unit, logged_at FROM body_weight_logs ORDER BY logged_at ASC',
  )
  return (result.rows as any[]).map(row => ({
    id: row.id as string,
    weight: row.weight as number,
    unit: row.unit as string,
    loggedAt: row.logged_at as number,
  }))
}
