// The box writer on the hotel's computer (faz-13 madde 4; K-32): every minute, when the change log moved, the new
// changes go into one package (`seg-…`); every night (and when the box has none for this term) a whole snapshot
// (`snap-…`); every few quiet minutes a small "still here" note (`durum.bmr`) so the owner's copy knows it is
// up to date. 14 snapshots are kept; segments a kept snapshot already covers go. Everything is encrypted with
// the Bismuth key; without a key or a Drive folder nothing is written and the screen says why.
// Identity numbers stay out unless `relay.excludeIdentity` is switched off. A computer that was replaced by another
// one ("Bu bilgisayarı ana bilgisayar yap" elsewhere) writes nothing more.
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { currentEpoch, logBounds, readChanges, snapshotMeta, snapshotRows } from '../replica/feed'
import {
  encodePackage,
  encodePackageLines,
  epochName,
  MARK_NAME,
  parseBoxName,
  segmentName,
  snapshotName,
  writeWhole,
  writeWholeSlowly,
  type BoxFile
} from './format'

/** Snapshots kept in the box (faz-13 madde 4). */
export const KEEP_SNAPSHOTS = 14
/** Changes per segment package. */
const SEGMENT_SIZE = 2_000
/** A quiet main computer still tells the box it is there this often. */
const MARK_EVERY_MS = 5 * 60_000

export interface RelayWriterDeps {
  sqlite: Database.Database
  /** The box folder, or null when Drive's Bismuth folder is not found. */
  dir(): string | null
  /** The Bismuth key, or null when none is kept on this computer. */
  key(): Buffer | null
  enabled(): boolean
  excludeIdentity(): boolean
  schemaVersion(): number
  /** True once another computer took over (src/main/relay/epoch.ts): nothing more is written. */
  replaced(): boolean
  clock?: () => Date
  /** Rest between blocks of a large file and between tables of a snapshot (K-32). */
  pause?: () => Promise<void>
}

export type RelayProblem = 'off' | 'noFolder' | 'noKey' | 'replaced' | 'writeFailed' | null

export interface RelayStatus {
  folder: string | null
  problem: RelayProblem
  lastSegmentAt: string | null
  lastSnapshotAt: string | null
  /** Changes in the log that are not in the box yet. */
  pending: number
}

const rest = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50))
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export function listBox(dir: string): BoxFile[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.map(parseBoxName).filter((f): f is BoxFile => f !== null)
}

const mtimeOf = (path: string): string | null => {
  try {
    return statSync(path).mtime.toISOString()
  } catch {
    return null
  }
}

export function createRelayWriter(deps: RelayWriterDeps) {
  const clock = deps.clock ?? (() => new Date())
  const pause = deps.pause ?? rest
  let lastMarkAt = 0
  let failed = false
  let busy: Promise<unknown> | null = null

  const ready = (): { dir: string; key: Buffer } | RelayProblem => {
    if (!deps.enabled()) return 'off'
    if (deps.replaced()) return 'replaced'
    const dir = deps.dir()
    if (!dir) return 'noFolder'
    const key = deps.key()
    if (!key) return 'noKey'
    return { dir, key }
  }

  /** The last change of this term already in the box (0 when none). */
  function boxedSeq(files: BoxFile[], epoch: number): { seq: number; hasSnapshot: boolean } {
    let seq = 0
    let hasSnapshot = false
    for (const f of files) {
      if (f.kind === 'seg' && f.epoch === epoch) seq = Math.max(seq, f.toSeq)
      if (f.kind === 'snap' && f.epoch === epoch) {
        seq = Math.max(seq, f.seq)
        hasSnapshot = true
      }
    }
    return { seq, hasSnapshot }
  }

  async function writeSnapshot(dir: string, key: Buffer): Promise<string> {
    const identity = !deps.excludeIdentity()
    const meta = snapshotMeta(deps.sqlite, deps.schemaVersion(), clock())
    // No `reader`: nobody's personal note goes into the box (§4.9-12), not even the owner's.
    const rows = snapshotRows(deps.sqlite, { identity })
    async function* lines(): AsyncGenerator<string> {
      let table = ''
      for (const r of rows) {
        if (r.tbl !== table) {
          table = r.tbl
          await tick() // between tables the program may write (the snapshot is replayed from `meta.seq`)
        }
        yield JSON.stringify(r)
      }
    }
    // Compressed as it is read (database review #3): ten years of rows are never held as text at once.
    const bytes = await encodePackageLines(
      {
        kind: 'snap',
        epoch: meta.epoch,
        fromSeq: 0,
        toSeq: meta.seq,
        schemaVersion: meta.schemaVersion,
        at: meta.at,
        identity
      },
      lines(),
      key
    )
    const name = snapshotName(meta.epoch, meta.seq)
    await writeWholeSlowly(join(dir, name), bytes, pause)
    prune(dir)
    return name
  }

  /** Keeps the newest 14 snapshots; removes segments a kept snapshot covers and those of an older term. */
  function prune(dir: string): void {
    const files = listBox(dir)
    const snaps = files
      .filter((f): f is Extract<BoxFile, { kind: 'snap' }> => f.kind === 'snap')
      .sort((a, b) => a.epoch - b.epoch || a.seq - b.seq)
    const keep = snaps.slice(-KEEP_SNAPSHOTS)
    const drop = new Set(snaps.slice(0, -KEEP_SNAPSHOTS).map((s) => s.name))
    const oldest = keep[0]
    const newestEpoch = keep.at(-1)?.epoch ?? 0
    for (const f of files) {
      if (f.kind !== 'seg' || !oldest) continue
      if (f.epoch < newestEpoch || (f.epoch === oldest.epoch && f.toSeq <= oldest.seq)) drop.add(f.name)
    }
    for (const name of drop) rmSync(join(dir, name), { force: true })
  }

  async function round(options: { snapshot?: boolean } = {}): Promise<RelayStatus> {
    const target = ready()
    if (typeof target === 'string' || target === null) return status(target)
    const { dir, key } = target
    try {
      const epoch = currentEpoch(deps.sqlite)
      const files = listBox(dir)
      const boxed = boxedSeq(files, epoch)
      const { minSeq, maxSeq } = logBounds(deps.sqlite)
      // No snapshot of this term yet, the log was trimmed past the box, or the nightly one: a whole snapshot.
      if (options.snapshot || !boxed.hasSnapshot || minSeq > boxed.seq + 1) {
        await writeSnapshot(dir, key)
      } else if (maxSeq > boxed.seq) {
        const identity = !deps.excludeIdentity()
        let after = boxed.seq
        while (after < maxSeq) {
          const changes = readChanges(deps.sqlite, after, SEGMENT_SIZE, { identity }).filter(
            (c) => c.epoch === epoch
          )
          if (changes.length === 0) break
          const from = changes[0]!.seq
          const to = changes.at(-1)!.seq
          const bytes = encodePackage(
            {
              kind: 'seg',
              epoch,
              fromSeq: from,
              toSeq: to,
              schemaVersion: deps.schemaVersion(),
              at: clock().toISOString(),
              identity
            },
            changes.map((c) => JSON.stringify(c)),
            key
          )
          writeWhole(join(dir, segmentName(epoch, from, to)), bytes)
          after = to
        }
        lastMarkAt = clock().getTime()
      } else if (clock().getTime() - lastMarkAt >= MARK_EVERY_MS) {
        // Nothing new: a small note that the main computer is here and the box is complete up to now.
        const bytes = encodePackage(
          {
            kind: 'mark',
            epoch,
            fromSeq: maxSeq,
            toSeq: maxSeq,
            schemaVersion: deps.schemaVersion(),
            at: clock().toISOString(),
            identity: false
          },
          [],
          key
        )
        writeWhole(join(dir, MARK_NAME), bytes)
        lastMarkAt = clock().getTime()
      }
      failed = false
    } catch {
      failed = true
    }
    return status(null)
  }

  function status(problem: RelayProblem): RelayStatus {
    const dir = deps.dir()
    const files = dir ? listBox(dir) : []
    const newest = (kind: 'seg' | 'snap'): string | null => {
      const list = files.filter((f) => f.kind === kind).map((f) => f.name)
      const times = list.map((n) => mtimeOf(join(dir!, n))).filter((t): t is string => t !== null)
      return times.sort().at(-1) ?? null
    }
    let pending = 0
    try {
      const epoch = currentEpoch(deps.sqlite)
      pending = Math.max(0, logBounds(deps.sqlite).maxSeq - boxedSeq(files, epoch).seq)
    } catch {
      pending = 0
    }
    return {
      folder: dir,
      problem: problem ?? (failed ? 'writeFailed' : null),
      lastSegmentAt: dir ? newest('seg') : null,
      lastSnapshotAt: dir ? newest('snap') : null,
      pending
    }
  }

  /** One round at a time (the minute timer and "Şimdi yaz" never overlap). */
  const once = (options?: { snapshot?: boolean }): Promise<RelayStatus> => {
    const run = (busy ?? Promise.resolve()).then(() => round(options))
    busy = run.catch(() => undefined)
    return run
  }

  return {
    /** The minute round: a segment when the log moved (or the first snapshot of the term). */
    tick: () => once(),
    /** The nightly snapshot (and "Şimdi yaz" in Settings). */
    snapshot: () => once({ snapshot: true }),
    status(): RelayStatus {
      const target = ready()
      return status(typeof target === 'string' || target === null ? target : null)
    }
  }
}
export type RelayWriter = ReturnType<typeof createRelayWriter>

export interface EpochNote {
  epoch: number
  previousEpoch: number
  /** The last change of the previous term the new main computer had: later ones of that term are conflicts. */
  baseSeq: number
  /** The new main computer's name. */
  by: string
  at: string
}

/** A new term's announcement (takeover): `epoch-<n>.bmr` in the box. */
export function writeEpochFile(
  dir: string,
  key: Buffer,
  note: Omit<EpochNote, 'at'>,
  schemaVersion: number,
  now: Date
): void {
  const at = now.toISOString()
  const full: EpochNote = { ...note, at }
  const bytes = encodePackage(
    {
      kind: 'epoch',
      epoch: note.epoch,
      fromSeq: note.baseSeq,
      toSeq: note.baseSeq,
      schemaVersion,
      at,
      identity: false
    },
    [JSON.stringify(full)],
    key
  )
  writeWhole(join(dir, epochName(note.epoch)), bytes)
}
