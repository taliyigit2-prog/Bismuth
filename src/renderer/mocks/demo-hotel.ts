// Faz 3 demo hotel ("sahte servis"): 19 rooms / 38 beds around today, built with the real shared rules (night
// allocation, folio totals) so the mockups show numbers the program would really compute. Deterministic: the same
// day gives the same hotel (seeded PRNG). Every name, phone and amount is invented (CLAUDE.md).
import { addDays, diffDays, localDate, localDateOf, weekday, type LocalDate } from '@shared/date'
import { allocatePayments, folioTotals, type CreditLike } from '@shared/domain/payment-allocation'
import { money, multiplyRatio } from '@shared/money'
import type {
  DemoBlock,
  DemoChannel,
  DemoCompany,
  DemoContact,
  DemoEmployee,
  DemoExpense,
  DemoFxRate,
  DemoGuest,
  DemoHandover,
  DemoHotel,
  DemoIssue,
  DemoLaundryLine,
  DemoLostItem,
  DemoMaintenance,
  DemoMethod,
  DemoMonthlyReport,
  DemoNote,
  DemoOccupant,
  DemoPayment,
  DemoProduct,
  DemoReservation,
  DemoRoom,
  DemoSpecialDay,
  DemoStay,
  DemoTag,
  DemoTask,
  DemoTourismRow,
  HkStatus,
  I18nText
} from './types'

const RATE_SCALE = 1_000_000

/** mulberry32: tiny, fast, good enough for demo data. */
function prng(seed: number) {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T
  /** Weighted pick: [[value, weight], …]. */
  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    const total = items.reduce((s, [, w]) => s + w, 0)
    let r = next() * total
    for (const [value, w] of items) {
      r -= w
      if (r < 0) return value
    }
    return items[items.length - 1]![0]
  }
  return { next, int, pick, weighted, chance: (p: number): boolean => next() < p }
}

const i18n = (tr: string, en: string, ru: string): I18nText => ({ tr, en, ru })
const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
/** Local wall-clock time of a day as an ISO instant. */
const at = (d: LocalDate, hh: number, mm = 0): string =>
  new Date(`${d}T${pad(hh)}:${pad(mm)}:00`).toISOString()

// --- Lists (the seeded names of src/main/db/seed/lists.ts) --------------------------------------------------

const ROOM_TYPES: Record<string, { name: I18nText; base: number; weekend: number }> = {
  single: { name: i18n('Tek kişilik', 'Single', 'Одноместный'), base: 220_000, weekend: 250_000 },
  double: {
    name: i18n('Çift kişilik (Double)', 'Double', 'Двухместный (Double)'),
    base: 280_000,
    weekend: 320_000
  },
  twin: { name: i18n('İki yataklı (Twin)', 'Twin', 'Двухместный (Twin)'), base: 270_000, weekend: 310_000 },
  triple: { name: i18n('Üç kişilik', 'Triple', 'Трёхместный'), base: 340_000, weekend: 390_000 },
  city_view: {
    name: i18n('Şehir manzaralı', 'City view', 'С видом на город'),
    base: 320_000,
    weekend: 360_000
  },
  junior_suite: { name: i18n('Junior süit', 'Junior suite', 'Полулюкс'), base: 390_000, weekend: 440_000 },
  suite: { name: i18n('Süit', 'Suite', 'Сьют'), base: 460_000, weekend: 520_000 },
  attic: { name: i18n('Çatı odası', 'Attic room', 'Мансардный номер'), base: 300_000, weekend: 340_000 }
}

const ROOM_LAYOUT: [string, number, string, number][] = [
  ['101', 1, 'double', 2],
  ['102', 1, 'twin', 2],
  ['103', 1, 'double', 2],
  ['104', 1, 'single', 1],
  ['201', 2, 'double', 2],
  ['202', 2, 'twin', 2],
  ['203', 2, 'double', 2],
  ['204', 2, 'triple', 3],
  ['301', 3, 'double', 2],
  ['302', 3, 'twin', 2],
  ['303', 3, 'double', 2],
  ['304', 3, 'twin', 2],
  ['401', 4, 'double', 2],
  ['402', 4, 'city_view', 2],
  ['403', 4, 'twin', 2],
  ['404', 4, 'junior_suite', 2],
  ['501', 5, 'suite', 2],
  ['502', 5, 'city_view', 2],
  ['503', 5, 'attic', 2]
]

const CHANNELS: DemoChannel[] = [
  { code: 'direct', kind: 'direct', name: i18n('Doğrudan', 'Direct', 'Напрямую') },
  { code: 'phone', kind: 'direct', name: i18n('Telefon', 'Phone', 'Телефон') },
  { code: 'walk_in', kind: 'direct', name: i18n('Kapıdan', 'Walk-in', 'Без брони') },
  { code: 'booking', kind: 'ota', name: i18n('Booking.com', 'Booking.com', 'Booking.com') },
  { code: 'airbnb', kind: 'ota', name: i18n('Airbnb', 'Airbnb', 'Airbnb') },
  { code: 'expedia', kind: 'ota', name: i18n('Expedia', 'Expedia', 'Expedia') },
  { code: 'ostrovok', kind: 'ota', name: i18n('Ostrovok', 'Ostrovok', 'Островок') },
  { code: 'agency', kind: 'agency', name: i18n('Acente', 'Travel agency', 'Турагентство') },
  {
    code: 'bounce',
    kind: 'platform_service',
    name: i18n('Bounce (bavul emaneti)', 'Bounce (luggage)', 'Bounce (багаж)')
  }
]

const METHODS: DemoMethod[] = [
  { code: 'cash', group: 'cash', isCash: true, name: i18n('Nakit', 'Cash', 'Наличные') },
  { code: 'card', group: 'card', isCash: false, name: i18n('Kredi kartı', 'Card', 'Карта') },
  {
    code: 'bank',
    group: 'bank',
    isCash: false,
    name: i18n('Havale / EFT (IBAN)', 'Bank transfer (IBAN)', 'Банковский перевод (IBAN)')
  }
]

/** TRY for one unit × 1 000 000 (invented, plausible 2026 levels). */
const FX: Record<string, number> = { EUR: 49_031_234, USD: 41_902_118, GBP: 56_240_880, RUB: 512_340 }

const NAMES: Record<string, { first: string[]; last: string[]; lang: DemoGuest['language'] }> = {
  TR: {
    first: [
      'Ahmet',
      'Elif',
      'Mehmet',
      'Zeynep',
      'Can',
      'Selin',
      'Burak',
      'Ayşe',
      'Emre',
      'Derya',
      'Kaan',
      'Gizem',
      'Okan',
      'Nazlı'
    ],
    last: [
      'Yılmaz',
      'Demir',
      'Çelik',
      'Şahin',
      'Aydın',
      'Öztürk',
      'Kılıç',
      'Arslan',
      'Doğan',
      'Koç',
      'Kurt',
      'Özdemir'
    ],
    lang: 'tr'
  },
  RU: {
    first: ['Anna', 'Dmitry', 'Olga', 'Sergey', 'Irina', 'Pavel', 'Natalia', 'Alexey'],
    last: ['Smirnova', 'Volkov', 'Kuznetsova', 'Sokolov', 'Popova', 'Lebedev', 'Morozova'],
    lang: 'ru'
  },
  DE: {
    first: ['Lukas', 'Hannah', 'Jonas', 'Mia', 'Felix'],
    last: ['Müller', 'Schmidt', 'Weber', 'Fischer', 'Becker'],
    lang: 'de'
  },
  GB: {
    first: ['Oliver', 'Emily', 'Harry', 'Sophie'],
    last: ['Taylor', 'Brown', 'Wilson', 'Evans'],
    lang: 'en'
  },
  US: { first: ['Michael', 'Jessica', 'Daniel'], last: ['Johnson', 'Miller', 'Davis'], lang: 'en' },
  FR: { first: ['Camille', 'Hugo', 'Léa'], last: ['Martin', 'Bernard', 'Dubois'], lang: 'en' },
  NL: { first: ['Daan', 'Sanne'], last: ['de Vries', 'Bakker'], lang: 'en' },
  IR: { first: ['Reza', 'Maryam', 'Ali'], last: ['Ahmadi', 'Hosseini', 'Karimi'], lang: 'en' },
  SA: { first: ['Fahad', 'Noura', 'Khalid'], last: ['Al-Harbi', 'Al-Qahtani'], lang: 'ar' },
  AZ: { first: ['Elvin', 'Aysel', 'Rauf'], last: ['Mammadov', 'Aliyeva', 'Huseynov'], lang: 'tr' },
  UA: { first: ['Oksana', 'Andriy'], last: ['Shevchenko', 'Kovalenko'], lang: 'ru' },
  KZ: { first: ['Aigerim', 'Nurlan'], last: ['Abenova', 'Seitkali'], lang: 'ru' }
}
const NATIONALITY_WEIGHTS: [string, number][] = [
  ['TR', 42],
  ['RU', 15],
  ['DE', 8],
  ['GB', 6],
  ['US', 5],
  ['FR', 4],
  ['NL', 3],
  ['IR', 4],
  ['SA', 3],
  ['AZ', 4],
  ['UA', 3],
  ['KZ', 3]
]

const STAFF = {
  reception: ['Selin Kaya', 'Murat Demir', 'Olga Petrova'],
  manager: 'Aylin Şahin',
  owner: 'Sahip',
  housekeeping: ['Hasan Yıldız', 'Gül Aksoy']
}

// --- Generator -----------------------------------------------------------------------------------------------

export function createDemoHotel(todayDate: LocalDate): DemoHotel {
  const r = prng(20261003)
  const today = todayDate
  const now = at(today, 12, 20)
  /** A booking is never made in the future: far-ahead stays were booked over the last three weeks. */
  const bookedOn = (day: LocalDate, n: number): LocalDate =>
    diffDays(day, today) >= 0 ? day : addDays(today, -(n % 21))
  const rooms: DemoRoom[] = ROOM_LAYOUT.map(([number, floor, typeCode, beds], i) => {
    const slot = i - ROOM_LAYOUT.findIndex((x) => x[1] === floor)
    return {
      id: `room-${number}`,
      number,
      floor,
      typeCode,
      typeName: ROOM_TYPES[typeCode]!.name,
      beds,
      sellable: true,
      hk: 'clean' as HkStatus,
      basePriceMinor: ROOM_TYPES[typeCode]!.base,
      weekendPriceMinor: ROOM_TYPES[typeCode]!.weekend,
      plan: { x: slot * 3, y: 0, w: typeCode === 'suite' || typeCode === 'junior_suite' ? 3 : 3, h: 2 }
    }
  })

  // Guests: a pool with returning guests (history cards need repeat stays).
  const guests: DemoGuest[] = []
  const usedNames = new Set<string>()
  for (let i = 0; guests.length < 150 && i < 2000; i++) {
    const nat = r.weighted(NATIONALITY_WEIGHTS)
    const pool = NAMES[nat]!
    const firstName = r.pick(pool.first)
    const lastName = r.pick(pool.last)
    if (usedNames.has(`${firstName} ${lastName}`)) continue
    usedNames.add(`${firstName} ${lastName}`)
    const n = guests.length
    guests.push({
      id: `guest-${pad(n, 3)}`,
      firstName,
      lastName,
      phone:
        nat === 'TR'
          ? `+90 5${r.int(30, 55)} ${r.int(100, 999)} ${pad(r.int(0, 99))} ${pad(r.int(0, 99))}`
          : r.chance(0.7)
            ? `+${r.pick(['7', '49', '44', '1', '33', '98', '966', '994'])} ${r.int(100, 999)} ${r.int(100, 999)} ${r.int(1000, 9999)}`
            : null,
      email: r.chance(0.4)
        ? `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com'
        : null,
      nationality: nat,
      language: pool.lang,
      vip: false,
      standingNote: null,
      standingNoteLevel: 'info',
      notes: null,
      companyId: null
    })
  }
  const g = (i: number): DemoGuest => guests[i]!
  g(0).vip = true
  g(0).standingNote = 'Kaz tüyü yastık istemiyor; ekstra battaniye'
  g(1).standingNote = 'Önceki konaklamada 1 gece borç bıraktı — kapora alın'
  g(1).standingNoteLevel = 'warn'
  g(2).standingNote = 'Yüksek kat ister, asansöre yakın'
  g(3).vip = true
  g(5).notes = 'Şirket faturası istiyor'

  const companies: DemoCompany[] = [
    {
      id: 'co-1',
      title: 'Örnek Turizm Ltd. Şti.',
      address: 'Moda Cd. No: 12',
      city: 'İstanbul',
      taxOffice: 'Kadıköy',
      taxNumber: '1234567890',
      phone: '+90 216 000 00 00',
      email: 'muhasebe@ornekturizm.example',
      iban: 'TR830006200000000012345678',
      contactPerson: 'Ayşe Yılmaz',
      favorite: true
    },
    {
      id: 'co-2',
      title: 'Deniz Yazılım A.Ş.',
      address: 'Büyükdere Cd. No: 100',
      city: 'İstanbul',
      taxOffice: 'Mecidiyeköy',
      taxNumber: '9876543210',
      phone: '+90 212 000 00 00',
      email: 'fatura@denizyazilim.example',
      iban: null,
      contactPerson: null,
      favorite: false
    }
  ]
  g(5).companyId = 'co-1'
  g(6).companyId = 'co-2'

  const customTags: DemoTag[] = [
    {
      id: 'tag-group',
      name: 'Grup',
      color: '#2563eb',
      description: 'Aynı gruptan birden çok oda',
      priorityOverAuto: false,
      enabled: true
    },
    {
      id: 'tag-trouble',
      name: 'Sorunlu',
      color: '#7f1d1d',
      description: 'Dikkat: önceki sorun ya da şikâyet',
      priorityOverAuto: true,
      enabled: true
    },
    {
      id: 'tag-long',
      name: 'Uzun konaklama',
      color: '#0d9488',
      description: '7 gece ve üzeri',
      priorityOverAuto: false,
      enabled: true
    },
    {
      id: 'tag-early',
      name: 'Erken giriş',
      color: '#9333ea',
      description: 'Saat 14:00 öncesi giriş istendi',
      priorityOverAuto: false,
      enabled: false
    }
  ]

  // Blocks first: reservations avoid them.
  const blocks: DemoBlock[] = [
    {
      id: 'block-1',
      roomId: 'room-303',
      dateFrom: addDays(today, -2),
      dateTo: addDays(today, 3),
      kind: 'ooo',
      reason: 'Boya ve nem tamiri'
    },
    {
      id: 'block-2',
      roomId: 'room-503',
      dateFrom: addDays(today, 9),
      dateTo: addDays(today, 11),
      kind: 'oos',
      reason: 'Sahibin misafiri — satılmaz'
    }
  ]
  const blocked = (roomId: string, d: LocalDate): boolean =>
    blocks.some((b) => b.roomId === roomId && b.dateFrom <= d && d < b.dateTo)

  const reservations: DemoReservation[] = []
  let departuresOut = 0
  let code = 0
  let paymentSeq = 0
  const start = addDays(today, -45)
  const end = addDays(today, 75)
  let guestCursor = 0
  const nextGuest = (): DemoGuest => {
    // One in five stays is a returning guest.
    if (r.chance(0.2) && guestCursor > 10) return g(r.int(0, Math.min(guestCursor, guests.length - 1)))
    guestCursor = (guestCursor + 1) % guests.length
    return g(guestCursor)
  }

  const priceOf = (typeCode: string, d: LocalDate): number => {
    const t = ROOM_TYPES[typeCode]!
    const weekend = [5, 6].includes(weekday(d))
    return weekend ? t.weekend : t.base
  }

  const makePayment = (
    res: DemoReservation,
    label: string,
    date: LocalDate,
    hh: number,
    kind: DemoPayment['kind'],
    folioMinor: number,
    methodCode: string,
    currency: string
  ): DemoPayment => {
    const rate = FX[currency]
    const amountMinor =
      currency === 'TRY'
        ? folioMinor
        : multiplyRatio(money(folioMinor, 'TRY'), RATE_SCALE, rate ?? RATE_SCALE).amountMinor
    const credited =
      currency === 'TRY'
        ? amountMinor
        : multiplyRatio(money(amountMinor, currency), rate ?? RATE_SCALE, RATE_SCALE).amountMinor
    paymentSeq++
    return {
      id: `pay-${pad(paymentSeq, 4)}`,
      reservationId: res.id,
      label,
      date,
      at: at(date, hh, r.int(0, 59)),
      kind,
      methodCode,
      channelCode: res.channelCode === 'airbnb' || res.channelCode === 'expedia' ? res.channelCode : null,
      amountMinor,
      currency,
      amountFolioMinor: credited,
      amountBaseMinor: credited,
      collected: diffDays(date, today) > 2,
      voided: false,
      takenBy: r.pick(STAFF.reception)
    }
  }

  for (const room of rooms) {
    let cursor = addDays(start, r.int(0, 3))
    while (diffDays(cursor, end) > 0) {
      const future = diffDays(today, cursor) > 0
      const far = diffDays(today, cursor) > 21
      const gap = r.weighted<number>(
        far
          ? [
              [0, 20],
              [2, 25],
              [4, 25],
              [7, 30]
            ]
          : [
              [0, 50],
              [1, 25],
              [2, 15],
              [4, 10]
            ]
      )
      cursor = addDays(cursor, gap)
      const nights = r.weighted<number>([
        [1, 18],
        [2, 26],
        [3, 22],
        [4, 14],
        [5, 9],
        [7, 7],
        [10, 4]
      ])
      const dayUse = !future && nights === 1 && r.chance(0.04)
      const checkIn = cursor
      const checkOut = dayUse ? checkIn : addDays(checkIn, nights)
      const span = dayUse ? [checkIn] : Array.from({ length: nights }, (_, i) => addDays(checkIn, i))
      if (span.some((d) => blocked(room.id, d)) || diffDays(checkOut, end) < 0) {
        cursor = addDays(cursor, 1)
        continue
      }
      const guest = nextGuest()
      const channelCode = r.weighted<string>([
        ['booking', 34],
        ['airbnb', 18],
        ['direct', 14],
        ['phone', 10],
        ['ostrovok', guest.nationality === 'RU' ? 30 : 4],
        ['expedia', 5],
        ['walk_in', future ? 0 : 7],
        ['agency', 3]
      ])
      code++
      const id = `res-${pad(code, 4)}`
      const inHouseNow =
        diffDays(checkIn, today) >= 0 && (diffDays(today, checkOut) > 0 || (dayUse && checkIn === today))
      const departedToday = checkOut === today && !dayUse
      const past = diffDays(checkOut, today) > 0 || (dayUse && diffDays(checkIn, today) > 0)
      let status: DemoStay['status']
      let resStatus: DemoReservation['status']
      let checkedInAt: string | null = null
      let checkedOutAt: string | null = null
      if (past || (departedToday && r.chance(0.6))) {
        status = 'done'
        resStatus = 'checked_out'
        checkedInAt = at(checkIn, r.int(13, 22), r.int(0, 59))
        checkedOutAt = at(
          dayUse ? checkIn : checkOut,
          departedToday ? r.int(8, 10) : r.int(9, 12),
          r.int(0, 59)
        )
        // The first guest leaving today is still in the room after check-out time (Bugün shows it loud).
        if (departedToday && departuresOut++ === 0) {
          status = 'in_house'
          resStatus = 'checked_in'
          checkedOutAt = null
        }
      } else if (inHouseNow || departedToday) {
        const arrivingToday = checkIn === today
        if (arrivingToday && r.chance(0.6)) {
          status = 'planned'
          resStatus = 'confirmed'
        } else {
          status = 'in_house'
          resStatus = 'checked_in'
          checkedInAt = arrivingToday
            ? at(today, r.int(8, 10), r.int(0, 29))
            : at(checkIn, r.int(13, 23), r.int(0, 59))
        }
      } else {
        status = 'planned'
        resStatus = r.chance(0.1) ? 'tentative' : 'confirmed'
      }
      const nightRows = span.map((d) => ({
        id: `${id}-${d}`,
        date: d,
        roomSort: 0,
        priceMinor: priceOf(room.typeCode, d)
      }))
      const total = nightRows.reduce((s, n) => s + n.priceMinor, 0)
      const res: DemoReservation = {
        id,
        code: `R-${today.slice(0, 4)}-${pad(code, 6)}`,
        guestId: guest.id,
        channelCode,
        channelRef: ['booking', 'airbnb', 'expedia', 'ostrovok'].includes(channelCode)
          ? String(r.int(1_000_000, 9_999_999))
          : null,
        status: resStatus,
        parkedReason: null,
        adults: Math.min(room.beds, r.int(1, 2)),
        children: room.beds > 2 && r.chance(0.3) ? 1 : 0,
        tagIds: [],
        notes: [],
        request: null,
        createdAt: at(bookedOn(addDays(checkIn, -r.int(1, 40)), code), r.int(9, 22)),
        stays: [],
        payments: [],
        extras: [],
        chargesMinor: 0,
        creditedMinor: 0,
        balanceMinor: 0
      }
      // Payments by stage of the stay.
      const label = room.number
      const method = (): string =>
        channelCode === 'airbnb' || channelCode === 'expedia'
          ? 'bank'
          : r.weighted<string>([
              ['cash', 40],
              ['card', 42],
              ['bank', 18]
            ])
      const currency = (): string =>
        r.weighted<string>([
          ['TRY', 84],
          ['EUR', 11],
          ['USD', 5]
        ])
      const firstNight = nightRows[0]!.priceMinor
      if (status === 'done') {
        const share = r.chance(0.93) ? total : total - firstNight
        if (share > 0)
          res.payments.push(
            makePayment(
              res,
              label,
              dayUse ? checkIn : checkIn,
              r.int(14, 21),
              'payment',
              share,
              method(),
              currency()
            )
          )
      } else if (status === 'in_house') {
        const plan = r.weighted<'full' | 'deposit' | 'none'>([
          ['full', 50],
          ['deposit', 32],
          ['none', 18]
        ])
        if (plan === 'full')
          res.payments.push(
            makePayment(res, label, checkIn, r.int(14, 21), 'payment', total, method(), currency())
          )
        if (plan === 'deposit')
          res.payments.push(
            makePayment(res, label, checkIn, r.int(14, 21), 'deposit', firstNight, method(), currency())
          )
      } else if (r.chance(0.38)) {
        const created = localDateOf(new Date(res.createdAt))
        res.payments.push(
          makePayment(
            res,
            label,
            diffDays(created, today) >= 0 ? created : today,
            r.int(10, 19),
            'deposit',
            firstNight,
            method(),
            'TRY'
          )
        )
      }
      const credits: CreditLike[] = res.payments.map((p) => ({
        kind: p.kind,
        amountFolioMinor: p.amountFolioMinor
      }))
      const allocated = allocatePayments(nightRows, credits)
      const totals = folioTotals(
        nightRows.map((n) => ({ amountMinor: n.priceMinor })),
        credits
      )
      const occupants: DemoOccupant[] = []
      if (status !== 'planned') {
        occupants.push({
          id: `${id}-occ-1`,
          fullName: `${guest.firstName} ${guest.lastName}`,
          isPrimary: true,
          descriptorNote: null,
          arrivedAt: checkedInAt,
          leftAt: status === 'done' ? checkedOutAt : null,
          kbsReportedAt: checkedInAt,
          kbsCheckoutAt: status === 'done' && !departedToday ? checkedOutAt : null
        })
        if (res.adults > 1) {
          const other = g(r.int(0, guests.length - 1))
          occupants.push({
            id: `${id}-occ-2`,
            fullName: `${other.firstName} ${guest.lastName}`,
            isPrimary: false,
            descriptorNote: null,
            arrivedAt: checkedInAt,
            leftAt: status === 'done' ? checkedOutAt : null,
            kbsReportedAt: checkedInAt,
            kbsCheckoutAt: status === 'done' && !departedToday ? checkedOutAt : null
          })
        }
      }
      res.stays.push({
        id: `${id}-stay-1`,
        reservationId: id,
        roomId: room.id,
        checkIn,
        checkOut,
        status,
        dayUse,
        nights: allocated.map((a) => ({
          date: a.night.date,
          priceMinor: a.night.priceMinor,
          pay: a.status,
          allocatedMinor: a.allocatedMinor
        })),
        occupants,
        checkedInAt,
        checkedOutAt
      })
      res.chargesMinor = totals.chargesMinor
      res.creditedMinor = totals.creditedMinor
      res.balanceMinor = totals.balanceMinor
      if (nights >= 7) res.tagIds.push('tag-long')
      reservations.push(res)
      cursor = dayUse ? addDays(checkOut, 1) : checkOut
    }
  }

  // Hand-made details the screens show off: notes, requests, tags, KBS gaps, a group.
  const inHouse = reservations.filter((x) => x.stays[0]!.status === 'in_house')
  const arrivals = reservations.filter(
    (x) => x.stays[0]!.checkIn === today && x.stays[0]!.status === 'planned'
  )
  const future = reservations.filter((x) => diffDays(today, x.stays[0]!.checkIn) > 0)
  inHouse[0]?.notes.push({
    at: at(today, 8, 40),
    by: STAFF.reception[2]!,
    text: 'Klima sesi şikâyeti — teknik servise bildirildi'
  })
  if (inHouse[1]) {
    inHouse[1].request = 'Bebek yatağı'
    inHouse[1].tagIds.push('tag-trouble')
  }
  if (arrivals[0]) arrivals[0].request = 'Geç gelecek, 23:30 civarı'
  if (arrivals[1])
    arrivals[1].notes.push({
      at: at(addDays(today, -3), 16, 5),
      by: STAFF.reception[0]!,
      text: 'Havalimanı transferi istendi (2 kişi)'
    })
  for (const x of future.slice(2, 5)) x.tagIds.push('tag-group')
  if (future[6]) future[6].request = 'Doğum günü — odaya pasta'
  // Guests with standing notes stay with us now (the alert shows on the panel).
  if (inHouse[2]) inHouse[2].guestId = g(0).id
  if (arrivals[2]) arrivals[2].guestId = g(1).id
  // KBS gaps: a person added later without a mark, and one who left today without the KBS check-out.
  const late = inHouse[3]?.stays[0]
  if (late) {
    late.occupants.push({
      id: `${late.id}-occ-late`,
      fullName: 'Kerem Aydın',
      isPrimary: false,
      descriptorNote: 'sonradan geldi, kızıl saçlı',
      arrivedAt: at(addDays(today, -1), 23, 10),
      leftAt: null,
      kbsReportedAt: null,
      kbsCheckoutAt: null
    })
  }
  if (inHouse[4]?.stays[0]?.occupants[0])
    inHouse[4].stays[0].occupants[0].descriptorNote = 'gözlüklü, mavi valiz'

  // Parked reservations (below the grid, G-39).
  const parkedSource = [
    { reason: 'refund_pending' as const, guest: g(40), nights: 2 },
    { reason: 'postponed' as const, guest: g(41), nights: 3 }
  ]
  for (const p of parkedSource) {
    code++
    const id = `res-${pad(code, 4)}`
    const res: DemoReservation = {
      id,
      code: `R-${today.slice(0, 4)}-${pad(code, 6)}`,
      guestId: p.guest.id,
      channelCode: 'direct',
      channelRef: null,
      status: 'parked',
      parkedReason: p.reason,
      adults: 2,
      children: 0,
      tagIds: [],
      notes: [
        {
          at: at(addDays(today, -4), 11),
          by: STAFF.manager,
          text: p.reason === 'refund_pending' ? 'İade bekliyor (kapora ₺2.800)' : 'Tarihi sonra bildirecek'
        }
      ],
      request: null,
      createdAt: at(addDays(today, -12), 15),
      stays: [],
      payments: [],
      extras: [],
      chargesMinor: 0,
      creditedMinor: 280_000,
      balanceMinor: -280_000
    }
    res.payments.push(makePayment(res, 'R', addDays(today, -12), 15, 'deposit', 280_000, 'card', 'TRY'))
    reservations.push(res)
  }

  // Housekeeping: departed today → dirty; in-house rooms mostly clean; the blocked room under repair.
  for (const room of rooms) {
    const stays = reservations.flatMap((x) => x.stays).filter((s) => s.roomId === room.id)
    if (blocked(room.id, today)) room.hk = 'out_of_order'
    else if (stays.some((s) => s.checkOut === today && s.status === 'done')) room.hk = 'dirty'
    else if (stays.some((s) => s.status === 'in_house')) room.hk = r.chance(0.3) ? 'dirty' : 'clean'
    else room.hk = r.chance(0.5) ? 'inspected' : 'clean'
  }
  rooms.find((x) => x.number === '204')!.hk = 'maintenance'

  // Stand-alone sales (Bounce luggage storage, G-68).
  const saleFolios: DemoPayment[] = Array.from({ length: 3 }, (_, i) => ({
    id: `sale-${i + 1}`,
    reservationId: null,
    label: 'Bounce',
    date: addDays(today, -i),
    at: at(addDays(today, -i), 11 + i, 15),
    kind: 'payment' as const,
    methodCode: 'bank',
    channelCode: 'bounce',
    amountMinor: 35_000 * (i + 1),
    currency: 'TRY',
    amountFolioMinor: 35_000 * (i + 1),
    amountBaseMinor: 35_000 * (i + 1),
    collected: i > 1,
    voided: false,
    takenBy: STAFF.reception[0]!
  }))

  const expenseDefs: [
    number,
    string,
    number,
    boolean,
    DemoExpense['section'],
    DemoExpense['kind'],
    string | null
  ][] = [
    [0, 'Market (su, çay, şeker)', 184_050, true, 'general', 'manual', 'cash'],
    [0, 'Deterjan ve yumuşatıcı', 96_000, true, 'general', 'manual', 'cash'],
    [-1, 'Tesisatçı — 302 lavabo', 150_000, true, 'general', 'manual', 'cash'],
    [-1, 'Selin Kaya — avans', 500_000, true, 'general', 'staff', 'cash'],
    [-2, 'Kırtasiye', 32_500, false, 'general', 'manual', 'card'],
    [-3, 'Elektrik faturası', 1_284_700, false, 'general', 'manual', 'bank'],
    [-4, 'Sahibin özel harcaması', 450_000, false, 'owner', 'manual', 'card'],
    [-5, 'Kahvaltılık (peynir, zeytin)', 238_000, true, 'general', 'manual', 'cash'],
    [-6, 'Su damacana (10 adet)', 120_000, true, 'general', 'manual', 'cash'],
    [-8, 'İnternet faturası', 89_900, false, 'general', 'manual', 'bank'],
    [-9, 'Ampul ve priz', 41_500, true, 'general', 'manual', 'cash'],
    [-12, 'Çamaşırhane — Eylül faturası', 1_970_000, false, 'general', 'laundry', 'bank']
  ]
  const expenses: DemoExpense[] = expenseDefs.map(
    ([offset, description, amountMinor, drawer, section, kind, methodCode], i) => ({
      id: `exp-${pad(i + 1, 3)}`,
      date: addDays(today, offset),
      at: at(addDays(today, offset), 10 + (i % 8), 5 * i),
      section,
      description,
      amountMinor,
      currency: 'TRY',
      amountBaseMinor: amountMinor,
      kind,
      paidFromDrawer: drawer,
      settled: drawer && offset < -2,
      methodCode,
      items: description.startsWith('Deterjan')
        ? [
            { product: 'Çamaşır deterjanı', qty: '5 kg', unitMinor: 12_600 },
            { product: 'Yumuşatıcı', qty: '3 lt', unitMinor: 11_000 }
          ]
        : []
    })
  )

  const tasks: DemoTask[] = [
    {
      id: 't1',
      title: 'KBS çıkış kontrolü',
      kind: 'legal',
      status: 'open',
      dueAt: at(today, 12, 30),
      roomNumber: null,
      assignee: { kind: 'shift', name: 'Gündüz' },
      recurrence: 'daily',
      doneBy: null,
      doneAt: null,
      createdBy: STAFF.manager
    },
    {
      id: 't2',
      title: 'Oda 204 klima filtresi',
      kind: 'maintenance',
      status: 'open',
      dueAt: at(today, 15),
      roomNumber: '204',
      assignee: { kind: 'role', name: 'Temizlik' },
      recurrence: null,
      doneBy: null,
      doneAt: null,
      createdBy: STAFF.reception[0]!
    },
    {
      id: 't3',
      title: 'Minibar dolumu (3. kat)',
      kind: 'general',
      status: 'done',
      dueAt: at(today, 9),
      roomNumber: null,
      assignee: { kind: 'user', name: STAFF.housekeeping[0]! },
      recurrence: 'daily',
      doneBy: STAFF.housekeeping[0]!,
      doneAt: at(today, 9, 20),
      createdBy: STAFF.manager
    },
    {
      id: 't4',
      title: 'Derin temizlik — 10. konaklama',
      kind: 'general',
      status: 'open',
      dueAt: null,
      roomNumber: '302',
      assignee: { kind: 'role', name: 'Temizlik' },
      recurrence: 'every_n_stays',
      doneBy: null,
      doneAt: null,
      createdBy: 'Bismuth'
    },
    {
      id: 't5',
      title: 'Su deposu temizliği',
      kind: 'maintenance',
      status: 'open',
      dueAt: at(addDays(today, 4), 10),
      roomNumber: null,
      assignee: null,
      recurrence: 'interval',
      doneBy: null,
      doneAt: null,
      createdBy: STAFF.manager
    },
    {
      id: 't6',
      title: 'Turizm istatistiği bildirimi',
      kind: 'legal',
      status: 'open',
      dueAt: at(addDays(today, -2), 12),
      roomNumber: null,
      assignee: { kind: 'user', name: STAFF.manager },
      recurrence: 'monthly',
      doneBy: null,
      doneAt: null,
      createdBy: 'Bismuth'
    },
    {
      id: 't7',
      title: 'Havlu stoğunu say',
      kind: 'general',
      status: 'open',
      dueAt: at(addDays(today, 1), 11),
      roomNumber: null,
      assignee: { kind: 'user', name: STAFF.housekeeping[1]! },
      recurrence: 'weekly',
      doneBy: null,
      doneAt: null,
      createdBy: STAFF.manager
    },
    {
      id: 't8',
      title: 'Lobi çiçeklerini sula',
      kind: 'general',
      status: 'done',
      dueAt: at(addDays(today, -1), 10),
      roomNumber: null,
      assignee: { kind: 'shift', name: 'Gündüz' },
      recurrence: 'daily',
      doneBy: STAFF.reception[0]!,
      doneAt: at(addDays(today, -1), 10, 12),
      createdBy: STAFF.manager
    },
    {
      id: 't9',
      title: 'Yangın tüpü basınç kontrolü',
      kind: 'maintenance',
      status: 'open',
      dueAt: at(addDays(today, 12), 10),
      roomNumber: null,
      assignee: null,
      recurrence: 'interval',
      doneBy: null,
      doneAt: null,
      createdBy: STAFF.manager
    },
    {
      id: 't10',
      title: 'Depoda deterjan bitti',
      kind: 'general',
      status: 'open',
      dueAt: null,
      roomNumber: null,
      assignee: { kind: 'user', name: STAFF.manager },
      recurrence: null,
      doneBy: null,
      doneAt: null,
      createdBy: STAFF.housekeeping[0]!
    }
  ]

  const handovers: DemoHandover[] = [0, 1, 2, 3].map((i) => {
    const day = addDays(today, -Math.floor((i + 1) / 2))
    const shift: 'day' | 'night' = i % 2 === 0 ? 'night' : 'day'
    return {
      id: `ho-${i + 1}`,
      shift,
      at: at(day, shift === 'night' ? 9 : 21, 5),
      by: shift === 'night' ? STAFF.reception[2]! : STAFF.reception[i % 2]!,
      to: shift === 'night' ? STAFF.reception[0]! : STAFF.reception[2]!,
      note:
        i === 0
          ? '304 gece 02:00 gürültü şikâyeti, uyarıldı. 101 kahvaltıyı odada istiyor. Kasa sayıldı, doğru.'
          : i === 1
            ? 'Booking iki yeni rezervasyon geldi, takvime işlendi. 502 erken giriş sordu.'
            : 'Olağan. Çamaşırhane 14:00 teslim aldı.',
      readAt: i === 0 ? null : at(day, shift === 'night' ? 9 : 21, 20),
      summary: {
        arrivals: 4 - i,
        departures: 3,
        kbsGaps: i === 0 ? 2 : 0,
        drawerTry: 1_250_000 - i * 80_000,
        openTasks: 3
      }
    }
  })

  const notes: DemoNote[] = [
    {
      id: 'n1',
      kind: 'board',
      text: 'Cumartesi 10:00–12:00 su kesintisi (İSKİ duyurusu). Misafirlere hatırlatın.',
      by: STAFF.manager,
      at: at(addDays(today, -1), 14),
      pinned: true
    },
    {
      id: 'n2',
      kind: 'board',
      text: 'Yeni Wi‑Fi şifresi lobide asılı.',
      by: STAFF.manager,
      at: at(addDays(today, -3), 9),
      pinned: false
    },
    {
      id: 'n3',
      kind: 'board',
      text: 'Kat 3 koridor ampulü değişti.',
      by: STAFF.housekeeping[0]!,
      at: at(addDays(today, -2), 16),
      pinned: false
    },
    {
      id: 'n4',
      kind: 'personal',
      text: 'Ödeme takibi: 203 kalan bakiye cuma.',
      by: STAFF.reception[0]!,
      at: at(today, 9, 15),
      pinned: false
    }
  ]

  const lostItems: DemoLostItem[] = [
    {
      id: 'l1',
      foundAt: addDays(today, -1),
      place: 'Oda',
      roomNumber: '202',
      description: 'Siyah şarj aleti (USB‑C)',
      foundBy: STAFF.housekeeping[0]!,
      status: 'stored',
      guestName: 'Lukas Weber',
      storage: 'Resepsiyon çekmece 2'
    },
    {
      id: 'l2',
      foundAt: addDays(today, -4),
      place: 'Lobi',
      roomNumber: null,
      description: 'Mavi şemsiye',
      foundBy: STAFF.reception[0]!,
      status: 'stored',
      guestName: null,
      storage: 'Depo'
    },
    {
      id: 'l3',
      foundAt: addDays(today, -6),
      place: 'Oda',
      roomNumber: '401',
      description: 'Gümüş küpe (tek)',
      foundBy: STAFF.housekeeping[1]!,
      status: 'returned',
      guestName: 'Anna Smirnova',
      storage: 'Kasa'
    },
    {
      id: 'l4',
      foundAt: addDays(today, -40),
      place: 'Kahvaltı salonu',
      roomNumber: null,
      description: 'Okuma gözlüğü',
      foundBy: STAFF.reception[1]!,
      status: 'disposed',
      guestName: null,
      storage: '—'
    },
    {
      id: 'l5',
      foundAt: addDays(today, -2),
      place: 'Oda',
      roomNumber: '503',
      description: 'Kitap: "Istanbul" (İngilizce)',
      foundBy: STAFF.housekeeping[0]!,
      status: 'stored',
      guestName: 'Emily Taylor',
      storage: 'Resepsiyon raf'
    }
  ]

  const issues: DemoIssue[] = [
    {
      id: 'i1',
      roomNumber: '303',
      area: null,
      title: 'Duvarda nem ve boya kabarması',
      detail: 'Banyo duvarı arkası. Usta pazartesi geliyor.',
      severity: 'urgent',
      status: 'planned',
      reportedBy: STAFF.housekeeping[0]!,
      reportedAt: at(addDays(today, -3), 11),
      plannedFor: addDays(today, 1),
      resolvedAt: null,
      photos: 3,
      blocksRoom: true
    },
    {
      id: 'i2',
      roomNumber: '204',
      area: null,
      title: 'Klima su damlatıyor',
      detail: 'Filtre ve tahliye borusu.',
      severity: 'medium',
      status: 'open',
      reportedBy: STAFF.reception[2]!,
      reportedAt: at(today, 7, 50),
      plannedFor: null,
      resolvedAt: null,
      photos: 1,
      blocksRoom: false
    },
    {
      id: 'i3',
      roomNumber: '302',
      area: null,
      title: 'Lavabo gideri yavaş',
      detail: '',
      severity: 'low',
      status: 'resolved',
      reportedBy: STAFF.housekeeping[1]!,
      reportedAt: at(addDays(today, -2), 10),
      plannedFor: null,
      resolvedAt: at(addDays(today, -1), 15),
      photos: 0,
      blocksRoom: false
    },
    {
      id: 'i4',
      roomNumber: null,
      area: 'Lobi',
      title: 'Giriş kapısı otomatiği takılıyor',
      detail: 'Sabah soğukta.',
      severity: 'medium',
      status: 'open',
      reportedBy: STAFF.reception[0]!,
      reportedAt: at(addDays(today, -1), 9),
      plannedFor: null,
      resolvedAt: null,
      photos: 0,
      blocksRoom: false
    },
    {
      id: 'i5',
      roomNumber: '101',
      area: null,
      title: 'TV kumandası çalışmıyor',
      detail: 'Pil değişti, yine çalışmıyor.',
      severity: 'low',
      status: 'open',
      reportedBy: STAFF.reception[1]!,
      reportedAt: at(addDays(today, -1), 20),
      plannedFor: null,
      resolvedAt: null,
      photos: 0,
      blocksRoom: false
    },
    {
      id: 'i6',
      roomNumber: null,
      area: 'Çatı',
      title: 'Su deposu şamandırası',
      detail: '',
      severity: 'urgent',
      status: 'open',
      reportedBy: STAFF.manager,
      reportedAt: at(today, 9, 10),
      plannedFor: null,
      resolvedAt: null,
      photos: 2,
      blocksRoom: false
    }
  ]

  const maintenance: DemoMaintenance[] = [
    {
      id: 'm1',
      title: 'Su deposu temizliği',
      everyMonths: 6,
      lastDone: addDays(today, -176),
      nextDue: addDays(today, 4),
      contact: 'Temiz Su Ltd.'
    },
    {
      id: 'm2',
      title: 'Klima filtreleri (tüm odalar)',
      everyMonths: 3,
      lastDone: addDays(today, -100),
      nextDue: addDays(today, -8),
      contact: null
    },
    {
      id: 'm3',
      title: 'Yangın tüpleri',
      everyMonths: 12,
      lastDone: addDays(today, -353),
      nextDue: addDays(today, 12),
      contact: 'Güvenlik Yangın'
    },
    {
      id: 'm4',
      title: 'Asansör periyodik bakım',
      everyMonths: 1,
      lastDone: addDays(today, -20),
      nextDue: addDays(today, 10),
      contact: 'Asansör Servis'
    },
    {
      id: 'm5',
      title: 'Kombi / sıcak su',
      everyMonths: 12,
      lastDone: addDays(today, -200),
      nextDue: addDays(today, 165),
      contact: 'Isı Teknik'
    },
    {
      id: 'm6',
      title: 'Haşere ilaçlama',
      everyMonths: 6,
      lastDone: addDays(today, -60),
      nextDue: addDays(today, 120),
      contact: null
    }
  ]

  const schedule = (seed: number): DemoEmployee['schedule'] =>
    Array.from({ length: 14 }, (_, i) => (i % 7 === seed % 7 ? 'rest' : seed === 2 ? 'night' : 'work'))
  const employees: DemoEmployee[] = [
    {
      id: 'e1',
      name: STAFF.reception[0]!,
      position: 'Resepsiyon',
      startDate: localDate('2024-03-01'),
      monthlyMinor: 4_000_000,
      roleCode: 'reception',
      phone: '+90 532 000 11 22',
      leaveEntitled: 4,
      leaveUsed: 1,
      advancesMinor: 500_000,
      paidMinor: 0,
      netMinor: 3_900_000,
      overtimeMinutes: 0,
      locked: false,
      schedule: schedule(0)
    },
    {
      id: 'e2',
      name: STAFF.reception[1]!,
      position: 'Resepsiyon',
      startDate: localDate('2025-06-15'),
      monthlyMinor: 3_800_000,
      roleCode: 'reception',
      phone: '+90 533 000 22 33',
      leaveEntitled: 4,
      leaveUsed: 2,
      advancesMinor: 0,
      paidMinor: 0,
      netMinor: 3_926_667,
      overtimeMinutes: 0,
      locked: false,
      schedule: schedule(1)
    },
    {
      id: 'e3',
      name: STAFF.reception[2]!,
      position: 'Gece resepsiyonu',
      startDate: localDate('2023-11-01'),
      monthlyMinor: 4_200_000,
      roleCode: 'reception',
      phone: '+90 534 000 33 44',
      leaveEntitled: 4,
      leaveUsed: 0,
      advancesMinor: 1_000_000,
      paidMinor: 0,
      netMinor: 3_760_000,
      overtimeMinutes: 0,
      locked: false,
      schedule: schedule(2)
    },
    {
      id: 'e4',
      name: STAFF.housekeeping[0]!,
      position: 'Kat görevlisi',
      startDate: localDate('2022-05-10'),
      monthlyMinor: 3_500_000,
      roleCode: 'housekeeping',
      phone: '+90 535 000 44 55',
      leaveEntitled: 4,
      leaveUsed: 3,
      advancesMinor: 0,
      paidMinor: 0,
      netMinor: 3_616_667,
      overtimeMinutes: 0,
      locked: false,
      schedule: schedule(3)
    },
    {
      id: 'e5',
      name: STAFF.housekeeping[1]!,
      position: 'Kat görevlisi',
      startDate: localDate('2025-09-01'),
      monthlyMinor: 3_500_000,
      roleCode: 'housekeeping',
      phone: '+90 536 000 55 66',
      leaveEntitled: 4,
      leaveUsed: 1,
      advancesMinor: 250_000,
      paidMinor: 0,
      netMinor: 3_600_000,
      overtimeMinutes: 0,
      locked: false,
      schedule: schedule(4)
    },
    {
      id: 'e6',
      name: STAFF.manager,
      position: 'Müdür',
      startDate: localDate('2021-01-04'),
      monthlyMinor: 6_000_000,
      roleCode: 'manager',
      phone: '+90 537 000 66 77',
      leaveEntitled: 4,
      leaveUsed: 1,
      advancesMinor: 0,
      paidMinor: 0,
      netMinor: 6_600_000,
      overtimeMinutes: 0,
      locked: false,
      schedule: schedule(5)
    }
  ]

  const contacts: DemoContact[] = [
    {
      id: 'c1',
      category: 'laundry',
      name: 'Beyaz Çamaşırhane',
      person: 'Recep Bey',
      phone: '+90 216 111 22 33',
      note: 'Salı ve cuma 14:00 teslim',
      favorite: true
    },
    {
      id: 'c2',
      category: 'plumber',
      name: 'Usta Tesisat',
      person: 'Yusuf Usta',
      phone: '+90 532 111 22 33',
      note: null,
      favorite: true
    },
    {
      id: 'c3',
      category: 'electrician',
      name: 'Işık Elektrik',
      person: 'Cem Bey',
      phone: '+90 533 222 33 44',
      note: '7/24 acil',
      favorite: false
    },
    {
      id: 'c4',
      category: 'supplier',
      name: 'Merkez Toptan Gıda',
      person: null,
      phone: '+90 216 222 33 44',
      note: 'Çarşamba sipariş, perşembe teslim',
      favorite: false
    },
    {
      id: 'c5',
      category: 'supplier',
      name: 'Temizlik Dünyası',
      person: 'Sena Hanım',
      phone: '+90 216 333 44 55',
      note: null,
      favorite: false
    },
    {
      id: 'c6',
      category: 'taxi',
      name: 'Moda Taksi',
      person: null,
      phone: '+90 216 444 55 66',
      note: 'Havalimanı sabit ücret',
      favorite: true
    },
    {
      id: 'c7',
      category: 'emergency',
      name: 'Acil (Ambulans, polis, itfaiye)',
      person: null,
      phone: '112',
      note: null,
      favorite: true
    },
    {
      id: 'c8',
      category: 'other',
      name: 'Asansör Servis',
      person: 'Teknik ekip',
      phone: '+90 212 555 66 77',
      note: 'Bakım sözleşmesi no 4471',
      favorite: false
    }
  ]

  const cat = {
    cleaning: i18n('Temizlik malzemeleri', 'Cleaning supplies', 'Моющие средства'),
    drinks: i18n('Su ve içecek', 'Water and drinks', 'Вода и напитки'),
    breakfast: i18n('Kahvaltı', 'Breakfast', 'Завтрак'),
    amenities: i18n('Banyo / misafir ürünleri', 'Bathroom / guest amenities', 'Косметика для гостей'),
    paper: i18n('Kâğıt ürünleri', 'Paper products', 'Бумажные изделия')
  }
  const products: DemoProduct[] = [
    {
      id: 'p1',
      name: 'Çamaşır deterjanı',
      category: cat.cleaning,
      unit: 'kg',
      lastUnitMinor: 12_600,
      previousUnitMinor: 10_500,
      lastBought: today,
      monthQty: 11.5,
      stock: 6
    },
    {
      id: 'p2',
      name: 'Yumuşatıcı',
      category: cat.cleaning,
      unit: 'lt',
      lastUnitMinor: 11_000,
      previousUnitMinor: 11_000,
      lastBought: today,
      monthQty: 6,
      stock: 4
    },
    {
      id: 'p3',
      name: 'Damacana su (19 lt)',
      category: cat.drinks,
      unit: 'piece',
      lastUnitMinor: 12_000,
      previousUnitMinor: 10_000,
      lastBought: addDays(today, -6),
      monthQty: 24,
      stock: null
    },
    {
      id: 'p4',
      name: 'Beyaz peynir',
      category: cat.breakfast,
      unit: 'kg',
      lastUnitMinor: 42_000,
      previousUnitMinor: 39_500,
      lastBought: addDays(today, -5),
      monthQty: 8,
      stock: null
    },
    {
      id: 'p5',
      name: 'Siyah zeytin',
      category: cat.breakfast,
      unit: 'kg',
      lastUnitMinor: 28_000,
      previousUnitMinor: 30_000,
      lastBought: addDays(today, -5),
      monthQty: 5,
      stock: null
    },
    {
      id: 'p6',
      name: 'Şampuan (otel boy)',
      category: cat.amenities,
      unit: 'pack',
      lastUnitMinor: 64_000,
      previousUnitMinor: 64_000,
      lastBought: addDays(today, -15),
      monthQty: 3,
      stock: 2
    },
    {
      id: 'p7',
      name: 'Tuvalet kâğıdı',
      category: cat.paper,
      unit: 'pack',
      lastUnitMinor: 34_900,
      previousUnitMinor: 29_900,
      lastBought: addDays(today, -9),
      monthQty: 6,
      stock: 5
    },
    {
      id: 'p8',
      name: 'Çay (kg)',
      category: cat.breakfast,
      unit: 'kg',
      lastUnitMinor: 31_000,
      previousUnitMinor: null,
      lastBought: addDays(today, -2),
      monthQty: 2,
      stock: null
    }
  ]

  const laundryLines: DemoLaundryLine[] = [
    {
      itemCode: 'sheet',
      name: i18n('Çarşaf', 'Sheet', 'Простыня'),
      out: 96,
      in: 90,
      stained: 2,
      unitMinor: 1_200
    },
    {
      itemCode: 'duvet_cover',
      name: i18n('Nevresim / yorgan kılıfı', 'Duvet cover', 'Пододеяльник'),
      out: 64,
      in: 62,
      stained: 1,
      unitMinor: 1_800
    },
    {
      itemCode: 'pillowcase',
      name: i18n('Yastık kılıfı', 'Pillowcase', 'Наволочка'),
      out: 128,
      in: 128,
      stained: 0,
      unitMinor: 500
    },
    {
      itemCode: 'bath_towel',
      name: i18n('Büyük havlu', 'Bath towel', 'Банное полотенце'),
      out: 110,
      in: 101,
      stained: 3,
      unitMinor: 900
    },
    {
      itemCode: 'hand_towel',
      name: i18n('Küçük havlu', 'Hand towel', 'Полотенце для рук'),
      out: 90,
      in: 90,
      stained: 0,
      unitMinor: 500
    },
    {
      itemCode: 'bath_mat',
      name: i18n('Ayak havlusu', 'Bath mat', 'Полотенце для ног'),
      out: 60,
      in: 57,
      stained: 0,
      unitMinor: 400
    },
    {
      itemCode: 'bathrobe',
      name: i18n('Bornoz', 'Bathrobe', 'Халат'),
      out: 12,
      in: 10,
      stained: 0,
      unitMinor: 2_500
    }
  ]
  const laundryDeliveries = [-1, -4, -8, -11, -15, -18].flatMap((offset, i) => [
    {
      id: `ld-out-${i}`,
      date: addDays(today, offset),
      direction: 'out' as const,
      pieces: 80 + ((i * 13) % 40),
      by: STAFF.housekeeping[i % 2]!
    },
    ...(i > 0
      ? [
          {
            id: `ld-in-${i}`,
            date: addDays(today, offset + 2),
            direction: 'in' as const,
            pieces: 78 + ((i * 11) % 40),
            by: STAFF.housekeeping[(i + 1) % 2]!
          }
        ]
      : [])
  ])

  const fxHistory = (rate: number, seed: number): number[] =>
    Array.from(
      { length: 14 },
      (_, i) => rate - (13 - i) * Math.round(rate / 4000) + ((i * seed) % 5) * Math.round(rate / 20000)
    )
  const fx: DemoFxRate[] = Object.entries(FX).map(([currency, rateMicro], i) => ({
    currency,
    rateMicro,
    source: currency === 'EUR' ? ('hotel' as const) : ('market_mid' as const),
    at: currency === 'EUR' ? at(addDays(today, -2), 9) : at(today, 9, 0),
    history: fxHistory(rateMicro, i + 2)
  }))

  const SYMBOLS = [
    'partlycloudy_day',
    'clearsky_day',
    'fair_day',
    'rain',
    'lightrain',
    'cloudy',
    'rainshowers_day'
  ]
  const weather = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(today, i),
    symbol: SYMBOLS[(i * 3 + 1) % SYMBOLS.length]!,
    maxC: 19 + ((i * 7) % 5) - (i > 4 ? 2 : 0),
    minC: 12 + ((i * 5) % 3),
    rainMm: SYMBOLS[(i * 3 + 1) % SYMBOLS.length]!.includes('rain') ? 2 + (i % 4) : 0
  }))

  const prevMonth = addDays(localDate(`${today.slice(0, 7)}-01`), -1).slice(0, 7)
  const tourismRows: DemoTourismRow[] = [
    {
      country: i18n('Türkiye', 'Türkiye', 'Турция'),
      iso: 'TR',
      arrivals: 248,
      nights: 331,
      programArrivals: 247
    },
    {
      country: i18n('Rusya Federasyonu', 'Russia', 'Россия'),
      iso: 'RU',
      arrivals: 92,
      nights: 168,
      programArrivals: 92
    },
    {
      country: i18n('Almanya', 'Germany', 'Германия'),
      iso: 'DE',
      arrivals: 41,
      nights: 77,
      programArrivals: 41
    },
    {
      country: i18n('Birleşik Krallık', 'United Kingdom', 'Великобритания'),
      iso: 'GB',
      arrivals: 29,
      nights: 52,
      programArrivals: 30
    },
    { country: i18n('İran', 'Iran', 'Иран'), iso: 'IR', arrivals: 26, nights: 39, programArrivals: 26 },
    {
      country: i18n('Azerbaycan', 'Azerbaijan', 'Азербайджан'),
      iso: 'AZ',
      arrivals: 22,
      nights: 31,
      programArrivals: 21
    },
    {
      country: i18n('ABD', 'United States', 'США'),
      iso: 'US',
      arrivals: 19,
      nights: 40,
      programArrivals: 19
    },
    {
      country: i18n('Fransa', 'France', 'Франция'),
      iso: 'FR',
      arrivals: 17,
      nights: 28,
      programArrivals: 17
    },
    {
      country: i18n('Suudi Arabistan', 'Saudi Arabia', 'Саудовская Аравия'),
      iso: 'SA',
      arrivals: 15,
      nights: 33,
      programArrivals: 15
    },
    {
      country: i18n('Ukrayna', 'Ukraine', 'Украина'),
      iso: 'UA',
      arrivals: 14,
      nights: 22,
      programArrivals: 14
    },
    {
      country: i18n('Kazakistan', 'Kazakhstan', 'Казахстан'),
      iso: 'KZ',
      arrivals: 12,
      nights: 18,
      programArrivals: 12
    },
    {
      country: i18n('Hollanda', 'Netherlands', 'Нидерланды'),
      iso: 'NL',
      arrivals: 10,
      nights: 16,
      programArrivals: 10
    },
    {
      country: i18n('KKTC', 'Northern Cyprus', 'Северный Кипр'),
      iso: 'CY-N',
      arrivals: 6,
      nights: 7,
      programArrivals: 6
    }
  ]

  const monthly: DemoMonthlyReport[] = Array.from({ length: 12 }, (_, i) => {
    const d = addDays(localDate(`${today.slice(0, 7)}-15`), -30 * (11 - i))
    const season = [0.62, 0.6, 0.66, 0.74, 0.8, 0.88, 0.95, 0.97, 0.9, 0.82, 0.7, 0.68][
      Number(d.slice(5, 7)) - 1
    ]!
    const sellableNights = 19 * 30
    const soldNights = Math.round(sellableNights * season)
    const roomRevenueMinor = soldNights * (260_000 + Math.round(season * 80_000))
    return {
      month: d.slice(0, 7),
      revenueMinor: roomRevenueMinor + 1_200_000,
      roomRevenueMinor,
      expensesMinor: 9_000_000 + Math.round(season * 6_000_000),
      staffMinor: 25_000_000,
      soldNights,
      sellableNights
    }
  })

  const specialDays = holidays(today)

  return {
    today,
    now,
    currency: 'TRY',
    hotelName: 'Lale Suit Otel',
    rooms,
    channels: CHANNELS,
    methods: METHODS,
    companies,
    guests,
    blacklist: [
      {
        id: 'b1',
        name: 'Viktor Kaminski',
        phone: '+48 600 000 000',
        reason: 'Odada sigara, hasar ödemedi',
        addedAt: addDays(today, -120),
        severity: 'block'
      },
      {
        id: 'b2',
        name: 'Tarık Ekinci',
        phone: '+90 530 000 00 99',
        reason: 'İki kez gelmedi (no-show), kapora vermedi',
        addedAt: addDays(today, -45),
        severity: 'warn'
      }
    ],
    reservations,
    blocks,
    specialDays,
    customTags,
    saleFolios,
    expenses,
    tasks,
    handovers,
    notes,
    lostItems,
    issues,
    maintenance,
    employees,
    contacts,
    products,
    laundry: {
      contact: 'Beyaz Çamaşırhane',
      lines: laundryLines,
      deliveries: laundryDeliveries,
      invoiceMinor: 2_000_000
    },
    fx,
    weather,
    tourism: {
      month: prevMonth,
      rows: tourismRows,
      review: [
        { raw: 'TÜRKYİE', suggestion: i18n('Türkiye', 'Türkiye', 'Турция'), rows: 2, kind: 'typo' },
        { raw: 'KIBRIS', suggestion: null, rows: 1, kind: 'ambiguous' },
        { raw: 'SSCB', suggestion: i18n('Rusya Federasyonu', 'Russia', 'Россия'), rows: 1, kind: 'historic' }
      ],
      sameDay: 31,
      beds: 38
    },
    monthly,
    users: [
      {
        id: 'u1',
        name: 'Sahip',
        roleCode: 'owner',
        active: true,
        lastSeen: at(today, 8, 5),
        device: 'MacBook'
      },
      {
        id: 'u2',
        name: STAFF.manager,
        roleCode: 'manager',
        active: true,
        lastSeen: at(today, 10, 2),
        device: 'Resepsiyon PC'
      },
      {
        id: 'u3',
        name: STAFF.reception[0]!,
        roleCode: 'reception',
        active: true,
        lastSeen: at(today, 10, 28),
        device: 'Resepsiyon PC'
      },
      {
        id: 'u4',
        name: STAFF.reception[2]!,
        roleCode: 'reception',
        active: true,
        lastSeen: at(today, 9, 3),
        device: 'Resepsiyon PC'
      },
      {
        id: 'u5',
        name: STAFF.housekeeping[0]!,
        roleCode: 'housekeeping',
        active: true,
        lastSeen: null,
        device: null
      },
      {
        id: 'u6',
        name: 'Muhasebe',
        roleCode: 'accountant',
        active: false,
        lastSeen: at(addDays(today, -30), 15),
        device: null
      }
    ],
    devices: [
      {
        id: 'd1',
        name: 'Resepsiyon PC',
        kind: 'desktop',
        user: STAFF.reception[0]!,
        lastSeen: at(today, 10, 28),
        ip: null,
        trusted: true
      },
      {
        id: 'd2',
        name: 'Sahibin MacBook',
        kind: 'desktop',
        user: 'Sahip',
        lastSeen: at(today, 8, 5),
        ip: '100.64.0.7',
        trusted: true
      },
      {
        id: 'd3',
        name: 'Sahibin telefonu',
        kind: 'mobile',
        user: 'Sahip',
        lastSeen: at(addDays(today, -1), 22, 40),
        ip: '100.64.0.9',
        trusted: true
      }
    ]
  }
}

/** Turkish public holidays near `today` for the calendar badges (the real list comes from date-holidays). */
function holidays(today: LocalDate): DemoSpecialDay[] {
  const fixed: [string, DemoSpecialDay['kind'], I18nText][] = [
    ['01-01', 'holiday', i18n('Yılbaşı', "New Year's Day", 'Новый год')],
    [
      '04-23',
      'holiday',
      i18n(
        'Ulusal Egemenlik ve Çocuk Bayramı',
        'National Sovereignty and Children’s Day',
        'День национального суверенитета и детей'
      )
    ],
    ['05-01', 'holiday', i18n('Emek ve Dayanışma Günü', 'Labour Day', 'День труда')],
    [
      '05-19',
      'holiday',
      i18n('Atatürk’ü Anma, Gençlik ve Spor Bayramı', 'Youth and Sports Day', 'День молодёжи и спорта')
    ],
    [
      '07-15',
      'holiday',
      i18n(
        'Demokrasi ve Millî Birlik Günü',
        'Democracy and National Unity Day',
        'День демократии и национального единства'
      )
    ],
    ['08-30', 'holiday', i18n('Zafer Bayramı', 'Victory Day', 'День Победы')],
    ['10-28', 'half_holiday', i18n('Cumhuriyet Bayramı arifesi', 'Republic Day eve', 'Канун Дня Республики')],
    ['10-29', 'holiday', i18n('Cumhuriyet Bayramı', 'Republic Day', 'День Республики')]
  ]
  const year = Number(today.slice(0, 4))
  const out: DemoSpecialDay[] = []
  for (const y of [year, year + 1])
    for (const [md, kind, name] of fixed) {
      const date = localDate(`${y}-${md}`)
      if (Math.abs(diffDays(today, date)) <= 120) out.push({ date, kind, name })
    }
  out.push({
    date: addDays(today, 6),
    kind: 'event',
    name: i18n('İstanbul Maratonu', 'Istanbul Marathon', 'Стамбульский марафон')
  })
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
