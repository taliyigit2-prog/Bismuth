// The owner's computer reading the box (faz-13 madde 3–4; spike S-C): when the main computer cannot be reached
// live (no private network), the read-only copy is brought up to date from the encrypted packages Drive syncs into
// the hotel's Bismuth folder. Newest term's snapshot when the copy is empty or behind a takeover, then segments in
// order. A package that does not decrypt (half-synced, damaged, another key) is skipped this round and tried
// again later — never applied. A package from another data version stops the copy ("Bismuth'u güncelleyin").
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { Change, SnapshotRow } from '../replica/feed'
import {
  applyChanges,
  applySnapshot,
  hasData,
  readState,
  touchState,
  type ReplicaState
} from '../replica/apply'
import {
  decodePackage,
  headerMatchesName,
  PackageError,
  readWhole,
  type BoxFile,
  type PackageHeader
} from './format'
import { listBox } from './writer'

export type RelayReadResult =
  /** Brought up to date (or nothing new). */
  | { status: 'ok'; applied: number; state: ReplicaState }
  /** The box has packages of a newer data version: this program must be updated. */
  | { status: 'needsUpdate'; state: ReplicaState }
  /** The box was written by an older program than this one: the main computer should be updated. */
  | { status: 'hostOlder'; state: ReplicaState }
  /** Nothing usable yet (no snapshot, or only packages that do not decrypt). */
  | { status: 'waiting'; reason: 'empty' | 'damaged' | 'wrongKey'; state: ReplicaState }

export interface RelayReaderDeps {
  writer: Database.Database
  /** Data version of this program (and of the copy). */
  schemaVersion: number
  /** The person whose copy this is: nobody else's personal notes stay in it (§4.9-12); absent: kept as sent. */
  reader?: string | null
}

type Seg = Extract<BoxFile, { kind: 'seg' }>
type Snap = Extract<BoxFile, { kind: 'snap' }>

export function readBox(deps: RelayReaderDeps, dir: string, key: Buffer): RelayReadResult {
  const files = listBox(dir)
  let state = readState(deps.writer)
  let applied = 0
  let damaged = false
  let wrongKey = false

  const open = (f: BoxFile): { header: PackageHeader; lines: string[] } | null => {
    try {
      const pkg = decodePackage(readWhole(join(dir, f.name)), key)
      if (headerMatchesName(pkg.header, f)) return pkg
      damaged = true
      return null
    } catch (error) {
      if (error instanceof PackageError && error.reason === 'wrongKey') wrongKey = true
      else damaged = true
      return null
    }
  }
  const versionGate = (header: PackageHeader): RelayReadResult | null =>
    header.schemaVersion > deps.schemaVersion
      ? { status: 'needsUpdate', state }
      : header.schemaVersion < deps.schemaVersion
        ? { status: 'hostOlder', state }
        : null

  const snaps = files
    .filter((f): f is Snap => f.kind === 'snap')
    .sort((a, b) => b.epoch - a.epoch || b.seq - a.seq)
  const segs = files.filter((f): f is Seg => f.kind === 'seg')
  const newestEpoch = Math.max(0, ...snaps.map((s) => s.epoch), ...segs.map((s) => s.epoch))

  /** The newest snapshot of `epoch` (going back to older ones of that term while a newer one does not decrypt). */
  function takeSnapshot(epoch: number, minSeq: number): RelayReadResult | 'none' {
    for (const s of snaps.filter((x) => x.epoch === epoch && x.seq >= minSeq)) {
      const pkg = open(s)
      if (!pkg || pkg.header.kind !== 'snap') continue
      const gate = versionGate(pkg.header)
      if (gate) return gate
      const rows = pkg.lines.map((l) => JSON.parse(l) as SnapshotRow)
      const ok = applySnapshot(
        deps.writer,
        {
          epoch: pkg.header.epoch,
          seq: pkg.header.toSeq,
          schemaVersion: pkg.header.schemaVersion,
          at: pkg.header.at
        },
        rows,
        {
          identity: pkg.header.identity,
          source: 'relay',
          asOf: pkg.header.at,
          ...(deps.reader !== undefined ? { reader: deps.reader } : {})
        }
      )
      if (ok) {
        applied += rows.length
        state = readState(deps.writer)
        return { status: 'ok', applied, state }
      }
    }
    return 'none'
  }

  // A copy that is empty, or follows an older term than the box: the newest term's snapshot first.
  if (!hasData(state) || newestEpoch > state.epoch) {
    const taken = takeSnapshot(newestEpoch, 0)
    if (taken === 'none') {
      return hasData(state)
        ? { status: 'ok', applied, state }
        : { status: 'waiting', reason: wrongKey ? 'wrongKey' : damaged ? 'damaged' : 'empty', state }
    }
    if (taken.status !== 'ok') return taken
  }

  // Then the segments of this term after the copy, in order; over a missing piece only a snapshot helps.
  const pending = segs
    .filter((s) => s.epoch === state.epoch && s.toSeq > state.seq)
    .sort((a, b) => a.fromSeq - b.fromSeq)
  for (const s of pending) {
    if (s.toSeq <= state.seq) continue
    if (s.fromSeq > state.seq + 1) {
      const taken = takeSnapshot(state.epoch, state.seq + 1)
      if (taken === 'none') break
      if (taken.status !== 'ok') return taken
      if (s.toSeq <= state.seq) continue
      if (s.fromSeq > state.seq + 1) break
    }
    const pkg = open(s)
    if (!pkg || pkg.header.kind !== 'seg') break // not synced yet: next round
    const gate = versionGate(pkg.header)
    if (gate) return gate
    const changes = pkg.lines.map((l) => JSON.parse(l) as Change)
    const result = applyChanges(deps.writer, changes, {
      identity: pkg.header.identity,
      source: 'relay',
      asOf: pkg.header.at,
      ...(deps.reader !== undefined ? { reader: deps.reader } : {})
    })
    state = readState(deps.writer)
    if (result.status !== 'applied' || !result.complete) break
    applied += result.applied
  }

  // The main computer's "still here" note: when the copy has everything up to it, the copy is current until then.
  const mark = files.find((f) => f.kind === 'mark')
  if (mark) {
    const pkg = open(mark)
    if (
      pkg &&
      pkg.header.kind === 'mark' &&
      pkg.header.epoch === state.epoch &&
      pkg.header.toSeq <= state.seq &&
      (!state.asOf || pkg.header.at > state.asOf)
    ) {
      touchState(deps.writer, pkg.header.at, 'relay')
      state = readState(deps.writer)
    }
  }
  return { status: 'ok', applied, state }
}
