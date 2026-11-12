// Reading the change log on the hotel's computer (faz-13 madde 2–3): pages of changes after a sequence number and
// a full snapshot, both already filtered for the reader (tables.ts: secret columns never, identity numbers only when
// allowed). The live feed (/api/replica/changes, src/main/server/replica-routes.ts) and the Drive box writer
// (src/main/relay/writer.ts) both read through here.
// A snapshot is taken table by table while the program keeps writing: it starts from the last sequence number
// *before* the first row is read, so replaying the changes after it brings every row to its final state (every
// change is a whole row or a delete, applying one twice changes nothing).
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { copiedTables, filterRow, rowVisible, type RowFilter } from './tables'

export interface Change {
  seq: number
  epoch: number
  tbl: string
  /** Primary key values, in key column order. */
  pk: unknown[]
  op: 'I' | 'U' | 'D'
  /** The whole row as it may leave (null for a delete). */
  row: Record<string, unknown> | null
  schemaVersion: number
  ts: string
}

interface LogRow {
  seq: number
  epoch: number
  tbl: string
  pk: string
  op: 'I' | 'U' | 'D'
  row_json: string | null
  schema_version: number
  ts: string
}

/** Smallest and largest sequence numbers still in the log (an empty log: min = max + 1). */
export function logBounds(sqlite: Database.Database): { minSeq: number; maxSeq: number } {
  const last = sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'change_log'").get() as
    { seq: number } | undefined
  const first = sqlite.prepare('SELECT min(seq) AS m FROM change_log').get() as { m: number | null }
  const maxSeq = last?.seq ?? 0
  return { minSeq: first.m ?? maxSeq + 1, maxSeq }
}

const toChange = (r: LogRow, filter: RowFilter): Change => {
  const raw = r.row_json ? (JSON.parse(r.row_json) as Record<string, unknown>) : null
  // Someone else's personal note (§4.9-12): a bare delete of its key — no text, no owner — keeps the sequence whole
  // and takes away whatever an older copy may hold.
  const hidden = raw !== null && !rowVisible(r.tbl, raw, filter)
  return {
    seq: r.seq,
    epoch: r.epoch,
    tbl: r.tbl,
    pk: JSON.parse(r.pk) as unknown[],
    op: hidden ? 'D' : r.op,
    row: raw && !hidden ? filterRow(r.tbl, raw, filter) : null,
    schemaVersion: r.schema_version,
    ts: r.ts
  }
}

/** Up to `limit` changes with a sequence number above `after`, oldest first. */
export function readChanges(
  sqlite: Database.Database,
  after: number,
  limit: number,
  filter: RowFilter
): Change[] {
  const rows = sqlite
    .prepare(
      'SELECT seq, epoch, tbl, pk, op, row_json, schema_version, ts FROM change_log WHERE seq > ? ORDER BY seq LIMIT ?'
    )
    .all(after, limit) as LogRow[]
  return rows.map((r) => toChange(r, filter))
}

/** Every change with a sequence number in (after, upTo], filtered; for the conflict report too. */
export function readChangeRange(
  sqlite: Database.Database,
  after: number,
  upTo: number,
  filter: RowFilter
): Change[] {
  const rows = sqlite
    .prepare(
      'SELECT seq, epoch, tbl, pk, op, row_json, schema_version, ts FROM change_log WHERE seq > ? AND seq <= ? ORDER BY seq'
    )
    .all(after, upTo) as LogRow[]
  return rows.map((r) => toChange(r, filter))
}

export interface SnapshotMeta {
  epoch: number
  /** Changes up to and including this one are in the snapshot. */
  seq: number
  schemaVersion: number
  at: string
}

export interface SnapshotRow {
  tbl: string
  row: Record<string, unknown>
}

/** Rows read per query by `snapshotRows`: ten years of a hotel never sit in memory at once. */
export const SNAPSHOT_PAGE = 2_000

/**
 * Rows of every copied table, table by table, read in pages of `SNAPSHOT_PAGE` by rowid. Each page is read whole
 * before its first row is handed out: no query stays open while the caller rests, so the program can keep writing on
 * the same connection in between (a row written meanwhile is replayed from the change log after `meta.seq`).
 */
export function* snapshotRows(sqlite: Database.Database, filter: RowFilter): Generator<SnapshotRow> {
  for (const t of copiedTables()) {
    // Names come from the schema (tables.ts), never from input.
    const page = sqlite.prepare(
      `SELECT rowid AS "__rowid", * FROM \`${t.name}\` WHERE rowid > ? ORDER BY rowid LIMIT ${SNAPSHOT_PAGE}`
    )
    let after = -Infinity
    for (;;) {
      const rows = page.all(after) as Record<string, unknown>[]
      for (const row of rows) {
        after = row['__rowid'] as number
        delete row['__rowid']
        if (rowVisible(t.name, row, filter)) yield { tbl: t.name, row: filterRow(t.name, row, filter) }
      }
      if (rows.length < SNAPSHOT_PAGE) break
    }
  }
}

/** The term of this computer as the triggers write it. */
export function currentEpoch(sqlite: Database.Database): number {
  const row = sqlite.prepare("SELECT value_json FROM settings WHERE key = 'host.epoch'").get() as
    { value_json: string } | undefined
  const n = row ? Number(JSON.parse(row.value_json)) : 1
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** What a snapshot starts from: read before the first row. */
export function snapshotMeta(sqlite: Database.Database, schemaVersion: number, now: Date): SnapshotMeta {
  return { epoch: currentEpoch(sqlite), seq: logBounds(sqlite).maxSeq, schemaVersion, at: now.toISOString() }
}

/**
 * One digest per copied table over the rows as a reader receives them (ordered by key): the copy equals the source
 * when every digest matches (spike S-B). Secret columns are left out on both sides.
 */
export function tableDigests(sqlite: Database.Database, filter: RowFilter): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of copiedTables()) {
    const order = t.primaryKey.map((c) => `\`${c}\``).join(', ')
    const hash = createHash('sha256')
    for (const row of sqlite.prepare(`SELECT * FROM \`${t.name}\` ORDER BY ${order}`).iterate() as Iterable<
      Record<string, unknown>
    >) {
      if (!rowVisible(t.name, row, filter)) continue
      const shown = filterRow(t.name, row, filter)
      hash.update(JSON.stringify(Object.keys(shown).map((k) => [k, shown[k]])))
      hash.update('\n')
    }
    out[t.name] = hash.digest('hex')
  }
  return out
}
