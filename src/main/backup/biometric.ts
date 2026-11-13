// Biometric tables never leave the computer (K-51): the backup archive (and so the Drive copy), the pre-migration
// snapshot, the export and the read-only copy / Drive box carry no row of them. The export and the copy read from
// lists (`export-catalog`, `replica/tables.ts` LOCAL_ONLY_TABLES); a backup is a page-level copy of the whole file, so
// its copy is emptied here: rows deleted and the file vacuumed, so no sealed blob stays in a free page.
import Database from 'better-sqlite3'

/** Camera tables holding sealed face vectors and crops (schema/camera.ts). */
export const BIOMETRIC_TABLES = ['guest_faces', 'camera_events'] as const

/**
 * Empties the biometric tables of a database file copy (a backup). A table the file does not have (a copy of an older
 * schema) is skipped. Returns the rows removed. Never call it on the live database.
 */
export function scrubBiometricData(file: string): number {
  const db = new Database(file, { fileMustExist: true })
  try {
    db.pragma('journal_mode = DELETE') // nothing is left behind in a -wal file
    let removed = 0
    for (const table of BIOMETRIC_TABLES) {
      const exists = db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table)
      if (!exists) continue
      removed += db.prepare(`delete from ${table}`).run().changes
    }
    // Always: even with empty tables, free pages from earlier deletions may still hold sealed bytes.
    db.exec('VACUUM')
    return removed
  } finally {
    db.close()
  }
}
