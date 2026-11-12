// P14fix #6: checking a backup copy (integrity_check, its schema version) runs in a worker thread with its own
// read-only connection, so the main process — every window's calls — keeps answering while a copy is checked.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  integrityOfFile,
  integrityOfFileAsync,
  schemaVersionOfFile,
  schemaVersionOfFileAsync
} from '../db/client'

let dir = ''
let file = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bismuth-offthread-'))
  file = join(dir, 'big.db')
  const db = new Database(file)
  db.exec(
    'create table t (id integer primary key, a text, b text); create index t_a on t(a); create index t_b on t(b)'
  )
  db.exec('create table __drizzle_migrations (id integer primary key, hash text, created_at numeric)')
  for (let i = 0; i < 7; i++) db.prepare('insert into __drizzle_migrations (hash) values (?)').run(`m${i}`)
  const insert = db.prepare('insert into t (a, b) values (?, ?)')
  db.transaction(() => {
    for (let i = 0; i < 250_000; i++) insert.run(`a-${(i * 7919) % 250_000}-${'x'.repeat(40)}`, `b-${i}`)
  })()
  db.close()
}, 120_000)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** Longest pause of the event loop while `work` runs (a 5 ms timer measures it). */
async function longestPause(
  work: () => Promise<unknown> | unknown
): Promise<{ pauseMs: number; ms: number }> {
  let last = performance.now()
  let pauseMs = 0
  const timer = setInterval(() => {
    const now = performance.now()
    pauseMs = Math.max(pauseMs, now - last)
    last = now
  }, 5)
  const start = performance.now()
  await new Promise((r) => setTimeout(r, 20))
  last = performance.now()
  await work()
  const ms = performance.now() - start
  await new Promise((r) => setTimeout(r, 20))
  clearInterval(timer)
  pauseMs = Math.max(pauseMs, performance.now() - last)
  return { pauseMs, ms }
}

describe('yedeğin denetimi ana süreci dondurmaz (P14fix #6)', () => {
  it('integrity_check ayrı iş parçacığında koşar: sonuç aynı, olay döngüsü takılmaz', async () => {
    const sync = await longestPause(() => integrityOfFile(file))
    const off = await longestPause(async () => expect(await integrityOfFileAsync(file)).toBe('ok'))
    // The check on the main thread holds the loop for its whole length; in the worker the loop keeps ticking.
    expect(sync.pauseMs).toBeGreaterThan(60)
    expect(off.pauseMs).toBeLessThan(Math.max(50, sync.pauseMs / 3))
  }, 60_000)

  it('sürüm okuması da ayrı iş parçacığında; bozuk dosya aynı biçimde hata verir', async () => {
    expect(await schemaVersionOfFileAsync(file)).toBe(schemaVersionOfFile(file))
    expect(await schemaVersionOfFileAsync(file)).toBe(7)
    await expect(integrityOfFileAsync(join(dir, 'yok.db'))).rejects.toThrow()
  })
})
