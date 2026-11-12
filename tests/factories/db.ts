import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openDatabase, type DatabaseHandle } from '../../src/main/db/client'
import { seedBaseData } from '../../src/main/db/seed/seed'

export const MIGRATIONS = resolve(__dirname, '../../drizzle')

/** Schema version after all committed migrations (= drizzle journal entries). */
export const SCHEMA_VERSION: number = (
  JSON.parse(readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: unknown[] }
).entries.length

/** A fresh, fully migrated in-memory database for one test. */
export function memoryDatabase(): Promise<DatabaseHandle> {
  return openDatabase({ file: ':memory:', migrationsFolder: MIGRATIONS })
}

/** Migrated in-memory database with the base seed (roles, lists, status tags…) loaded. */
export async function seededDatabase(
  now: Date = new Date('2026-10-01T09:00:00.000Z')
): Promise<DatabaseHandle> {
  const handle = await memoryDatabase()
  seedBaseData(handle.db, now)
  return handle
}
