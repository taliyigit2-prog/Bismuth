// Applying the main computer's changes to the read-only copy (faz-13 madde 3; spike S-B). Idempotent: a change is a
// whole row (written with INSERT OR REPLACE, so a row that briefly clashes with an older one during a replay settles
// on its final state) or a delete; applying the same change twice, or a change older than the copy, changes nothing.
// The term (`epoch`) decides who is the main computer: changes of an older term (a computer that was replaced by
// "Bu bilgisayarı ana bilgisayar yap") are ignored, a newer term needs that term's snapshot first.
// Columns the reader may not receive arrive missing: secret ones get an empty placeholder, identity numbers keep
// the value the copy already had (a Drive box package without them must not erase what the live feed brought).
// Runs on the copier's connection only (db/client.ts `openReplicaDatabase`); every batch is one transaction.
import type Database from 'better-sqlite3'
import type { Change, SnapshotMeta, SnapshotRow } from './feed'
import { copiedTable, copiedTables, IDENTITY_COLUMNS, PRIVATE_ROWS, type CopiedTable } from './tables'

/** Tables written only by appending (audit_log, G-24): rows are added once and never replaced or removed. */
const APPEND_ONLY = new Set(['audit_log'])

export type ReplicaSource = 'live' | 'relay'

export interface ReplicaState {
  /** Term of the main computer the copy follows (0 = empty copy). */
  epoch: number
  /** Last change applied. */
  seq: number
  /** Data version of the main computer the copy came from. */
  schemaVersion: number
  /** The main computer's data up to this moment is in the copy ("Yedek kopya · 14:32"). */
  asOf: string | null
  source: ReplicaSource | null
}

const EMPTY: ReplicaState = { epoch: 0, seq: 0, schemaVersion: 0, asOf: null, source: null }

export function readState(writer: Database.Database): ReplicaState {
  const rows = writer.prepare('SELECT key, value FROM _replica_meta').all() as {
    key: string
    value: string
  }[]
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const num = (k: string): number => Number(map.get(k) ?? 0) || 0
  return {
    epoch: num('epoch'),
    seq: num('seq'),
    schemaVersion: num('schemaVersion'),
    asOf: map.get('asOf') ?? null,
    source: (map.get('source') as ReplicaSource | undefined) ?? null
  }
}

function writeState(writer: Database.Database, patch: Partial<ReplicaState>): void {
  const put = writer.prepare(
    'INSERT INTO _replica_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== null) put.run(k, String(v))
}

/** The copy holds data (a snapshot was applied at least once). */
export const hasData = (state: ReplicaState): boolean => state.epoch > 0

const q = (name: string): string => `\`${name}\``

/** Prepared statements per table and column set (rows of one table usually share one set). */
function createWriter(writer: Database.Database) {
  const cache = new Map<string, Database.Statement>()
  const prepared = (key: string, sql: () => string): Database.Statement => {
    let s = cache.get(key)
    if (!s) {
      s = writer.prepare(sql())
      cache.set(key, s)
    }
    return s
  }
  const where = (t: CopiedTable): string => t.primaryKey.map((c) => `${q(c)} = ?`).join(' AND ')

  /** The values to write: what came, plus a placeholder for a required column that was not sent. */
  function columnsOf(t: CopiedTable, row: Record<string, unknown>): { cols: string[]; values: unknown[] } {
    const cols: string[] = []
    const values: unknown[] = []
    for (const c of t.columns) {
      if (c.name in row) {
        cols.push(c.name)
        values.push(bindable(row[c.name]))
      } else if (c.notNull && !c.hasDefault) {
        cols.push(c.name)
        values.push(c.kind === 'integer' ? 0 : '')
      }
    }
    return { cols, values }
  }

  return {
    upsert(t: CopiedTable, row: Record<string, unknown>, keepIdentity: boolean): void {
      let full = row
      const identity = IDENTITY_COLUMNS[t.name]
      if (keepIdentity && identity) {
        // The sender left identity numbers out: keep the ones the copy has.
        const pk = t.primaryKey.map((c) => bindable(row[c]))
        const had = prepared(
          `${t.name}|id`,
          () => `SELECT ${identity.map(q).join(', ')} FROM ${q(t.name)} WHERE ${where(t)}`
        ).get(...pk) as Record<string, unknown> | undefined
        if (had) full = { ...had, ...row }
      }
      const { cols, values } = columnsOf(t, full)
      if (APPEND_ONLY.has(t.name)) {
        const pk = t.primaryKey.map((c) => bindable(full[c]))
        prepared(
          `${t.name}|add|${cols.join(',')}`,
          () =>
            `INSERT INTO ${q(t.name)} (${cols.map(q).join(', ')}) SELECT ${cols.map(() => '?').join(', ')} ` +
            `WHERE NOT EXISTS (SELECT 1 FROM ${q(t.name)} WHERE ${where(t)})`
        ).run(...values, ...pk)
        return
      }
      prepared(
        `${t.name}|put|${cols.join(',')}`,
        () =>
          `INSERT OR REPLACE INTO ${q(t.name)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      ).run(...values)
    },
    remove(t: CopiedTable, pk: unknown[]): void {
      if (APPEND_ONLY.has(t.name)) return
      prepared(`${t.name}|del`, () => `DELETE FROM ${q(t.name)} WHERE ${where(t)}`).run(...pk.map(bindable))
    },
    clear(t: CopiedTable): void {
      if (APPEND_ONLY.has(t.name)) return
      prepared(`${t.name}|clear`, () => `DELETE FROM ${q(t.name)}`).run()
    }
  }
}

/** JSON values as SQLite takes them (booleans as 0/1; objects never arrive, but stay text if they do). */
function bindable(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return value
}

export interface ApplyOptions {
  /** The sender included identity numbers (live feed to an allowed user; a box package with them). */
  identity: boolean
  /**
   * The reader may not hold identity numbers at all (the live feed says so when the person's role lost
   * `guests.identity`): a snapshot then keeps none of those the copy had (D6). Absent: numbers the sender left out
   * are kept (a Drive box package without them must not erase what the live feed brought).
   */
  allowed?: boolean
  source: ReplicaSource
  /** The main computer's data is complete up to this moment once the batch is in. */
  asOf: string
  /**
   * The person whose copy this is (§4.9-12): other people's personal notes are never kept — those an earlier version
   * brought go with this batch. Absent: rows are kept as sent.
   */
  reader?: string | null
}

/** Removes every private row (a personal note) that is not `reader`'s own; the number removed. */
export function forgetPrivateRows(writer: Database.Database, reader: string | null): number {
  let removed = 0
  for (const [tbl, rule] of Object.entries(PRIVATE_ROWS)) {
    // Names come from tables.ts, never from input.
    removed += writer
      .prepare(`DELETE FROM ${q(tbl)} WHERE ${q(rule.column)} = ? AND ${q(rule.owner)} IS NOT ?`)
      .run(rule.value, reader).changes
  }
  return removed
}

export type ApplyResult =
  /** `complete`: the whole batch is in (false: a piece is missing, what came before it is kept). */
  | { status: 'applied'; applied: number; skipped: number; complete: boolean; state: ReplicaState }
  /** A newer term: the copy needs that term's snapshot. */
  | { status: 'needSnapshot'; state: ReplicaState }

/** Applies a batch of changes in order, in one transaction; older or already applied ones are skipped. */
export function applyChanges(
  writer: Database.Database,
  changes: readonly Change[],
  options: ApplyOptions
): ApplyResult {
  const state = readState(writer)
  if (!hasData(state)) return { status: 'needSnapshot', state }
  const w = createWriter(writer)
  let applied = 0
  let skipped = 0
  let seq = state.seq
  let stop = null as 'term' | 'gap' | null
  writer.transaction(() => {
    for (const change of changes) {
      if (change.epoch < state.epoch || (change.epoch === state.epoch && change.seq <= seq)) {
        skipped++
        continue
      }
      if (change.epoch > state.epoch) {
        stop = 'term'
        break
      }
      if (change.seq !== seq + 1) {
        stop = 'gap'
        break
      }
      const t = copiedTable(change.tbl)
      if (t) {
        if (change.op === 'D' || !change.row) w.remove(t, change.pk)
        else w.upsert(t, change.row, !options.identity)
      }
      seq = change.seq
      applied++
    }
    if (options.reader !== undefined) forgetPrivateRows(writer, options.reader)
    // The badge's time moves only when nothing is missing.
    writeState(writer, stop === null ? { seq, asOf: options.asOf, source: options.source } : { seq })
  })()
  if (stop === 'term') return { status: 'needSnapshot', state: readState(writer) }
  return { status: 'applied', applied, skipped, complete: stop === null, state: readState(writer) }
}

/**
 * Replaces the copy's rows with a snapshot (one transaction: a cut-off snapshot changes nothing). A snapshot of an
 * older term than the copy follows is refused (false), and so is an older box snapshot of the same term (D2: an old
 * snapshot put back into the box would turn the copy back in time).
 */
export function applySnapshot(
  writer: Database.Database,
  meta: SnapshotMeta,
  rows: Iterable<SnapshotRow>,
  options: ApplyOptions
): boolean {
  const state = readState(writer)
  if (meta.epoch < state.epoch) return false
  // From the Drive box only: the live feed is the main computer itself answering now (its word stands).
  if (options.source === 'relay' && meta.epoch === state.epoch && meta.seq < state.seq) return false
  const w = createWriter(writer)
  writer.transaction(() => {
    const kept = new Map<string, Map<string, Record<string, unknown>>>()
    for (const t of copiedTables()) {
      const identity = IDENTITY_COLUMNS[t.name]
      if (!options.identity && identity && options.allowed !== false) {
        // Keep identity numbers the copy already has for rows that stay.
        const cols = [...t.primaryKey, ...identity]
        const map = new Map<string, Record<string, unknown>>()
        for (const r of writer.prepare(`SELECT ${cols.map(q).join(', ')} FROM ${q(t.name)}`).all() as Record<
          string,
          unknown
        >[])
          map.set(JSON.stringify(t.primaryKey.map((c) => r[c])), r)
        kept.set(t.name, map)
      }
      w.clear(t)
    }
    for (const { tbl, row } of rows) {
      const t = copiedTable(tbl)
      if (!t) continue
      const had = kept.get(tbl)?.get(JSON.stringify(t.primaryKey.map((c) => row[c])))
      w.upsert(t, had ? { ...had, ...row } : row, false)
    }
    if (options.reader !== undefined) forgetPrivateRows(writer, options.reader)
    writeState(writer, {
      epoch: meta.epoch,
      seq: meta.seq,
      schemaVersion: meta.schemaVersion,
      asOf: options.asOf,
      source: options.source
    })
  })()
  return true
}

/**
 * The person whose view the copy shows may no longer see identity numbers (D6): every number the copy holds goes,
 * and the copy remembers it (a later live page that allows them again brings a fresh snapshot). True when any row
 * changed or the state flipped.
 */
export function forgetIdentity(writer: Database.Database): boolean {
  let changed = 0
  writer.transaction(() => {
    for (const t of copiedTables()) {
      const identity = IDENTITY_COLUMNS[t.name]
      if (!identity) continue
      // Names come from the schema (tables.ts), never from input.
      const set = identity.map((c) => `${q(c)} = NULL`).join(', ')
      const any = identity.map((c) => `${q(c)} IS NOT NULL`).join(' OR ')
      changed += writer.prepare(`UPDATE ${q(t.name)} SET ${set} WHERE ${any}`).run().changes
    }
    writer
      .prepare(
        "INSERT INTO _replica_meta (key, value) VALUES ('identity', '0') ON CONFLICT(key) DO UPDATE SET value = '0'"
      )
      .run()
  })()
  return changed > 0
}

/** The copy last heard from the live feed that identity numbers are allowed (null: never said). */
export function identityAllowed(writer: Database.Database): boolean | null {
  const row = writer.prepare("SELECT value FROM _replica_meta WHERE key = 'identity'").get() as
    { value: string } | undefined
  return row ? row.value === '1' : null
}

/** Notes that the live feed allows identity numbers again. */
export function noteIdentityAllowed(writer: Database.Database): void {
  writer
    .prepare(
      "INSERT INTO _replica_meta (key, value) VALUES ('identity', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
    )
    .run()
}

/** Notes that the copy is complete up to `asOf` without new changes (a quiet hour still moves the badge). */
export function touchState(writer: Database.Database, asOf: string, source: ReplicaSource): void {
  writer.transaction(() => writeState(writer, { asOf, source }))()
}

export { EMPTY as EMPTY_REPLICA_STATE }
