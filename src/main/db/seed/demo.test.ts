// The demo hotel generator (scripts/seed-demo.ts) on a short history: it must keep working as the services
// evolve, and the data it writes must add up (the ledger is derived from the same rows).
import { afterEach, describe, expect, it } from 'vitest'
import { localDate } from '@shared/date'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../client'
import { createServices, localOwnerCtx } from '../../services'
import { seedDemo } from './demo'

let handle: DatabaseHandle
afterEach(() => handle?.close())

describe('örnek otel verisi (seed-demo)', () => {
  it('19 oda / 38 yatak; rezervasyon, ödeme, gider, personel ve günlük işler servisler üzerinden yazılır', async () => {
    handle = await seededDatabase()
    const summary = await seedDemo(handle, {
      until: localDate('2026-10-03'),
      days: 45,
      aheadDays: 10,
      seed: 7
    })
    expect(summary).toMatchObject({ rooms: 19, beds: 38, employees: 4 })
    expect(summary.reservations).toBeGreaterThan(120)
    expect(summary.payments).toBeGreaterThan(120)
    expect(handle.sqlite.pragma('integrity_check', { simple: true })).toBe('ok')

    const svc = createServices(handle, {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: '',
      electron: null,
      chrome: null
    })
    const owner = localOwnerCtx()
    // September revenue in the ledger = the September payments in TRY (EUR ones counted at their frozen rate).
    const september = svc.ledger.monthSummary(owner, 2026, 9)
    const sums = handle.sqlite
      .prepare(
        `select coalesce(sum(case kind when 'refund' then -amount_base_minor else amount_base_minor end), 0) total
           from payments where voided_at is null and date >= '2026-09-01' and date < '2026-10-01'`
      )
      .get() as { total: number }
    expect(september.revenueBaseMinor).toBe(sums.total)
    expect(september.revenueBaseMinor).toBeGreaterThan(0)
    expect(september.expensesBaseMinor).toBeGreaterThan(0)
    // A locked August salary table and an open October one.
    const table = svc.staff.salaryTable(owner, 2026, 8)
    expect(table.rows.every((row) => row.locked)).toBe(true)
    expect(svc.staff.salaryTable(owner, 2026, 10).rows.every((row) => !row.locked)).toBe(true)
    expect(
      svc.laundry.listDeliveries(owner, { from: '2026-09-01', to: '2026-09-30' }).length
    ).toBeGreaterThan(20)
    expect(svc.tasks.listTasks(owner, { status: ['open'] }).length).toBeGreaterThan(0)
    expect(svc.users.listUsers(owner).map((u) => u.username)).toEqual(
      expect.arrayContaining(['sahip', 'resepsiyon', 'temizlik'])
    )
  }, 60_000)
})
