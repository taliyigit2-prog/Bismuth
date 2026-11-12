// The change log's triggers (faz-13 madde 2; spike S-B), generated from the Drizzle schema: for every copied table
// (tables.ts) an AFTER INSERT, AFTER UPDATE and AFTER DELETE trigger writes the whole new row (json_object of every
// column) or the deleted key into `change_log`, with the main computer's term (`host.epoch`) and the data version.
// The database guarantees the log, so a write a service forgets to announce is copied all the same.
// The triggers are a function of the schema: they are installed (and replaced when a column was added or the data
// version changed) each time the hotel's database is opened, right after its migrations — and dropped before
// migrations run, so a migration's own row rewrites are not logged half-way (a copy with another data version takes
// a fresh snapshot instead). The read-only copy and a database file being restored never get them.
// Identifiers come from the schema (never from input) and are quoted; values are bound by SQLite itself.
import type Database from 'better-sqlite3'
import { copiedTables, type CopiedTable } from './tables'

export const TRIGGER_PREFIX = 'cl_'

const q = (name: string): string => `\`${name.replace(/`/g, '``')}\``
const lit = (text: string): string => `'${text.replace(/'/g, "''")}'`

/** The term of the main computer as the trigger reads it (settings value is JSON: a plain number). */
const EPOCH = `COALESCE((SELECT CAST(\`value_json\` AS INTEGER) FROM \`settings\` WHERE \`key\` = 'host.epoch'), 1)`
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`

function rowJson(table: CopiedTable, alias: 'NEW' | 'OLD'): string {
  return `json_object(${table.columns.map((c) => `${lit(c.name)}, ${alias}.${q(c.name)}`).join(', ')})`
}

function pkJson(table: CopiedTable, alias: 'NEW' | 'OLD'): string {
  return `json_array(${table.primaryKey.map((c) => `${alias}.${q(c)}`).join(', ')})`
}

const INSERT_LOG = 'INSERT INTO `change_log` (`epoch`, `tbl`, `pk`, `op`, `row_json`, `schema_version`, `ts`)'

/** name → CREATE TRIGGER statement, for every copied table. */
export function changeLogTriggers(schemaVersion: number): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of copiedTables()) {
    const tbl = lit(t.name)
    const name = (op: string): string => `${TRIGGER_PREFIX}${t.name}_${op}`
    out.set(
      name('i'),
      `CREATE TRIGGER ${q(name('i'))} AFTER INSERT ON ${q(t.name)} BEGIN ` +
        `${INSERT_LOG} VALUES (${EPOCH}, ${tbl}, ${pkJson(t, 'NEW')}, 'I', ${rowJson(t, 'NEW')}, ${schemaVersion}, ${NOW}); END`
    )
    // A changed key (rare) is a delete of the old key and a write of the new row.
    const keyChanged = t.primaryKey.map((c) => `OLD.${q(c)} IS NOT NEW.${q(c)}`).join(' OR ')
    out.set(
      name('u'),
      `CREATE TRIGGER ${q(name('u'))} AFTER UPDATE ON ${q(t.name)} BEGIN ` +
        `${INSERT_LOG} SELECT ${EPOCH}, ${tbl}, ${pkJson(t, 'OLD')}, 'D', NULL, ${schemaVersion}, ${NOW} WHERE ${keyChanged}; ` +
        `${INSERT_LOG} VALUES (${EPOCH}, ${tbl}, ${pkJson(t, 'NEW')}, 'U', ${rowJson(t, 'NEW')}, ${schemaVersion}, ${NOW}); END`
    )
    out.set(
      name('d'),
      `CREATE TRIGGER ${q(name('d'))} AFTER DELETE ON ${q(t.name)} BEGIN ` +
        `${INSERT_LOG} VALUES (${EPOCH}, ${tbl}, ${pkJson(t, 'OLD')}, 'D', NULL, ${schemaVersion}, ${NOW}); END`
    )
  }
  return out
}

/** `cl_room_nights_u` → `room_nights`. */
const tableOfTrigger = (name: string): string => name.slice(TRIGGER_PREFIX.length, -2)

/** The change-log triggers present in the database, name → SQL. */
export function installedTriggers(sqlite: Database.Database): Map<string, string> {
  const rows = sqlite
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND substr(name, 1, 3) = ?")
    .all(TRIGGER_PREFIX) as { name: string; sql: string }[]
  return new Map(rows.map((r) => [r.name, r.sql]))
}

/**
 * Makes the triggers match the schema: missing ones are created, changed ones replaced, ones of a table that is no
 * longer copied removed. One transaction; returns how many statements ran (0 when already in step).
 */
export function installChangeLog(sqlite: Database.Database, schemaVersion: number): number {
  // A database whose migrations stop before the change log (or before a table got its last column) gets triggers
  // only where the table is exactly as the schema says; the program itself always runs every migration first.
  const has = (table: string): Set<string> =>
    new Set(
      (sqlite.prepare('SELECT name FROM pragma_table_info(?)').all(table) as { name: string }[]).map(
        (c) => c.name
      )
    )
  if (has('change_log').size === 0) return dropChangeLog(sqlite)
  const ready = new Set(
    copiedTables()
      .filter((t) => {
        const cols = has(t.name)
        return t.columns.every((c) => cols.has(c.name))
      })
      .map((t) => t.name)
  )
  const wanted = new Map(
    [...changeLogTriggers(schemaVersion)].filter(([name]) => ready.has(tableOfTrigger(name)))
  )
  const present = installedTriggers(sqlite)
  const statements: string[] = []
  for (const [name, sql] of present) if (wanted.get(name) !== sql) statements.push(`DROP TRIGGER ${q(name)}`)
  for (const [name, sql] of wanted) if (present.get(name) !== sql) statements.push(sql)
  if (statements.length === 0) return 0
  sqlite.transaction(() => {
    for (const s of statements) sqlite.prepare(s).run()
  })()
  return statements.length
}

/** Removes every change-log trigger (before migrations; the read-only copy never has them). */
export function dropChangeLog(sqlite: Database.Database): number {
  const present = [...installedTriggers(sqlite).keys()]
  if (present.length === 0) return 0
  sqlite.transaction(() => {
    for (const name of present) sqlite.prepare(`DROP TRIGGER ${q(name)}`).run()
  })()
  return present.length
}

/** Change-log rows older than `before` (ISO time) go; a copy further behind takes a snapshot. */
export function pruneChangeLog(sqlite: Database.Database, before: string): number {
  return sqlite.prepare('DELETE FROM `change_log` WHERE `ts` < ?').run(before).changes
}
