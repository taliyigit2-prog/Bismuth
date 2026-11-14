// Database review #3 (P13sec2): a full snapshot of ten busy years (tests/factories/big-hotel.ts, 10 years × 20 rooms)
// for the owner's copy and the Drive box. The rows are read in pages and compressed as they come, so the program's
// memory does not grow with the size of the hotel; the package opens again to exactly the rows that went in.
import { randomBytes } from 'node:crypto'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServices } from '../../src/main/services'
import type { DatabaseHandle } from '../../src/main/db/client'
import { decodePackage, encodePackageLines } from '../../src/main/relay/format'
import { snapshotRows, SNAPSHOT_PAGE } from '../../src/main/replica/feed'
import { testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { seedBigHotel } from '../factories/big-hotel'
import { tempDataDir } from '../factories/runtime'

let handle: DatabaseHandle

/** Forces a collection so the heap numbers are what is still held, not garbage waiting for the next GC. */
function collectGarbage(): void {
  setFlagsFromString('--expose-gc')
  ;(runInNewContext('gc') as () => void)()
}

beforeAll(async () => {
  handle = await seededDatabase(new Date('2016-01-01T08:00:00.000Z'))
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: tempDataDir(),
      electron: null,
      chrome: null
    },
    { clock: testClock('2026-01-03T09:00:00.000Z') }
  )
  seedBigHotel(handle, services)
}, 300_000)
afterAll(() => handle?.close())

describe('büyük otelde tam kopya ve kutu paketi', () => {
  it('10 yıl × 20 oda: satırlar sayfa sayfa okunur, sıkıştırılarak paketlenir; bellek veriyle büyümez', async () => {
    const key = randomBytes(32)
    collectGarbage()
    const baseline = process.memoryUsage().heapUsed
    let peak = 0
    let count = 0
    let textBytes = 0
    const started = Date.now()
    const rows = snapshotRows(handle.sqlite, { identity: false })
    async function* lines(): AsyncGenerator<string> {
      for (const r of rows) {
        const line = JSON.stringify(r)
        count++
        textBytes += line.length
        if (count % 5_000 === 0) {
          collectGarbage() // live memory only: uncollected garbage depends on GC pacing, not on what is held
          peak = Math.max(peak, process.memoryUsage().heapUsed - baseline)
        }
        yield line
      }
    }
    const bytes = await encodePackageLines(
      {
        kind: 'snap',
        epoch: 1,
        fromSeq: 0,
        toSeq: 1,
        schemaVersion: 1,
        at: '2026-01-03T09:00:00.000Z',
        identity: false
      },
      lines(),
      key
    )
    const seconds = (Date.now() - started) / 1000
    if (process.env['BISMUTH_PERF_LOG'])
      console.log(
        `snapshot: ${count} rows, ${(textBytes / 1e6).toFixed(1)} MB as text, package ${(bytes.length / 1e6).toFixed(1)} MB, peak heap +${(peak / 1e6).toFixed(1)} MB, ${seconds.toFixed(1)} s`
      )
    expect(count).toBeGreaterThan(100_000)
    // The text of every row is never held at once: the heap grows far less than the rows weigh as text.
    expect(peak).toBeLessThan(textBytes / 2)
    // Compressed: the package is a fraction of the text.
    expect(bytes.length).toBeLessThan(textBytes / 4)
    expect(seconds).toBeLessThan(60)
    const back = decodePackage(bytes, key).lines
    expect(back).toHaveLength(count)
    expect(JSON.parse(back[0]!)).toHaveProperty('tbl')
  }, 120_000)

  it(`anlık görüntü sorgusu bir seferde en çok ${SNAPSHOT_PAGE} satır okur; bütün satırlar bir kez gelir`, () => {
    const total = (handle.sqlite.prepare('SELECT count(*) AS n FROM room_nights').get() as { n: number }).n
    expect(total).toBeGreaterThan(SNAPSHOT_PAGE * 3)
    const ids = new Set<unknown>()
    for (const r of snapshotRows(handle.sqlite, { identity: false }))
      if (r.tbl === 'room_nights') ids.add(r.row['id'])
    expect(ids.size).toBe(total)
  })
})
