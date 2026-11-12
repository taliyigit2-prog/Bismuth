// Migrations only add (G-133; idea from actualbudget/actual "additive-only migrations", MIT).
// Dropping or renaming a table/column breaks older backups and customer machines. If a future migration
// truly needs SQLite's table-rebuild pattern, list it in ALLOWED with the reason and owner approval.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '../factories/db'

const ALLOWED: Record<string, string> = {}
const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bRENAME\s+(?:COLUMN|TO)\b/i,
  /\bDELETE\s+FROM\b/i
]

describe('migrasyonlar yalnızca ekler', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.+\.sql$/.test(f))

  it('en az bir migrasyon var ve numaralar sıralı', () => {
    expect(files.length).toBeGreaterThan(0)
    files.forEach((f, i) => expect(f.startsWith(String(i).padStart(4, '0'))).toBe(true))
  })

  it.each(files)('%s tablo/sütun silmez ya da yeniden adlandırmaz', (file) => {
    if (ALLOWED[file]) return
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    for (const pattern of DESTRUCTIVE) expect(sql).not.toMatch(pattern)
  })
})
