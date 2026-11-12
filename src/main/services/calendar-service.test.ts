import { afterEach, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { ctxFromPermissions } from './context'
import { roleCtx, depsOf, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, calendarDays, calendarGeneration } from '../db/schema'
import { createCalendarService } from './calendar-service'
import { HOLIDAY_SOURCE_VERSION } from './calendar/holidays'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const nobody = ctxFromPermissions('user-nobody', 'test-device', 'ipc', {})
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock()
  const svc = createCalendarService(depsOf(handle, clock))
  return { svc, clock }
}

const snapshot = (year: number) =>
  handle.db
    .select()
    .from(calendarDays)
    .where(eq(calendarDays.generatedYear, year))
    .all()
    .map((r) => ({ id: r.id, date: r.date, kind: r.kind, source: r.source, cancelled: r.cancelledAt }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))

describe('bayram üretimi (K-04, §6.7)', () => {
  it('2026 iki kez üretilince aynı satırlar kalır; ikinci çağrı hiçbir şey yazmaz', async () => {
    const { svc } = await setup()
    const first = svc.ensureYearGenerated(reception, 2026)
    expect(first.generated).toBe(true)
    expect(first.inserted).toBeGreaterThan(10)
    const rows = snapshot(2026)
    expect(svc.ensureYearGenerated(reception, 2026)).toMatchObject({ generated: false, inserted: 0 })
    expect(snapshot(2026)).toEqual(rows)
    // A forced regeneration keeps the same rows (same ids) as well.
    expect(svc.regenerateYear(owner, 2026)).toMatchObject({ inserted: 0, updated: 0, cancelled: 0 })
    expect(snapshot(2026)).toEqual(rows)
    const gen = handle.db.select().from(calendarGeneration).where(eq(calendarGeneration.year, 2026)).get()
    expect(gen?.sourceVersion).toBe(HOLIDAY_SOURCE_VERSION)
    const republic = handle.db.select().from(calendarDays).where(eq(calendarDays.date, '2026-10-29')).all()
    expect(republic).toHaveLength(1)
    expect(republic[0]).toMatchObject({ kind: 'holiday', source: 'generated', estimated: false })
    expect(republic[0]?.titleI18n?.tr).toBe('Cumhuriyet Bayramı')
  })

  it('takvim görünümü dokunduğu yılları kendiliğinden üretir (2036 dahil)', async () => {
    const { svc } = await setup()
    const entries = svc.listRange(reception, '2036-12-25', '2037-01-05')
    expect(entries.map((e) => e.occurrenceDate)).toContain('2037-01-01')
    const years = handle.db
      .select()
      .from(calendarGeneration)
      .all()
      .map((g) => g.year)
    expect(years.sort()).toEqual([2036, 2037])
  })

  it('sahibin düzenlediği üretilmiş satır yeniden üretimde korunur, taşınan gün eski tarihine geri gelmez', async () => {
    const { svc } = await setup()
    svc.ensureYearGenerated(owner, 2026)
    const [republic] = svc.listRange(owner, '2026-10-29', '2026-10-30')
    const edited = svc.editDay(owner, republic!.id, {
      title: 'Cumhuriyet Bayramı (otel kapalı)',
      color: '#ff0000'
    })
    expect(edited).toMatchObject({
      source: 'user',
      titleI18n: null,
      title: 'Cumhuriyet Bayramı (otel kapalı)'
    })

    // Diyanet differs by one day: the owner moves the first day of Kurban Bayramı.
    const kurban = svc
      .listRange(owner, '2026-05-01', '2026-06-30')
      .find((e) => e.titleI18n?.tr === 'Kurban Bayramı 1. Gün')!
    const moved = svc.editDay(owner, kurban.id, { date: '2026-05-28' })
    expect(moved).toMatchObject({ date: '2026-05-28', source: 'user', groupKey: kurban.groupKey })

    const result = svc.regenerateYear(owner, 2026)
    expect(result.inserted).toBe(0)
    const oct29 = svc.listRange(owner, '2026-10-29', '2026-10-30')
    expect(oct29).toHaveLength(1)
    expect(oct29[0]).toMatchObject({
      id: republic!.id,
      title: 'Cumhuriyet Bayramı (otel kapalı)',
      color: '#ff0000'
    })
    const liveOnOldDate = handle.db
      .select()
      .from(calendarDays)
      .where(
        and(
          eq(calendarDays.groupKey, kurban.groupKey!),
          eq(calendarDays.date, kurban.date),
          isNull(calendarDays.cancelledAt)
        )
      )
      .all()
    expect(liveOnOldDate).toHaveLength(0)
    expect(svc.listRange(owner, '2026-05-28', '2026-05-29').map((e) => e.id)).toContain(moved.id)
  })

  it('iptal edilen bayram günü yeniden üretimde geri gelmez; grup iptali tüm günleri kapatır', async () => {
    const { svc } = await setup()
    svc.ensureYearGenerated(owner, 2026)
    const [eve] = svc.listRange(owner, '2026-10-28', '2026-10-29')
    expect(eve?.kind).toBe('half_holiday')
    svc.cancelDay(owner, eve!.id, 'otel için önemsiz')
    expect(() => svc.cancelDay(owner, eve!.id)).toThrow(/alreadyCancelled/)
    svc.regenerateYear(owner, 2026)
    expect(svc.listRange(owner, '2026-10-28', '2026-10-29')).toHaveLength(0)

    const ramazan = svc
      .listRange(owner, '2026-01-01', '2027-01-01')
      .find((e) => e.groupKey?.startsWith('ramazan'))!
    expect(svc.cancelGroup(owner, ramazan.groupKey!, 'yanlış')).toBe(4)
    expect(
      svc.listRange(owner, '2026-01-01', '2027-01-01').some((e) => e.groupKey === ramazan.groupKey)
    ).toBe(false)
    expect(
      handle.db.select().from(calendarDays).where(eq(calendarDays.groupKey, ramazan.groupKey!)).all()
    ).toHaveLength(4)
    expect(() => svc.cancelGroup(owner, ramazan.groupKey!)).toThrow(/NOT_FOUND/)
  })
})

describe('takvim notları (G-40, faz-09 madde 6)', () => {
  it('"her cumartesi" toplu notu bir yıla 52 satırı tek çağrıda ve bir saniyeden kısa sürede ekler', async () => {
    const { svc } = await setup()
    const started = performance.now()
    const rows = svc.addNote(reception, {
      kind: 'special',
      title: 'Hafta sonu fiyatı',
      target: { mode: 'weekdays', from: '2026-01-01', to: '2026-12-31', weekdays: [6] }
    })
    expect(performance.now() - started).toBeLessThan(1000)
    expect(rows).toHaveLength(52)
    expect(new Set(rows.map((r) => r.groupKey)).size).toBe(1)
    expect(rows[0]).toMatchObject({ date: '2026-01-03', source: 'user', kind: 'special' })
    const audits = handle.db.select().from(auditLog).where(eq(auditLog.entity, 'calendar_day')).all()
    expect(audits).toHaveLength(1)
    expect(svc.cancelGroup(reception, rows[0]!.groupKey!)).toBe(52)
  })

  it('tek gün, aralık ve yapıştırılan liste; yıllık tekrar sonraki yıllarda görünür', async () => {
    const { svc } = await setup()
    const [single] = svc.addNote(reception, {
      title: 'Grup geliyor',
      target: { mode: 'single', date: '2026-11-03' }
    })
    expect(single?.groupKey).toBeNull()
    const range = svc.addNote(reception, {
      title: 'Fuar',
      target: { mode: 'range', from: '2026-11-10', to: '2026-11-14' }
    })
    expect(range.map((r) => r.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14'
    ])
    const list = svc.addNote(reception, {
      title: 'Konser',
      target: { mode: 'list', dates: ['2026-12-05', '2026-12-01', '2026-12-05'] }
    })
    expect(list.map((r) => r.date)).toEqual(['2026-12-01', '2026-12-05'])
    svc.addNote(reception, {
      kind: 'event',
      title: 'Otelin açılış yıl dönümü',
      recurringYearly: true,
      target: { mode: 'single', date: '2024-02-29' }
    })
    const feb2027 = svc.listRange(reception, '2027-02-01', '2027-03-01').filter((e) => e.kind === 'event')
    expect(feb2027).toEqual([
      expect.objectContaining({ occurrenceDate: '2027-02-28', repeated: true, date: '2024-02-29' })
    ])
    const nov = svc.listRange(reception, '2026-11-01', '2026-12-01').filter((e) => e.source === 'user')
    expect(nov.map((e) => e.occurrenceDate)).toEqual([
      '2026-11-03',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14'
    ])
  })

  it('geçersiz hedefler doğrulamada durur; boş hafta günü aralığı ve çok uzun toplu not reddedilir', async () => {
    const { svc } = await setup()
    expect(() =>
      svc.addNote(owner, { title: 'x', target: { mode: 'range', from: '2026-05-02', to: '2026-05-01' } })
    ).toThrow(/VALIDATION/)
    expect(() => svc.addNote(owner, { title: 'x', target: { mode: 'single', date: '2026-02-30' } })).toThrow(
      /VALIDATION/
    )
    expect(() =>
      svc.addNote(owner, {
        title: 'x',
        target: { mode: 'weekdays', from: '2026-05-04', to: '2026-05-05', weekdays: [6] }
      })
    ).toThrow(/calendarNoDates/)
    expect(() =>
      svc.addNote(owner, { title: 'x', target: { mode: 'range', from: '2026-01-01', to: '2030-01-01' } })
    ).toThrow(/calendarTooManyDates/)
    expect(() => svc.listRange(owner, '2026-01-01', '2046-01-01')).toThrow(/VALIDATION/)
  })

  it('kullanıcı notu düzenlenir; vurgulu günler ayardan gelir', async () => {
    const { svc } = await setup()
    const [row] = svc.addNote(reception, { title: 'Not', target: { mode: 'single', date: '2026-11-03' } })
    const edited = svc.editDay(reception, row!.id, { date: '2026-11-04', note: 'tarih değişti' })
    expect(edited).toMatchObject({ id: row!.id, date: '2026-11-04', note: 'tarih değişti', source: 'user' })
    expect(svc.highlightWeekdays(roleCtx('housekeeping'))).toEqual([6, 0])
    const live = handle.db
      .select()
      .from(calendarDays)
      .where(and(eq(calendarDays.source, 'user'), isNull(calendarDays.cancelledAt)))
      .all()
    expect(live).toHaveLength(1)
  })
})

describe('takvim yetkileri', () => {
  it('yetkisiz rol takvim notu yazamaz, gün düzenleyemez, iptal edemez, yıl üretemez → PERMISSION_DENIED', async () => {
    const { svc } = await setup()
    const accountant = roleCtx('accountant') // calendar view, calendar.notes none
    const target = { mode: 'single' as const, date: '2026-11-03' }
    expect(() => svc.addNote(accountant, { title: 'x', target })).toThrow(/PERMISSION_DENIED/)
    const [row] = svc.addNote(owner, { title: 'x', target })
    expect(() => svc.editDay(accountant, row!.id, { title: 'y' })).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.cancelDay(accountant, row!.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.cancelGroup(accountant, 'g')).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.regenerateYear(accountant, 2026)).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.ensureYearGenerated(nobody, 2026)).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.listRange(nobody, '2026-01-01', '2026-02-01')).toThrow(/PERMISSION_DENIED/)
    // Viewing is enough to generate the derived holiday rows.
    expect(svc.listRange(accountant, '2026-01-01', '2026-01-02').map((e) => e.titleI18n?.tr)).toEqual([
      'Yılbaşı'
    ])
  })
})
