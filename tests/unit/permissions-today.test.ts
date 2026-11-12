// Faz 9 (P9c) through the one router, as a window calls it: the Today summary hides each part a role may not see
// (null, not empty); "Otelde kalanlar" reads and KBS marks follow the `in_house` level; calendar notes follow
// `calendar.notes` (reading also with the calendar or Today screen); the tape chart's `calendar.addNote` and the
// notes screen's `calendarNotes.add` write through the same calendar service. The tourism reminder shows on the
// 1st–10th until last month is marked as reported, and not at all when the hotel switched it off.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows } from '../../src/shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import type { DatabaseHandle } from '../../src/main/db/client'
import { calendarDays, roomTypes, salesChannels, taskTemplates } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import { ctxFromPermissions } from '../../src/main/services/context'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { kbsWorkbookBuffer, septemberRows } from '../factories/kbs'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const owner = roleCtx('owner')

async function setup(at = '2026-10-01T10:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(at)
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: '', electron: null, chrome: null },
    { clock }
  )
  const api = createApiApp({ handlers: createHandlers(services) })
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = services.rooms.createRoom(owner, {
    number: '501',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const stay = services.reservations.create(owner, {
    guest: { firstName: 'Ali', lastName: 'Misafir' },
    channelId,
    stays: [{ roomId: room.id, checkIn: '2026-09-30', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 }]
  }).stays[0]!
  services.reservations.checkIn(owner, stay.id)
  services.calendar.ensureYearGenerated(owner, 2026)
  const call = async (ctx: Ctx, name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
    return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> }
  }
  return { services, call, room, stay, clock }
}

describe('Bugün özeti (G-92): rol bazlı parçalar', () => {
  it.each(SYSTEM_ROLE_CODES)(
    '%s: Bugün açılır; her parça yalnız yetkisi varsa dolu, yoksa null',
    async (role) => {
      const { call } = await setup()
      const perms = defaultPermissions(role)
      const can = (key: keyof typeof perms) => levelAllows(perms[key], 'view')
      const res = await call(roleCtx(role), 'today.summary')
      expect(res.status).toBe(200)
      const s = res.body
      expect(s['arrivals'] === null).toBe(!can('calendar') && !can('in_house'))
      expect(s['inHouse'] === null).toBe(!can('in_house'))
      expect(s['kbsMissing'] === null).toBe(!can('in_house'))
      expect(s['dirtyRooms'] === null).toBe(!can('rooms.status'))
      expect(s['tasks'] === null).toBe(!can('tasks'))
      expect(s['handovers'] === null).toBe(!can('shift_notes'))
      expect(s['drawer'] === null).toBe(!can('cash'))
      expect(Array.isArray(s['specialDays'])).toBe(true)
    }
  )

  it('Bugün yetkisi olmayan rol özeti okuyamaz (403)', async () => {
    const { call } = await setup()
    const res = await call(ctxFromPermissions('u-x', 'd', 'ipc', { in_house: 'edit' }), 'today.summary')
    expect(res.status).toBe(403)
  })

  it('resepsiyon için otelde kalan ve KBS eksiği görünür; bugünün bayramı (29 Ekim) özel günlerde', async () => {
    const { call } = await setup('2026-10-29T09:00:00.000Z')
    const s = (await call(roleCtx('reception'), 'today.summary')).body
    expect(s['inHouse']).toEqual({ rooms: 1, people: 1 })
    expect(s['kbsMissing']).toEqual([
      expect.objectContaining({ roomNumber: '501', fullName: 'Ali Misafir', kind: 'checkin' })
    ])
    expect((s['specialDays'] as { kind: string }[]).map((d) => d.kind)).toEqual(['holiday'])
  })
})

describe('turizm bildirimi hatırlatıcısı (G-93)', () => {
  it("ayın 1'inde sahipte çıkar; turizm yetkisi olmayan resepsiyonda çıkmaz", async () => {
    const { call } = await setup('2026-10-01T09:00:00.000Z')
    expect((await call(owner, 'today.summary')).body['reminders']).toEqual([
      { kind: 'tourism', period: '2026-09', dueDate: '2026-10-10', daysLeft: 9 }
    ])
    expect((await call(roleCtx('reception'), 'today.summary')).body['reminders']).toEqual([])
  })

  it('eylül bildirildi işaretlenince kalkar; hatırlatıcı kapatılınca da çıkmaz', async () => {
    const { services, call } = await setup('2026-10-02T09:00:00.000Z')
    const file = await kbsWorkbookBuffer(septemberRows())
    const imported = await services.tourism.importKbs(owner, {
      fileName: 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx',
      bytes: new Uint8Array(file)
    })
    expect((await call(owner, 'today.summary')).body['reminders']).toHaveLength(1)
    services.tourism.markReported(owner, imported.import.id, true)
    expect((await call(owner, 'today.summary')).body['reminders']).toEqual([])
    services.tourism.markReported(owner, imported.import.id, false)
    handle.db
      .update(taskTemplates)
      .set({ active: false })
      .where(eq(taskTemplates.code, 'legal_tourism_stats'))
      .run()
    expect((await call(owner, 'today.summary')).body['reminders']).toEqual([])
  })
})

describe('otelde kalanlar yetkisi (G-53, G-54)', () => {
  it.each(SYSTEM_ROLE_CODES)(
    '%s: liste, kişi ekleme ve KBS işareti "Otelde kalanlar" düzeyine uyar',
    async (role) => {
      const { call, stay, services } = await setup()
      const level = defaultPermissions(role).in_house
      const ctx = roleCtx(role)
      expect((await call(ctx, 'inHouse.list', {})).status).toBe(levelAllows(level, 'view') ? 200 : 403)
      const add = await call(ctx, 'inHouse.addPerson', {
        stayId: stay.id,
        fullName: 'Ayşe Misafir',
        descriptorNote: 'kızıl saçlı',
        kbsReported: true
      })
      expect(add.status).toBe(levelAllows(level, 'edit') ? 200 : 403)
      const primary = services.occupants.list(owner, stay.id)[0]!
      const mark = await call(ctx, 'inHouse.markKbs', { occupantId: primary.id, mark: 'reported' })
      expect(mark.status).toBe(levelAllows(level, 'edit') ? 200 : 403)
    }
  )

  it('kişi KBS işaretiyle eklenir; "kızıl" araması onu bulur; yanlış işaret geri alınır', async () => {
    const { call, stay } = await setup()
    const reception = roleCtx('reception')
    await call(reception, 'inHouse.addPerson', {
      stayId: stay.id,
      fullName: 'Ayşe Misafir',
      descriptorNote: 'Kızıl saçlı',
      kbsReported: true
    })
    const found = (await call(reception, 'inHouse.list', { q: 'kızıl' })).body as {
      rooms: { occupants: { id: string; fullName: string; kbsReportedAt: string | null }[] }[]
    }
    expect(found.rooms).toHaveLength(1)
    const ayse = found.rooms[0]!.occupants.find((o) => o.fullName === 'Ayşe Misafir')!
    expect(ayse.kbsReportedAt).toBe('2026-10-01T10:00:00.000Z')
    expect(
      (await call(reception, 'inHouse.markKbs', { occupantId: ayse.id, mark: 'clearReported' })).status
    ).toBe(200)
    const after = (await call(reception, 'inHouse.list', {})).body as typeof found
    expect(after.rooms[0]!.occupants.find((o) => o.id === ayse.id)!.kbsReportedAt).toBeNull()
  })
})

describe('takvim notları yetkisi (G-40)', () => {
  it.each(SYSTEM_ROLE_CODES)('%s: okuma takvim/Bugün ile, yazma "Takvim notları" düzeyiyle', async (role) => {
    const { call } = await setup()
    const perms = defaultPermissions(role)
    const ctx = roleCtx(role)
    const reads =
      levelAllows(perms.calendar, 'view') ||
      levelAllows(perms['calendar.notes'], 'view') ||
      levelAllows(perms.today, 'view')
    const writes = levelAllows(perms['calendar.notes'], 'edit')
    const list = await call(ctx, 'calendarNotes.list', { from: '2026-10-01', to: '2026-11-01' })
    expect(list.status).toBe(reads ? 200 : 403)
    const add = await call(ctx, 'calendarNotes.add', {
      title: 'Fuar',
      target: { mode: 'single', date: '2026-10-15' }
    })
    expect(add.status).toBe(writes ? 200 : 403)
    const holiday = handle.db.select().from(calendarDays).where(eq(calendarDays.date, '2026-10-29')).get()!
    const edit = await call(ctx, 'calendarNotes.edit', { id: holiday.id, patch: { note: 'Kapalı' } })
    expect(edit.status).toBe(writes ? 200 : 403)
    const cancel = await call(ctx, 'calendarNotes.cancel', { id: holiday.id })
    expect(cancel.status).toBe(writes ? 200 : 403)
  })

  it('takvimin toplu notu ve notlar ekranının notu aynı servisten geçer; ikisi de listede görünür', async () => {
    const { call } = await setup()
    const reception = roleCtx('reception')
    const viaGrid = await call(reception, 'calendar.addNote', {
      title: 'Cumartesi kahvaltı',
      target: { mode: 'weekdays', from: '2026-10-01', to: '2026-10-31', weekdays: [6] }
    })
    const viaNotes = await call(reception, 'calendarNotes.add', {
      title: 'Cumartesi kahvaltı',
      target: { mode: 'weekdays', from: '2026-11-01', to: '2026-11-30', weekdays: [6] }
    })
    expect([viaGrid.body['count'], viaNotes.body['count']]).toEqual([5, 4])
    const list = (await call(reception, 'calendarNotes.list', { from: '2026-10-01', to: '2026-12-01' }))
      .body as {
      days: { title: string | null; occurrenceDate: string; source: string; groupKey: string | null }[]
    }
    const notes = list.days.filter((d) => d.title === 'Cumartesi kahvaltı')
    expect(notes).toHaveLength(9)
    expect(new Set(notes.map((n) => n.source))).toEqual(new Set(['user']))
    expect(new Set(notes.map((n) => n.groupKey)).size).toBe(2)
    const cancel = await call(reception, 'calendarNotes.cancelGroup', { groupKey: notes[0]!.groupKey })
    expect(cancel.body['count']).toBe(5)
    // The housekeeping role writes neither way.
    const hk = roleCtx('housekeeping')
    const refused = await call(hk, 'calendar.addNote', {
      title: 'x',
      target: { mode: 'single', date: '2026-10-02' }
    })
    expect(refused.status).toBe(403)
  })

  it('bayram düzenlenince kullanıcı satırı olur ve yeniden üretimde korunur', async () => {
    const { call, services } = await setup()
    const list = (await call(owner, 'calendarNotes.list', { from: '2036-01-01', to: '2037-01-01' })).body as {
      days: { id: string; date: string; kind: string; source: string; generatedYear: number | null }[]
    }
    const republic = list.days.find((d) => d.date === '2036-10-29')!
    expect([republic.kind, republic.source, republic.generatedYear]).toEqual(['holiday', 'generated', 2036])
    const edited = await call(owner, 'calendarNotes.edit', {
      id: republic.id,
      patch: { note: 'Resepsiyon tam kadro' }
    })
    expect(edited.body).toMatchObject({ source: 'user', note: 'Resepsiyon tam kadro', generatedYear: 2036 })
    services.calendar.regenerateYear(owner, 2036)
    const again = (await call(owner, 'calendarNotes.list', { from: '2036-10-29', to: '2036-10-30' }))
      .body as {
      days: { id: string; note: string | null; source: string }[]
    }
    expect(again.days).toEqual([
      expect.objectContaining({ id: republic.id, note: 'Resepsiyon tam kadro', source: 'user' })
    ])
  })
})
