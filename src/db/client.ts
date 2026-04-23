import { open } from '@op-engineering/op-sqlite'
import { drizzle } from 'drizzle-orm/op-sqlite'
import * as schema from './schema'

const client = open({ name: 'workouttracker.db' })

export const db = drizzle(client, { schema })
