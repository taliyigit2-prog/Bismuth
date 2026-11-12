// The month-end "baktım" ticks as a person's preference on the main computer (K-46 (6); karar denetimi #13): every
// session of the same account sees the same ticks, another account does not, and nothing goes to the audit log.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import { auditLog, roles, userPreferences, users } from '../../db/schema'
import { createServices } from '..'
import { monthEndTickKey } from './month-end-ticks'

const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const SEPTEMBER = { year: 2026, month: 9 }

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const services = createServices(handle, runtime, { clock: testClock('2026-10-05T09:00:00.000Z') })
  const roleId = handle.db.select().from(roles).where(eq(roles.code, 'owner')).get()!.id
  for (const [id, username] of [
    ['user-sahip', 'sahip'],
    ['user-mudur', 'mudur']
  ] as const)
    handle.db
      .insert(users)
      .values({
        id,
        username,
        displayName: username,
        roleId,
        passwordHash: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      })
      .run()
  return services
}

describe('ay sonu "baktım" işaretleri kişi tercihinde (K-46 (6))', () => {
  it('aynı kullanıcının iki oturumu (otel bilgisayarı ve Mac) aynı işareti görür; başka kullanıcı görmez', async () => {
    const { reports } = await setup()
    const atHotel = roleCtx('owner', 'user-sahip', 'device-otel')
    const onMac = roleCtx('owner', 'user-sahip', 'device-mac')
    const other = roleCtx('owner', 'user-mudur', 'device-otel')
    expect(reports.setMonthEndTicks(atHotel, { ...SEPTEMBER, ticks: ['top', 'results'] })).toEqual({
      ticks: ['results', 'top']
    })
    expect(reports.monthEndTicks(onMac, SEPTEMBER)).toEqual({ ticks: ['results', 'top'] })
    expect(reports.monthEndTicks(other, SEPTEMBER)).toEqual({ ticks: [] })
    // Another month is separate; taking a tick off on the Mac shows at the hotel.
    expect(reports.monthEndTicks(atHotel, { year: 2026, month: 8 })).toEqual({ ticks: [] })
    reports.setMonthEndTicks(onMac, { ...SEPTEMBER, ticks: ['top'] })
    expect(reports.monthEndTicks(atHotel, SEPTEMBER)).toEqual({ ticks: ['top'] })
    const row = handle.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.key, monthEndTickKey(2026, 9)))
      .all()
    expect(row.map((r) => [r.userId, r.valueJson])).toEqual([['user-sahip', '["top"]']])
  })

  it('eski cihaz işaretleri "merge" ile eklenir, var olanlar silinmez', async () => {
    const { reports } = await setup()
    const ctx = roleCtx('owner', 'user-sahip')
    reports.setMonthEndTicks(ctx, { ...SEPTEMBER, ticks: ['results'] })
    expect(reports.setMonthEndTicks(ctx, { ...SEPTEMBER, ticks: ['top'], merge: true })).toEqual({
      ticks: ['results', 'top']
    })
  })

  it('kişisel görünüm: denetim kaydına yazılmaz', async () => {
    const { reports } = await setup()
    const before = handle.db.select().from(auditLog).all().length
    reports.setMonthEndTicks(roleCtx('owner', 'user-sahip'), { ...SEPTEMBER, ticks: ['results'] })
    expect(handle.db.select().from(auditLog).all()).toHaveLength(before)
  })

  it('finans raporu yetkisi olmayan rol işaret okuyamaz ve yazamaz (PermissionDenied)', async () => {
    const { reports } = await setup()
    const reception = roleCtx('reception', 'user-sahip')
    expect(() => reports.monthEndTicks(reception, SEPTEMBER)).toThrow(/PERMISSION_DENIED/)
    expect(() => reports.setMonthEndTicks(reception, { ...SEPTEMBER, ticks: ['top'] })).toThrow(
      /PERMISSION_DENIED/
    )
  })

  it('hesabı olmayan bağlam (program, test) için hiçbir şey saklanmaz', async () => {
    const { reports } = await setup()
    expect(reports.setMonthEndTicks(roleCtx('owner'), { ...SEPTEMBER, ticks: ['top'] })).toEqual({
      ticks: ['top']
    })
    expect(handle.db.select().from(userPreferences).all()).toEqual([])
  })
})
