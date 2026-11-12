import { describe, expect, it } from 'vitest'
import { STATUS_KEYS, type StatusKey } from '@shared/contract'
import { localDate, type LocalDate } from '@shared/date'
import {
  blockAt,
  countDays,
  dateAt,
  dayActivity,
  defaultYears,
  emptyCellStatus,
  gridBounds,
  legendItems,
  mergePages,
  monthsCovering,
  moveCursor,
  nightStatusOn,
  overlaps,
  paintStay,
  renderWindow,
  stayBars,
  staysAt,
  stayIcons,
  statusSetup,
  type GridPage,
  type GridStayView
} from './grid-model'

const d = (s: string): LocalDate => localDate(s)
const BASE = d('2026-10-01')
const TODAY = d('2026-10-04')

function stay(
  id: string,
  checkIn: string,
  checkOut: string,
  extra: Partial<GridStayView> = {}
): GridStayView {
  const nights: GridStayView['nights'] = []
  if (checkIn === checkOut) nights.push({ date: d(checkIn), pay: 'unpaid', priceMinor: 100_000 })
  else
    for (
      let x = d(checkIn);
      x < d(checkOut);
      x = d(new Date(Date.parse(`${x}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10))
    )
      nights.push({ date: x, pay: 'unpaid', priceMinor: 200_000 })
  return {
    id,
    reservationId: `r-${id}`,
    code: `R-2026-${id}`,
    roomId: 'room-1',
    checkIn: d(checkIn),
    checkOut: d(checkOut),
    dayUse: checkIn === checkOut,
    reservationStatus: 'confirmed',
    stayStatus: 'planned',
    guestName: `Misafir ${id}`,
    currency: 'TRY',
    nights,
    tagIds: [],
    vip: false,
    kbsMissing: false,
    standingNote: null,
    hasNotes: false,
    children: 0,
    ...extra
  }
}

const page = (over: Partial<GridPage> = {}): GridPage => ({
  today: TODAY,
  from: d('2026-10-01'),
  to: d('2026-11-01'),
  rooms: [
    {
      id: 'room-1',
      number: '101',
      floor: '1',
      typeId: 't',
      typeName: 'Standart',
      typeNameI18n: null,
      beds: 2,
      sellable: true,
      hk: 'clean'
    },
    {
      id: 'room-2',
      number: '102',
      floor: '1',
      typeId: 't',
      typeName: 'Standart',
      typeNameI18n: null,
      beds: 2,
      sellable: true,
      hk: 'clean'
    }
  ],
  stays: [],
  blocks: [],
  days: [],
  ...over
})

const allOn = new Set<StatusKey>(STATUS_KEYS)

describe('ızgara aralığı ve sanallaştırma', () => {
  it('kayıt yokken geçen yılın 1 Ocak gününden on yıl sonrasının 31 Aralık gününe kadar sürer (2026 → 2025–2036)', () => {
    const { start, count } = gridBounds(defaultYears(TODAY))
    expect(start).toBe('2025-01-01')
    // 2025-01-01 … 2036-12-31: twelve years of days.
    expect(count).toBe(4383)
  })

  it('ana bilgisayarın verdiği yıllar ızgaranın ilk ve son gününü belirler (G-31: 2011–2036)', () => {
    const { start, count } = gridBounds({ firstYear: 2011, lastYear: 2036 })
    expect(start).toBe('2011-01-01')
    expect(dateAt(start, count - 1)).toBe('2036-12-31')
  })

  it('ızgara bütün aylar hâlinde okunur', () => {
    expect(monthsCovering(d('2026-09-20'), d('2026-11-02'))).toEqual([
      { from: '2026-09-01', to: '2026-10-01' },
      { from: '2026-10-01', to: '2026-11-01' },
      { from: '2026-11-01', to: '2026-12-01' }
    ])
    expect(monthsCovering(d('2026-12-05'), d('2027-01-01'))).toEqual([
      { from: '2026-12-01', to: '2027-01-01' }
    ])
  })

  it('yalnız görünen sütunlar ve iki haftalık pay çizilir; birkaç piksellik kaydırma pencereyi değiştirmez', () => {
    const count = 4383
    expect(renderWindow(600, 20, count)).toEqual({ from: 574, to: 644 })
    expect(renderWindow(601, 20, count)).toEqual(renderWindow(600, 20, count))
    expect(renderWindow(0, 20, count)).toEqual({ from: 0, to: 42 })
    expect(renderWindow(count - 5, 20, count).to).toBe(count)
    const w = renderWindow(1500, 30, count)
    expect(w.to - w.from).toBeLessThan(80)
  })

  it('aralık kesişimi: başlangıcı pencereden önce olan uzun konaklama da çizilir', () => {
    expect(overlaps(10, 30, 20, 40)).toBe(true)
    expect(overlaps(10, 10, 20, 40)).toBe(false)
    expect(overlaps(40, 3, 20, 40)).toBe(false)
  })

  it('aylar birleşirken ayları aşan konaklama ve blok bir kez gelir; notlar güne göre toplanır', () => {
    const crossing = stay('a', '2026-10-30', '2026-11-03')
    const block = {
      id: 'b1',
      roomId: 'room-2',
      dateFrom: d('2026-10-30'),
      dateTo: d('2026-11-02'),
      kind: 'oos' as const,
      reason: 'Boya',
      note: null,
      manual: true
    }
    const note = {
      id: 'n1',
      date: d('2026-10-31'),
      kind: 'note' as const,
      title: 'Fuar',
      titleI18n: null,
      note: null,
      estimated: false
    }
    const model = mergePages([
      page({ stays: [crossing], blocks: [block], days: [note] }),
      page({ from: d('2026-11-01'), to: d('2026-12-01'), stays: [crossing], blocks: [block] })
    ])
    expect(model.stays).toHaveLength(1)
    expect(model.blocks).toHaveLength(1)
    expect(model.days.get('2026-10-31')).toEqual([note])
    expect(model.rooms.map((r) => r.number)).toEqual(['101', '102'])
    expect(model.today).toBe(TODAY)
  })
})

describe('çubuk geometrisi', () => {
  it('çok geceli konaklama tek çubuktur: giriş sütunundan gece sayısı kadar', () => {
    const [bar] = stayBars([stay('a', '2026-10-03', '2026-10-06')], BASE)
    expect(bar).toMatchObject({ start: 2, width: 3, split: null })
  })

  it('aynı gün iki misafir: gündüz kullanımı hücrenin ilk yarısı, o gün girişli gece ikinci yarısı', () => {
    const bars = stayBars(
      [stay('night', '2026-10-05', '2026-10-07'), stay('day', '2026-10-05', '2026-10-05')],
      BASE
    )
    expect(bars.find((b) => b.stay.id === 'day')).toMatchObject({ start: 4, width: 0.5, split: 'start' })
    expect(bars.find((b) => b.stay.id === 'night')).toMatchObject({ start: 4.5, width: 1.5, split: 'end' })
  })

  it('tek başına gündüz kullanımı bütün hücreyi alır; çıkış günü başka girişe açıktır', () => {
    const bars = stayBars(
      [
        stay('day', '2026-10-05', '2026-10-05'),
        stay('x', '2026-10-01', '2026-10-03'),
        stay('y', '2026-10-03', '2026-10-04')
      ],
      BASE
    )
    expect(bars.find((b) => b.stay.id === 'day')).toMatchObject({ start: 4, width: 1, split: null })
    expect(bars.find((b) => b.stay.id === 'x')).toMatchObject({ start: 0, width: 2 })
    expect(bars.find((b) => b.stay.id === 'y')).toMatchObject({ start: 2, width: 1 })
  })
})

describe('renkler (§6.14)', () => {
  it('boş hücre: bugünden önce gri, bugün ve sonrası beyaz; kapalıysa geri düşer', () => {
    expect(emptyCellStatus(true, allOn)).toBe('pastEmpty')
    expect(emptyCellStatus(false, allOn)).toBe('empty')
    const noGrey = new Set<StatusKey>(STATUS_KEYS.filter((k) => k !== 'pastEmpty'))
    expect(emptyCellStatus(true, noGrey)).toBe('empty')
    expect(emptyCellStatus(true, new Set())).toBeNull()
  })

  it('gece gece ödeme rengi; kenarlığı özel etiket, öncelikli etiket dolguyu alır', () => {
    const s = stay('a', '2026-10-03', '2026-10-06', { tagIds: ['tag-vip'] })
    s.nights[0]!.pay = 'paid'
    s.nights[1]!.pay = 'partial'
    const border = statusSetup([
      ...STATUS_KEYS.map((code, sort) => tagView(code, 'auto', sort)),
      { ...tagView('vip', 'custom', 10), id: 'tag-vip', name: 'VIP' }
    ])
    const p = paintStay(s, border)
    expect(p.nights.map((n) => n.fill)).toEqual([
      { kind: 'auto', code: 'paid' },
      { kind: 'auto', code: 'partial' },
      { kind: 'auto', code: 'unpaid' }
    ])
    expect(p.border).toEqual({ kind: 'custom', tagId: 'tag-vip' })
    const fill = statusSetup([
      ...STATUS_KEYS.map((code, sort) => tagView(code, 'auto', sort)),
      { ...tagView('vip', 'custom', 10), id: 'tag-vip', name: 'VIP', priorityOverAuto: true }
    ])
    const q = paintStay(s, fill)
    expect(q.nights[0]!.fill).toEqual({ kind: 'custom', tagId: 'tag-vip' })
    expect(q.border).toEqual({ kind: 'auto', code: 'paid' })
  })

  it('"kısmen" kapalıysa gece ödenmedi görünür ve kapora simgesi çıkar; simgeler renksiz de anlatır', () => {
    const s = stay('a', '2026-10-03', '2026-10-05', {
      kbsMissing: true,
      vip: true,
      hasNotes: true,
      children: 1,
      standingNote: { text: 'Geç gelecek', level: 'info' }
    })
    s.nights[0]!.pay = 'partial'
    const setup = statusSetup(
      STATUS_KEYS.filter((k) => k !== 'partial').map((code, i) => tagView(code, 'auto', i))
    )
    const p = paintStay(s, setup)
    expect(p.nights[0]!.fill).toEqual({ kind: 'auto', code: 'unpaid' })
    expect(p.depositIcon).toBe(true)
    expect(stayIcons(s, p.depositIcon)).toEqual(['kbs', 'vip', 'request', 'note', 'child', 'deposit'])
    expect(
      stayIcons({ ...s, standingNote: { text: 'Kara liste değil ama dikkat', level: 'warn' } }, false)[0]
    ).toBe('warn')
  })

  it('lejant: açık otomatik durumlar, sonra açık özel etiketler; kenarlık olanlar işaretli', () => {
    const tags = [
      tagView('paid', 'auto', 0),
      { ...tagView('empty', 'auto', 1), enabled: false },
      { ...tagView('grp', 'custom', 2), id: 'g', name: 'Grup' },
      { ...tagView('early', 'custom', 3), id: 'e', name: 'Erken giriş', enabled: false }
    ]
    const items = legendItems(tags, (t) => t.name ?? t.code)
    expect(items.map((i) => i.label)).toEqual(['paid', 'Grup'])
    expect(items[1]).toMatchObject({ asBorder: true, subject: { kind: 'custom', tagId: 'g' } })
  })
})

describe('hücre içeriği, klavye ve gün listesi', () => {
  it('bölünmüş hücrede önce gündüz kullanımı gelir; blok tarihle bulunur', () => {
    const stays = [stay('night', '2026-10-03', '2026-10-06'), stay('day', '2026-10-04', '2026-10-04')]
    expect(staysAt(stays, 'room-1', d('2026-10-04')).map((s) => s.id)).toEqual(['day', 'night'])
    expect(staysAt(stays, 'room-1', d('2026-10-06'))).toEqual([])
    const blocks = [
      {
        id: 'b',
        roomId: 'room-2',
        dateFrom: d('2026-10-04'),
        dateTo: d('2026-10-06'),
        kind: 'ooo' as const,
        reason: 'Su',
        note: null,
        manual: true
      }
    ]
    expect(blockAt(blocks, 'room-2', d('2026-10-05'))?.id).toBe('b')
    expect(blockAt(blocks, 'room-2', d('2026-10-06'))).toBeUndefined()
  })

  it('oklar bir hücre, PageUp/PageDown bir hafta gider; ızgaranın dışına çıkmaz', () => {
    expect(moveCursor({ row: 0, col: 5 }, 'ArrowDown', 19, 100)).toEqual({ row: 1, col: 5 })
    expect(moveCursor({ row: 0, col: 5 }, 'ArrowUp', 19, 100)).toEqual({ row: 0, col: 5 })
    expect(moveCursor({ row: 18, col: 99 }, 'ArrowRight', 19, 100)).toEqual({ row: 18, col: 99 })
    expect(moveCursor({ row: 3, col: 10 }, 'PageDown', 19, 100)).toEqual({ row: 3, col: 17 })
    expect(moveCursor({ row: 3, col: 3 }, 'PageUp', 19, 100)).toEqual({ row: 3, col: 0 })
    expect(moveCursor({ row: 3, col: 3 }, 'x', 19, 100)).toBeNull()
  })

  it('gün listesi: gelen, giden, kalan ve boş odalar (blok boş sayılmaz)', () => {
    const p = page({
      stays: [
        stay('in', '2026-10-04', '2026-10-06'),
        { ...stay('out', '2026-10-01', '2026-10-04'), roomId: 'room-2' },
        { ...stay('stay', '2026-10-02', '2026-10-08'), roomId: 'room-3' }
      ],
      rooms: [
        ...page().rooms,
        { ...page().rooms[0]!, id: 'room-3', number: '103' },
        { ...page().rooms[0]!, id: 'room-4', number: '104' },
        { ...page().rooms[0]!, id: 'room-5', number: '105' }
      ],
      blocks: [
        {
          id: 'b',
          roomId: 'room-5',
          dateFrom: d('2026-10-04'),
          dateTo: d('2026-10-05'),
          kind: 'oos',
          reason: 'Sahip',
          note: null,
          manual: true
        }
      ]
    })
    const a = dayActivity(p, TODAY)
    expect(a.arrivals.map((s) => s.id)).toEqual(['in'])
    expect(a.departures.map((s) => s.id)).toEqual(['out'])
    expect(a.staying.map((s) => s.id)).toEqual(['stay'])
    expect(a.free.map((r) => r.number)).toEqual(['102', '104'])
  })

  it('gün listesinde satışa kapalı oda boş sayılmaz ("Boş oda bul" gibi)', () => {
    const p = page({
      rooms: [page().rooms[0]!, { ...page().rooms[1]!, sellable: false }]
    })
    expect(dayActivity(p, TODAY).free.map((r) => r.number)).toEqual(['101'])
  })

  it('gün listesindeki durum gecenin ödemesinden gelir; giden misafir son gecesiyle görünür', () => {
    const s = stay('out', '2026-10-01', '2026-10-04')
    s.nights[2]!.pay = 'paid'
    expect(nightStatusOn(s, TODAY, TODAY)).toBe('paid')
    expect(nightStatusOn(stay('day', '2026-10-04', '2026-10-04'), TODAY, TODAY)).toBe('dayuse')
  })

  it('toplu not gün sayısı: aralık, hafta günleri, yapıştırılan liste', () => {
    expect(countDays('range', d('2026-10-01'), d('2026-10-10'), [], [])).toBe(10)
    // Saturdays and Sundays of October 2026: 3, 4, 10, 11, 17, 18, 24, 25, 31.
    expect(countDays('weekdays', d('2026-10-01'), d('2026-10-31'), [6, 0], [])).toBe(9)
    expect(countDays('list', d('2026-10-01'), d('2026-10-01'), [], ['2026-10-02', '2026-11-05'])).toBe(2)
    expect(countDays('range', d('2026-10-10'), d('2026-10-01'), [], [])).toBe(0)
  })
})

function tagView(code: string, kind: 'auto' | 'custom', sort: number) {
  return {
    id: `tag-${code}`,
    code,
    kind,
    name: null as string | null,
    nameI18n: null,
    color: kind === 'custom' ? '#2563eb' : null,
    description: null,
    enabled: true,
    sort,
    priorityOverAuto: false,
    displayName: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  }
}
