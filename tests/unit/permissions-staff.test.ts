// Staff permissions through the one router (G-23, K-38, S-09): what each system role may read and write on the
// Personel procedures, and the employee role seeing only its own card and hours — the same 403 for IPC and HTTP
// because the check is in the service.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import type { DatabaseHandle } from '../../src/main/db/client'
import { seededDatabase } from '../factories/db'
import { roleCtx } from '../factories/ctx'
import { tempDataDir } from '../factories/runtime'
import { addDays, localDateOf } from '@shared/date'

let handle: DatabaseHandle
let api: ReturnType<typeof createApiApp>
const runtime = {
  name: 'Bismuth',
  version: '0.1.0',
  packaged: false,
  dataDir: tempDataDir(),
  electron: null,
  chrome: null
}

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')
const housekeeping = roleCtx('housekeeping')
/** Two people with the Çalışan role, each linked to an employee card. */
const ayse = roleCtx('employee', 'u-ayse')
const bora = roleCtx('employee', 'u-bora')

async function call<T = unknown>(
  name: string,
  body: unknown,
  ctx: Ctx
): Promise<{ status: number; body: T }> {
  const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
  return { status: res.status, body: JSON.parse(res.body) as T }
}

let ayseId = ''
let boraId = ''

beforeAll(async () => {
  handle = await seededDatabase()
  api = createApiApp({ handlers: createHandlers(createServices(handle, runtime)) })
  const make = async (firstName: string, userId: string) => {
    const res = await call<{ id: string }>(
      'staff.createEmployee',
      {
        firstName,
        lastName: 'Deneme',
        position: 'Kat hizmetleri',
        startDate: '2026-01-01',
        userId,
        salary: { monthlyMinor: 3_000_000, currency: 'TRY' }
      },
      owner
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    return res.body.id
  }
  ayseId = await make('Ayşe', 'u-ayse')
  boraId = await make('Bora', 'u-bora')
})
afterAll(() => handle.close())

describe('çalışan rolü yalnız kendini görür (K-38, S-39)', () => {
  it('kendi kartını okur; başkasının kartını, listeyi, izinleri ve maaşları okuyamaz', async () => {
    const mine = await call<{ id: string; fullName: string } | null>('staff.myEmployee', {}, ayse)
    expect(mine.body).toMatchObject({ id: ayseId, fullName: 'Ayşe Deneme' })
    expect(mine.body).not.toHaveProperty('currentSalary')
    expect((await call('staff.getEmployee', { id: ayseId }, ayse)).status).toBe(200)
    expect((await call('staff.getEmployee', { id: boraId }, ayse)).status).toBe(403)
    expect((await call('staff.employees', {}, ayse)).status).toBe(403)
    expect((await call('staff.listEmployees', {}, ayse)).status).toBe(403)
    expect((await call('staff.panel', { year: 2026, month: 9 }, ayse)).status).toBe(403)
    expect((await call('staff.leaveBetween', { from: '2026-09-01', to: '2026-09-30' }, ayse)).status).toBe(
      403
    )
    expect((await call('staff.salaryTable', { year: 2026, month: 9 }, ayse)).status).toBe(403)
    expect(
      (await call('staff.salaryPeriod', { employeeId: ayseId, year: 2026, month: 9 }, ayse)).status
    ).toBe(403)
  })

  it('kendi geliş/çıkışını girer ve okur; başkasının saatlerini ne girer ne okur', async () => {
    // QA2a: one's own hours go on today or a recent day (the real clock here), never months back.
    const day = localDateOf(new Date())
    const from = `${day.slice(0, 8)}01`
    const own = await call<{ employeeId: string; minutesWorked: number }>(
      'staff.recordWork',
      { date: day, startTime: '22:00', endTime: '07:00' },
      ayse
    )
    expect(own.status).toBe(200)
    expect(own.body).toMatchObject({ employeeId: ayseId, minutesWorked: 540 })
    const list = await call<{ employeeId: string }[]>('staff.listWork', { from, to: day }, ayse)
    expect(list.body.map((w) => w.employeeId)).toEqual([ayseId])
    // Bora's hours: neither read nor written by Ayşe.
    await call('staff.recordWork', { date: day, startTime: '09:00', endTime: '17:00' }, bora)
    expect((await call('staff.listWork', { employeeId: boraId, from, to: day }, ayse)).status).toBe(403)
    expect(
      (
        await call(
          'staff.recordWork',
          { employeeId: boraId, date: '2026-09-03', startTime: '09:00', endTime: '17:00' },
          ayse
        )
      ).status
    ).toBe(403)
    // Overtime is Müdür/Sahip's (K-38), also on one's own day.
    expect((await call('staff.recordWork', { date: day, overtimeMinutes: 60 }, ayse)).status).toBe(403)
    expect(
      (await call('staff.recordWork', { employeeId: ayseId, date: day, overtimeMinutes: 60 }, manager)).status
    ).toBe(200)
  })
})

describe('rollere göre maaş ve personel yetkileri (S-09 varsayılanları)', () => {
  const salaryTable = { year: 2026, month: 9 }

  it('maaş tablosunu Sahip ve Muhasebe görür; Müdür, Resepsiyon ve Temizlik göremez', async () => {
    for (const [ctx, status] of [
      [owner, 200],
      [accountant, 200],
      [manager, 403],
      [reception, 403],
      [housekeeping, 403]
    ] as const)
      expect((await call('staff.salaryTable', salaryTable, ctx)).status).toBe(status)
  })

  it('Resepsiyon personel ekranının hiçbir verisini okuyamaz; Müdür kartları maaşsız görür', async () => {
    expect((await call('staff.employees', {}, reception)).status).toBe(403)
    expect((await call('staff.panel', salaryTable, reception)).status).toBe(403)
    const seen = await call<{ currentSalary?: unknown }[]>('staff.employees', {}, manager)
    expect(seen.status).toBe(200)
    expect(seen.body.every((e) => !('currentSalary' in e))).toBe(true)
    const panel = await call<{ advancesMinor: number | null }[]>('staff.panel', salaryTable, manager)
    expect(panel.body.every((r) => r.advancesMinor === null)).toBe(true)
    const full = await call<{ currentSalary?: { monthlyMinor: number } }[]>('staff.employees', {}, accountant)
    expect(full.body[0]?.currentSalary?.monthlyMinor).toBe(3_000_000)
  })

  it('avansı ve maaş ödemesini Muhasebe girer; Müdür ve Resepsiyon giremez', async () => {
    const advance = { employeeId: ayseId, date: '2026-09-05', kind: 'advance', amountMinor: 100_000 }
    expect((await call('staff.addTransaction', advance, manager)).status).toBe(403)
    expect((await call('staff.addTransaction', advance, reception)).status).toBe(403)
    const ok = await call<{ id: string; expenseId: string }>('staff.addTransaction', advance, accountant)
    expect(ok.status).toBe(200)
    expect(ok.body.expenseId).toBeTruthy()
    expect((await call('staff.voidTransaction', { id: ok.body.id, reason: 'deneme' }, manager)).status).toBe(
      403
    )
    expect(
      (await call('staff.voidTransaction', { id: ok.body.id, reason: 'deneme' }, accountant)).status
    ).toBe(200)
  })

  it('oranları Sahip ve Müdür değiştirir; Muhasebe değiştiremez; ayı Müdür kilitleyemez', async () => {
    const patch = { values: { overtimeMode: 'multiplier' } }
    expect((await call('staff.setPolicy', patch, accountant)).status).toBe(403)
    expect((await call('staff.setPolicy', patch, manager)).status).toBe(200)
    expect((await call('staff.setPolicy', { values: { overtimeMode: 'none' } }, owner)).status).toBe(200)
    expect((await call('staff.lockMonth', { year: 2026, month: 8 }, manager)).status).toBe(403)
    expect((await call('staff.unlockMonth', { year: 2026, month: 8, reason: 'x' }, manager)).status).toBe(403)
  })

  it('izni Müdür ve Muhasebe girer; Resepsiyon ve çalışan giremez', async () => {
    const leave = { employeeId: boraId, from: '2026-09-14', days: 2, kind: 'annual' }
    expect((await call('staff.addLeaveDays', leave, reception)).status).toBe(403)
    expect((await call('staff.addLeaveDays', leave, bora)).status).toBe(403)
    const ok = await call<{ id: string }[]>('staff.addLeaveDays', leave, manager)
    expect(ok.status).toBe(200)
    expect((await call('staff.voidLeave', { id: ok.body[0]!.id, reason: 'x' }, bora)).status).toBe(403)
  })

  it('yeniden işe almayı kartları düzenleyen Sahip ve Muhasebe yapar; Müdür, Resepsiyon ve çalışan yapamaz (B6)', async () => {
    const rehire = { employeeId: boraId, startDate: '2026-11-01' }
    for (const who of [manager, reception, bora, housekeeping])
      expect((await call('staff.rehire', rehire, who)).status).toBe(403)
    // Still employed: allowed to ask, refused for the data.
    expect((await call('staff.rehire', rehire, accountant)).status).toBe(409)
  })
})

describe('kendi saati: yalnız bugün ve son günler (QA2a, K-46)', () => {
  it('çalışan bugünü ve 7 gün öncesini yazar; 8 gün öncesi ve yarın 400, müdür her günü yazar', async () => {
    const day = localDateOf(new Date())
    const own = (date: string) =>
      call<{ messageKey?: string }>('staff.recordWork', { date, startTime: '09:00', endTime: '17:00' }, bora)
    expect((await own(day)).status).toBe(200)
    expect((await own(addDays(day, -7))).status).toBe(200)
    const old = await own(addDays(day, -8))
    expect(old.status).toBe(400)
    expect(JSON.stringify(old.body)).toContain('errors.ownHoursDay')
    expect((await own(addDays(day, 1))).status).toBe(400)
    expect(
      (
        await call(
          'staff.recordWork',
          { employeeId: boraId, date: addDays(day, -40), startTime: '09:00', endTime: '17:00' },
          manager
        )
      ).status
    ).toBe(200)
  })

  it('ayar (staff.ownHoursBackDays) Sahip ve Müdürce değişir; 0 = yalnız bugün; çalışan değiştiremez', async () => {
    const day = localDateOf(new Date())
    expect((await call('settings.set', { 'staff.ownHoursBackDays': 30 }, bora)).status).toBe(403)
    expect((await call('settings.set', { 'staff.ownHoursBackDays': 0 }, manager)).status).toBe(200)
    const yesterday = await call(
      'staff.recordWork',
      { date: addDays(day, -1), startTime: '09:00', endTime: '17:00' },
      ayse
    )
    expect(yesterday.status).toBe(400)
    expect((await call('settings.set', { 'staff.ownHoursBackDays': 400 }, owner)).status).toBe(400)
    expect((await call('settings.set', { 'staff.ownHoursBackDays': 7 }, owner)).status).toBe(200)
  })
})
