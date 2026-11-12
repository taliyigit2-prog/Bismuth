import { afterEach, describe, expect, it } from 'vitest'
import { and, eq, like } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import { GOOGLE_ICS, nager2027 } from '../../../../tests/factories/fake-external'
import type { DatabaseHandle } from '../../db/client'
import { calendarDays } from '../../db/schema'
import { feastsFromEvents, parseIcs } from '../../network/holidays/feeds'
import { createCalendarService } from '../calendar-service'
import { applyHolidayCheck } from './holiday-check'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const deps = depsOf(handle, testClock('2026-10-04T09:00:00.000Z'))
  const calendar = createCalendarService(deps)
  return { deps, calendar }
}

const feastRows = (slug: string) =>
  handle.db
    .select()
    .from(calendarDays)
    .where(and(like(calendarDays.groupKey, `${slug}:%`), eq(calendarDays.generatedYear, 2027)))
    .all()
    .sort((a, b) => (a.date < b.date ? -1 : 1))

describe('bayram çevrimiçi doğrulama (K-04)', () => {
  it('Google takviminden bayramların ilk günleri okunur; arife ve köprü günü bayram sayılmaz; "kesin değil" işaretlenir', () => {
    const feasts = feastsFromEvents(parseIcs(GOOGLE_ICS))
    expect(feasts).toEqual([
      { feast: 'ramazan', start: '2026-03-20', tentative: false },
      { feast: 'kurban', start: '2026-05-27', tentative: false },
      { feast: 'ramazan', start: '2027-03-10', tentative: true },
      { feast: 'kurban', start: '2027-05-16', tentative: true }
    ])
    // Nager.Date has no arife: the first day of each run.
    const nager = feastsFromEvents(
      nager2027.map((h) => ({ start: h.date, summary: `${h.localName} · ${h.name}`, description: '' }))
    )
    expect(nager.map((f) => `${f.feast} ${f.start}`)).toEqual(['ramazan 2027-03-10', 'kurban 2027-05-16'])
    expect(() => parseIcs('<html></html>')).toThrow(/not a calendar/)
  })

  it('farklı tarih dönünce yalnız üretilmiş satırlar kayar ve "doğrulandı" olur; kullanıcı satırı korunur', async () => {
    const { deps, calendar } = await setup()
    calendar.ensureYearGenerated(owner, 2027)
    const ramazanBefore = feastRows('ramazan-bayrami')
    expect(ramazanBefore.map((r) => r.date)).toEqual(['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11'])

    // A person moved Kurban Bayramı's first day by hand: that group is theirs.
    const kurban = feastRows('kurban-bayrami')
    const firstDay = kurban.find((r) => r.kind === 'holiday')!
    calendar.editDay(owner, firstDay.id, { title: 'Kurban Bayramı (bizim)' })

    const result = applyHolidayCheck(deps, owner, 2027, feastsFromEvents(parseIcs(GOOGLE_ICS)), 'google')
    expect(result.source).toBe('google')
    const ramazan = result.diffs.find((d) => d.groupKey.startsWith('ramazan'))!
    expect(ramazan).toMatchObject({ outcome: 'moved', tentative: true })
    expect(ramazan.before).toEqual(['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11'])
    expect(ramazan.after).toEqual(['2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'])
    const after = feastRows('ramazan-bayrami')
    expect(after.map((r) => [r.date, r.kind, r.source, r.estimated])).toEqual([
      ['2027-03-09', 'half_holiday', 'verified', true],
      ['2027-03-10', 'holiday', 'verified', true],
      ['2027-03-11', 'holiday', 'verified', true],
      ['2027-03-12', 'holiday', 'verified', true]
    ])
    // Same ids: the rows moved, nothing was deleted or duplicated.
    expect(after.map((r) => r.id).sort()).toEqual(ramazanBefore.map((r) => r.id).sort())

    const kurbanDiff = result.diffs.find((d) => d.groupKey.startsWith('kurban'))!
    expect(kurbanDiff.outcome).toBe('confirmed')
    expect(feastRows('kurban-bayrami').find((r) => r.id === firstDay.id)?.source).toBe('user')

    // Running the rule engine again keeps the announced days and does not bring the old ones back.
    calendar.regenerateYear(owner, 2027)
    expect(
      feastRows('ramazan-bayrami')
        .filter((r) => !r.cancelledAt)
        .map((r) => r.date)
    ).toEqual(['2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'])
  })

  it('kullanıcının değiştirdiği grupta fark yalnız gösterilir; denetim yetkisi takvim notları düzenleme ister', async () => {
    const { deps, calendar } = await setup()
    calendar.ensureYearGenerated(owner, 2027)
    const eve = feastRows('ramazan-bayrami').find((r) => r.kind === 'half_holiday')!
    calendar.editDay(owner, eve.id, { note: 'Öğleden sonra kapalı' })
    const result = applyHolidayCheck(deps, owner, 2027, feastsFromEvents(parseIcs(GOOGLE_ICS)), 'google')
    expect(result.diffs.find((d) => d.groupKey.startsWith('ramazan'))?.outcome).toBe('userKept')
    expect(feastRows('ramazan-bayrami').map((r) => r.date)).toEqual([
      '2027-03-08',
      '2027-03-09',
      '2027-03-10',
      '2027-03-11'
    ])
    expect(() => applyHolidayCheck(deps, roleCtx('accountant'), 2027, [], 'google')).toThrow(
      /PERMISSION_DENIED/
    )
  })
  it('kullanıcının iptal ettiği bayram günü de kullanıcı düzenlemesidir: grup kaymaz, iptal edilen güne bayram düşmez (P14fix #9)', async () => {
    const { deps, calendar } = await setup()
    calendar.ensureYearGenerated(owner, 2027)
    const lastDay = feastRows('ramazan-bayrami').find((r) => r.date === '2027-03-11')!
    calendar.cancelDay(owner, lastDay.id)
    const result = applyHolidayCheck(deps, owner, 2027, feastsFromEvents(parseIcs(GOOGLE_ICS)), 'google')
    expect(result.diffs.find((d) => d.groupKey.startsWith('ramazan'))?.outcome).toBe('userKept')
    const live = feastRows('ramazan-bayrami').filter((r) => !r.cancelledAt)
    expect(live.map((r) => r.date)).toEqual(['2027-03-08', '2027-03-09', '2027-03-10'])
    expect(live.every((r) => r.source === 'generated')).toBe(true)
  })
})
