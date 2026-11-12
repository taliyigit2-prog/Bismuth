// Who is the main computer (faz-13 madde 5; spike S-D). Each main computer has a term (`host.epoch`). "Bu
// bilgisayarı ana bilgisayar yap" on another computer starts the next term and leaves `epoch-<n>.bmr` in the box,
// encrypted with the Bismuth key (nobody without the key can fake one). The old computer, back on, finds it there
// within a minute: from then on it writes nothing (no change from any screen, phone or other computer; nothing
// more in the box) and offers to use the new main computer. What it wrote after the new one's last known change
// is listed as "çakışan kayıtlar" — never merged by itself (K-19).
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import * as z from 'zod'
import { readChangeRange } from '../replica/feed'
import { decodePackage, headerMatchesName, PackageError, readWhole } from './format'
import { listBox, type EpochNote } from './writer'

const noteSchema = z.object({
  epoch: z.number().int().min(2),
  previousEpoch: z.number().int().min(1),
  baseSeq: z.number().int().min(0),
  by: z.string().max(200),
  at: z.string()
})

/** Every valid term announcement in the box, lowest term first (damaged or foreign files are ignored). */
export function readTermNotes(dir: string, key: Buffer): EpochNote[] {
  const notes: EpochNote[] = []
  for (const f of listBox(dir)) {
    if (f.kind !== 'epoch') continue
    try {
      const { header, lines } = decodePackage(readWhole(join(dir, f.name)), key)
      const note = noteSchema.safeParse(JSON.parse(lines[0] ?? 'null'))
      if (headerMatchesName(header, f) && note.success && note.data.epoch === header.epoch)
        notes.push(note.data)
    } catch (error) {
      if (!(error instanceof PackageError) && !(error instanceof SyntaxError)) throw error
    }
  }
  return notes.sort((a, b) => a.epoch - b.epoch)
}

/**
 * The term that followed `myEpoch` (the computer that took over from this one), or null when the box announces no
 * newer term. When several came after, the direct successor: its last known change tells what is in conflict.
 */
export function findNewerTerm(dir: string, key: Buffer, myEpoch: number): EpochNote | null {
  const newer = readTermNotes(dir, key).filter((n) => n.epoch > myEpoch)
  return newer.find((n) => n.previousEpoch === myEpoch) ?? newer[0] ?? null
}

/** The highest term announced in the box (a takeover starts above it); 0 when none can be read. */
export function highestAnnouncedTerm(dir: string, key: Buffer): number {
  return readTermNotes(dir, key).at(-1)?.epoch ?? 0
}

/** The newest term any package in the box was written in (by file name; no key needed). */
export function highestBoxTerm(dir: string): number {
  let term = 0
  for (const f of listBox(dir)) if (f.kind !== 'mark') term = Math.max(term, f.epoch)
  return term
}

export interface Replaced extends EpochNote {
  /** When this computer noticed. */
  seenAt: string
}

const replacedSchema = noteSchema.extend({ seenAt: z.string() })

/** "This computer was replaced": kept in a small file next to the data (survives a restart). */
export function createEpochGuard(file: string) {
  let current: Replaced | null = null
  try {
    const parsed = replacedSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    current = parsed.success ? parsed.data : null
  } catch {
    current = null
  }
  const listeners = new Set<() => void>()
  return {
    replaced: (): Replaced | null => current,
    mark(note: EpochNote, now: Date): void {
      if (current && current.epoch >= note.epoch) return
      current = { ...note, seenAt: now.toISOString() }
      writeFileSync(`${file}.tmp`, JSON.stringify(current))
      renameSync(`${file}.tmp`, file)
      for (const l of listeners) l()
    },
    /** This computer becomes a client of the new main computer (or keeps a fresh copy): the note goes. */
    clear(): void {
      current = null
      rmSync(file, { force: true })
      for (const l of listeners) l()
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
export type EpochGuard = ReturnType<typeof createEpochGuard>

export interface ConflictItem {
  seq: number
  tbl: string
  pk: unknown[]
  op: 'I' | 'U' | 'D'
  ts: string
}

/**
 * Changes this computer made in its old term after the last one the new main computer had: written in two places,
 * so listed for the owner to carry over by hand (no automatic merge).
 */
export function conflictingChanges(sqlite: Database.Database, note: EpochNote): ConflictItem[] {
  return readChangeRange(sqlite, note.baseSeq, Number.MAX_SAFE_INTEGER, { identity: false })
    .filter((c) => c.epoch === note.previousEpoch)
    .map((c) => ({ seq: c.seq, tbl: c.tbl, pk: c.pk, op: c.op, ts: c.ts }))
}

/**
 * The same changes with their rows, for the file the owner saves; identity numbers only when the person's role may
 * see them (D7).
 */
export function conflictRows(sqlite: Database.Database, note: EpochNote, identity: boolean) {
  return readChangeRange(sqlite, note.baseSeq, Number.MAX_SAFE_INTEGER, { identity }).filter(
    (c) => c.epoch === note.previousEpoch
  )
}
