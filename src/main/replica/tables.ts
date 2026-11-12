// Which tables and columns leave the hotel's computer for the owner's read-only copy and the encrypted Drive box
// (faz-13 madde 2–4; K-19, 03-mimari.md §11). Read from the Drizzle schema itself: a table added later is copied
// automatically, unless it is listed below as one that never leaves (a test fails when a new table is in neither
// list's thinking — see tables.test.ts). Copied rows go out as written, except:
//   - secret columns (sign-in hashes) never leave;
//   - identity document numbers leave only when the reader may see them (live feed: the grant user's role has
//     `guests.identity`; Drive box: only when `relay.excludeIdentity` is off). Elsewhere they arrive as null;
//   - a personal note (§4.9-12: readable only by its owner, not even by the owner role) leaves only for its own
//     owner's copy, never into the Drive box; to anyone else its change goes out as a bare delete of its key (the copy
//     drops what it may hold from before, and the change log stays without gaps).
import { is } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '../db/schema'

/** Tables that are never copied, with the reason (a test keeps this list honest). */
export const LOCAL_ONLY_TABLES: Readonly<Record<string, string>> = {
  sessions: 'sign-in tokens of this computer',
  devices: 'devices signed in to this computer',
  recovery_codes: 'personal recovery code hashes',
  replica_grants: 'who may pull the change log',
  change_log: 'the log itself'
}

/** Columns that never leave this computer (personal password and PIN hashes). */
export const SECRET_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  users: ['password_hash', 'pin_hash']
}

/** Identity document numbers (KVKK, G-50): copied only to a reader allowed to see them. */
export const IDENTITY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  guests: ['id_doc_number'],
  blacklist: ['id_doc_number']
}

export interface CopiedColumn {
  name: string
  notNull: boolean
  hasDefault: boolean
  /** SQLite affinity used for the placeholder of a NOT NULL column that is not sent ('' or 0). */
  kind: 'text' | 'integer' | 'other'
}

export interface CopiedTable {
  name: string
  /** Every column, in schema order (the trigger writes all of them; filters drop the hidden ones on the way out). */
  columns: CopiedColumn[]
  primaryKey: string[]
}

function describe(table: SQLiteTable): CopiedTable {
  const config = getTableConfig(table)
  const single = config.columns.filter((c) => c.primary).map((c) => c.name)
  const composite = config.primaryKeys[0]?.columns.map((c) => c.name) ?? []
  return {
    name: config.name,
    columns: config.columns.map((c) => ({
      name: c.name,
      notNull: c.notNull,
      hasDefault: c.hasDefault,
      kind: c.getSQLType().startsWith('integer') ? 'integer' : c.getSQLType() === 'text' ? 'text' : 'other'
    })),
    primaryKey: single.length ? single : composite
  }
}

/** Every table of the schema (copied or not), by SQL name. */
export function allSchemaTables(): string[] {
  return schemaTables().map((t) => getTableConfig(t).name)
}

/** The table objects among the schema's exports (enums and helpers are skipped). */
function schemaTables(): SQLiteTable[] {
  const values: unknown[] = Object.values(schema)
  return values.filter((v): v is SQLiteTable => is(v, SQLiteTable))
}

let cache: CopiedTable[] | null = null

/** The copied tables, in a stable order (schema order). */
export function copiedTables(): CopiedTable[] {
  cache ??= schemaTables()
    .map(describe)
    .filter((t) => !(t.name in LOCAL_ONLY_TABLES))
  return cache
}

const byName = (): Map<string, CopiedTable> => new Map(copiedTables().map((t) => [t.name, t]))
let index: Map<string, CopiedTable> | null = null
export function copiedTable(name: string): CopiedTable | null {
  index ??= byName()
  return index.get(name) ?? null
}

/**
 * Rows only one person may read (§4.9-12): the table, the column and value that make a row private, and the column
 * naming its owner.
 */
export const PRIVATE_ROWS: Readonly<Record<string, { column: string; value: string; owner: string }>> = {
  notes: { column: 'kind', value: 'personal', owner: 'owner_user_id' }
}

/** What a reader may receive. */
export interface RowFilter {
  identity: boolean
  /**
   * The person whose copy it is: their own private rows go to them. Absent or null (the Drive box, reports): no
   * private row at all.
   */
  reader?: string | null
}

/** False when this row is someone else's private row (a personal note of another person, or any in the box). */
export function rowVisible(tbl: string, row: Record<string, unknown>, filter: RowFilter): boolean {
  const rule = PRIVATE_ROWS[tbl]
  if (!rule || row[rule.column] !== rule.value) return true
  return filter.reader !== undefined && filter.reader !== null && row[rule.owner] === filter.reader
}

/** The row as it may leave: secret columns removed, identity numbers removed unless allowed. */
export function filterRow(
  tbl: string,
  row: Record<string, unknown>,
  filter: RowFilter
): Record<string, unknown> {
  const secret = SECRET_COLUMNS[tbl]
  const identity = filter.identity ? undefined : IDENTITY_COLUMNS[tbl]
  if (!secret && !identity) return row
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (secret?.includes(k) || identity?.includes(k)) continue
    out[k] = v
  }
  return out
}
