import { describe, expect, it } from 'vitest'
import { localDate, type LocalDate } from '../date'
import {
  DEFAULT_PAY_POLICY,
  computeSalaryPeriod,
  minutesWorked,
  parseDecimalRatio,
  employedIn,
  employedRange,
  salaryForMonth,
  salaryOn,
  suggestedOvertimeMinutes,
  type LeaveEntry,
  type PayPolicy,
  type SalaryHistoryEntry,
  type SalaryPeriodInput,
  type StaffTxnEntry,
  type WorkEntry
} from './salary'

// All amounts are TRY kuruş: 4_000_000 = 40.000,00 TL.
const YEAR = 2026
const d = (value: string): LocalDate => localDate(value)
const mm = (month: number): string => String(month).padStart(2, '0')

const history = (...entries: [string, number][]): SalaryHistoryEntry[] =>
  entries.map(([validFrom, monthlyMinor]) => ({ validFrom: d(validFrom), monthlyMinor, currency: 'TRY' }))

/** `n` rest days on the 1st…nth of the month. */
const restDays = (year: number, month: number, n: number): LeaveEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    date: d(`${year}-${mm(month)}-${String(i + 1).padStart(2, '0')}`),
    kind: 'rest_day' as const
  }))

const txn = (kind: StaffTxnEntry['kind'], amountMinor: number): StaffTxnEntry => ({
  kind,
  amountMinor,
  currency: 'TRY'
})

const work = (
  date: string,
  minutes: number,
  overtimeMinutes = 0,
  kind: WorkEntry['kind'] = 'normal'
): WorkEntry => ({
  date: d(date),
  kind,
  minutesWorked: minutes,
  overtimeMinutes
})

/** Input fields to change; `policy` is merged over the Lale defaults. */
type Overrides = Partial<Omit<SalaryPeriodInput, 'policy'>> & { policy?: Partial<PayPolicy> }

function period(overrides: Overrides = {}): SalaryPeriodInput {
  const { policy, ...rest } = overrides
  return {
    year: YEAR,
    month: 9,
    salaryHistory: history(['2025-01-01', 4_000_000]),
    leave: [],
    work: [],
    txns: [],
    ...rest,
    policy: { ...DEFAULT_PAY_POLICY, ...policy }
  }
}

/** Eylül Deniz from the owner's Excel: 40.000, advance 12.500, rest days 4/1/3. */
const denizEylul = (overrides: Overrides = {}): SalaryPeriodInput =>
  period({ leave: restDays(YEAR, 9, 1), txns: [txn('advance', 1_250_000)], ...overrides })

describe('computeSalaryPeriod · Excel ile doğrulanmış örnekler', () => {
  it('Eylül Deniz: 40.000 maaş, 12.500 avans, izin 4/1/3 → net 31.500,00', () => {
    const r = computeSalaryPeriod(denizEylul())
    expect(r).toMatchObject({
      currency: 'TRY',
      monthly: 4_000_000,
      daily: 133_333,
      leaveEntitled: 4,
      leaveUsed: 1,
      leaveLeft: 3,
      leavePayout: 400_000,
      advances: 1_250_000,
      net: 3_150_000,
      paid: 0,
      remaining: 3_150_000
    })
  })

  it('Haziran Ece: 35.000 maaş, 35.005 avans, izin 4/2/2 → net 2.328,33 (ekranda 2.328)', () => {
    const r = computeSalaryPeriod(
      period({
        month: 6,
        salaryHistory: history(['2025-01-01', 3_500_000]),
        leave: restDays(YEAR, 6, 2),
        txns: [txn('advance', 3_500_500)]
      })
    )
    expect(r.leavePayout).toBe(233_333)
    expect(r.net).toBe(232_833)
  })

  it('Haziran Deniz: 40.000 maaş, 36.000 avans, izin 4/2/2 → net 6.666,67 (ekranda 6.667)', () => {
    const r = computeSalaryPeriod(
      period({ month: 6, leave: restDays(YEAR, 6, 2), txns: [txn('advance', 3_600_000)] })
    )
    expect(r.leavePayout).toBe(266_667)
    expect(r.net).toBe(666_667)
  })

  it('hiç izin kullanılmazsa izin parası 40.000 ÷ 30 × 4 = 5.333,33', () => {
    expect(computeSalaryPeriod(period()).leavePayout).toBe(533_333)
  })

  it('deniz 4 izin parası = 4.000 (maaş 30.000 iken)', () => {
    const r = computeSalaryPeriod(period({ salaryHistory: history(['2025-01-01', 3_000_000]) }))
    expect(r.leavePayout).toBe(400_000)
  })

  it('avans maaşı aşarsa net eksiye düşer', () => {
    const r = computeSalaryPeriod(period({ leave: restDays(YEAR, 9, 4), txns: [txn('advance', 4_100_000)] }))
    expect(r.net).toBe(-100_000)
    expect(r.remaining).toBe(-100_000)
  })
})

// Synthetic 12-month table built with the Excel formula (net = maaş − avans + maaş ÷ 30 × kalan izin).
// [ay, avans, kullanılan izin, izin parası, net]
type TableRow = [number, number, number, number, number]

const TABLE: { name: string; salaryHistory: SalaryHistoryEntry[]; rows: TableRow[] }[] = [
  {
    // 30.000 → 40.000 zammı 15 Ocak'ta: Ocak hâlâ 30.000, Şubat'tan itibaren 40.000.
    name: 'Deniz',
    salaryHistory: history(['2025-06-01', 3_000_000], ['2026-01-15', 4_000_000]),
    rows: [
      [1, 1_000_000, 0, 400_000, 2_400_000],
      [2, 1_500_000, 1, 400_000, 2_900_000],
      [3, 2_000_000, 2, 266_667, 2_266_667],
      [4, 0, 4, 0, 4_000_000],
      [5, 3_000_000, 3, 133_333, 1_133_333],
      [6, 3_600_000, 2, 266_667, 666_667],
      [7, 2_500_000, 5, 0, 1_500_000],
      [8, 1_250_000, 0, 533_333, 3_283_333],
      [9, 1_250_000, 1, 400_000, 3_150_000],
      [10, 4_000_000, 4, 0, 0],
      [11, 4_100_000, 4, 0, -100_000],
      [12, 2_000_000, 3, 133_333, 2_133_333]
    ]
  },
  {
    // Yıl ortası zam: valid_from 1 Temmuz → Haziran 35.000, Temmuz 38.000.
    name: 'Ece',
    salaryHistory: history(['2026-07-01', 3_800_000], ['2025-03-01', 3_500_000]),
    rows: [
      [1, 500_000, 2, 233_333, 3_233_333],
      [2, 2_000_000, 4, 0, 1_500_000],
      [3, 1_000_000, 1, 350_000, 2_850_000],
      [4, 0, 0, 466_667, 3_966_667],
      [5, 3_400_000, 3, 116_667, 216_667],
      [6, 3_500_500, 2, 233_333, 232_833],
      [7, 1_800_000, 2, 253_333, 2_253_333],
      [8, 0, 4, 0, 3_800_000],
      [9, 1_900_000, 1, 380_000, 2_280_000],
      [10, 3_800_000, 0, 506_667, 506_667],
      [11, 750_000, 3, 126_667, 3_176_667],
      [12, 3_000_000, 2, 253_333, 1_053_333]
    ]
  },
  {
    name: 'Deniz',
    salaryHistory: history(['2024-09-01', 3_200_000]),
    rows: [
      [1, 1_600_000, 4, 0, 1_600_000],
      [2, 800_000, 2, 213_333, 2_613_333],
      [3, 0, 1, 320_000, 3_520_000],
      [4, 1_200_000, 3, 106_667, 2_106_667],
      [5, 3_200_000, 0, 426_667, 426_667],
      [6, 2_000_000, 2, 213_333, 1_413_333],
      [7, 1_000_000, 4, 0, 2_200_000],
      [8, 1_550_000, 1, 320_000, 1_970_000],
      [9, 0, 0, 426_667, 3_626_667],
      [10, 3_199_999, 3, 106_667, 106_668],
      [11, 1_234_567, 2, 213_333, 2_178_766],
      [12, 0, 4, 0, 3_200_000]
    ]
  }
]

describe("computeSalaryPeriod · Excel'in 12 ayı (3 çalışan, 30 bölen, devir yok)", () => {
  for (const employee of TABLE) {
    it(`${employee.name}: Ocak–Aralık izin parası ve net Excel formülüyle aynı`, () => {
      for (const [month, advance, used, payout, net] of employee.rows) {
        const r = computeSalaryPeriod(
          period({
            month,
            salaryHistory: employee.salaryHistory,
            // Rest days of neighbouring months must not count.
            leave: [...restDays(YEAR, month, used), ...restDays(YEAR, (month % 12) + 1, 2)],
            txns: advance > 0 ? [txn('advance', advance)] : []
          })
        )
        expect({ month, used: r.leaveUsed, payout: r.leavePayout, net: r.net }).toEqual({
          month,
          used,
          payout,
          net
        })
        expect(r.remaining).toBe(net)
      }
    })
  }

  it('Ocak ayında zam 15 Ocak geçerliyse Ocak eski maaşla, Şubat yeni maaşla hesaplanır', () => {
    const deniz = TABLE[0]?.salaryHistory ?? []
    expect(computeSalaryPeriod(period({ month: 1, salaryHistory: deniz })).monthly).toBe(3_000_000)
    expect(computeSalaryPeriod(period({ month: 2, salaryHistory: deniz })).monthly).toBe(4_000_000)
  })
})

describe('computeSalaryPeriod · günlük bölen (30 ya da ayın gün sayısı)', () => {
  const feb = (dailyDivisor: PayPolicy['dailyDivisor'], year = YEAR) =>
    computeSalaryPeriod(
      period({
        year,
        month: 2,
        leave: restDays(year, 2, 1),
        txns: [txn('advance', 1_500_000)],
        policy: { dailyDivisor }
      })
    )

  it('Şubat, 30 bölen: günlük 1.333,33; 3 gün izin parası 4.000; net 29.000', () => {
    expect(feb(30)).toMatchObject({ daily: 133_333, leavePayout: 400_000, net: 2_900_000 })
  })

  it('Şubat, ayın gün sayısı (28): günlük 1.428,57; 3 gün izin parası 4.285,71; net 29.285,71', () => {
    expect(feb('days_in_month')).toMatchObject({ daily: 142_857, leavePayout: 428_571, net: 2_928_571 })
  })

  it('artık yıl Şubat (2028, 29 gün): 3 gün izin parası 4.137,93', () => {
    expect(feb('days_in_month', 2028).leavePayout).toBe(413_793)
  })

  it('31 günlük ay: 40.000 ÷ 31 × 2 = 2.580,65 (yarım kuruş yukarı)', () => {
    const r = computeSalaryPeriod(
      period({ month: 3, leave: restDays(YEAR, 3, 2), policy: { dailyDivisor: 'days_in_month' } })
    )
    expect(r.leavePayout).toBe(258_065)
  })
})

describe('computeSalaryPeriod · izin politikası', () => {
  it('aynı güne iki izin kaydı tek gün sayılır; yıllık/hastalık izni dinlenme gününden düşmez', () => {
    const leave: LeaveEntry[] = [
      ...restDays(YEAR, 9, 1),
      ...restDays(YEAR, 9, 1),
      { date: d('2026-09-10'), kind: 'annual' },
      { date: d('2026-09-11'), kind: 'sick' }
    ]
    expect(computeSalaryPeriod(denizEylul({ leave })).leaveUsed).toBe(1)
  })

  it('kullanılmayan izin ödenmiyorsa izin parası 0', () => {
    const r = computeSalaryPeriod(denizEylul({ policy: { unusedLeavePaid: false } }))
    expect(r.leaveLeft).toBe(3)
    expect(r.leavePayout).toBe(0)
    expect(r.net).toBe(2_750_000)
  })

  it('izin parası çarpanı 1,5: 40.000 ÷ 30 × 3 × 1,5 = 6.000', () => {
    expect(computeSalaryPeriod(denizEylul({ policy: { unusedLeaveMultiplier: '1.5' } })).leavePayout).toBe(
      600_000
    )
  })

  it('devir açıksa kalan izin ödenmez, devreden günler eklenir; kapalıyken devreden gün yok sayılır', () => {
    const on = computeSalaryPeriod(denizEylul({ carriedLeaveDays: 2, policy: { leaveCarryOver: true } }))
    expect(on).toMatchObject({ leaveCarriedIn: 2, leaveLeft: 5, leavePayout: 0, net: 2_750_000 })
    const off = computeSalaryPeriod(denizEylul({ carriedLeaveDays: 2 }))
    expect(off).toMatchObject({ leaveCarriedIn: 0, leaveLeft: 3, leavePayout: 400_000 })
  })

  it('izin hakkını aşan kullanım kesinti yapmaz (kalan izin 0)', () => {
    const r = computeSalaryPeriod(denizEylul({ leave: restDays(YEAR, 9, 6) }))
    expect(r).toMatchObject({ leaveUsed: 6, leaveLeft: 0, leavePayout: 0, net: 2_750_000 })
  })
})

describe('computeSalaryPeriod · mesai, bayram ve prim', () => {
  const overtime = [work('2026-09-03', 480, 60), work('2026-09-04', 480, 60), work('2026-08-31', 480, 600)]

  it('Lale (overtime_mode=none): ek mesai saati girilse bile ücret 0', () => {
    const r = computeSalaryPeriod(denizEylul({ work: overtime }))
    expect(r.overtimeMinutes).toBe(120)
    expect(r.overtimePay).toBe(0)
    expect(r.net).toBe(3_150_000)
  })

  it('çarpan modu: 2 saat × (40.000 ÷ 225 × 1,5) = 533,33 TL = 53.333 kuruş', () => {
    const r = computeSalaryPeriod(denizEylul({ work: overtime, policy: { overtimeMode: 'multiplier' } }))
    expect(r.hourly).toBe(17_778)
    expect(r.overtimePay).toBe(53_333)
    expect(r.net).toBe(3_150_000 + 53_333)
  })

  it('sabit saatlik mod: 3,5 saat × 250 TL = 875 TL; saatlik ücret yoksa hata', () => {
    const r = computeSalaryPeriod(
      denizEylul({
        work: [work('2026-09-03', 480, 210)],
        policy: { overtimeMode: 'hourly_fixed', overtimeHourlyMinor: 25_000 }
      })
    )
    expect(r.overtimePay).toBe(87_500)
    expect(() =>
      computeSalaryPeriod(denizEylul({ work: overtime, policy: { overtimeMode: 'hourly_fixed' } }))
    ).toThrow(RangeError)
  })

  it('bayram saatlik: 8 saat × 40.000 ÷ 225 × (2 − 1) = 1.422,22', () => {
    const r = computeSalaryPeriod(denizEylul({ work: [work('2026-09-15', 480, 0, 'holiday')] }))
    expect(r).toMatchObject({ holidayDays: 1, holidayMinutes: 480, holidayPay: 142_222 })
    expect(r.net).toBe(3_150_000 + 142_222)
  })

  it('bayram listesindeki güne girilen normal kayıt da bayram mesaisi sayılır', () => {
    const r = computeSalaryPeriod(
      denizEylul({
        work: [work('2026-09-15', 480), work('2026-09-16', 480)],
        holidayDates: [d('2026-09-15')]
      })
    )
    expect(r.holidayMinutes).toBe(480)
    expect(r.holidayPay).toBe(142_222)
  })

  it('bayram günlük: 1 gün × 40.000 ÷ 30 × (2 − 1) = 1.333,33; çarpan 2,5 saatlikte 2.133,33', () => {
    const holiday = [work('2026-09-15', 480, 0, 'holiday')]
    expect(
      computeSalaryPeriod(denizEylul({ work: holiday, policy: { holidayPayMode: 'daily' } })).holidayPay
    ).toBe(133_333)
    expect(
      computeSalaryPeriod(denizEylul({ work: holiday, policy: { holidayMultiplier: '2.5' } })).holidayPay
    ).toBe(213_333)
    expect(
      computeSalaryPeriod(denizEylul({ work: holiday, policy: { holidayMultiplier: '1' } })).holidayPay
    ).toBe(0)
  })

  it('prim: yüzde 2,5 × 250.000 TL taban = 6.250 TL; sabit prim; kapalıyken 0', () => {
    const pct = computeSalaryPeriod(
      denizEylul({ commissionBaseMinor: 25_000_000, policy: { commissionMode: 'pct', commissionPct: '2.5' } })
    )
    expect(pct.commission).toBe(625_000)
    expect(pct.net).toBe(3_150_000 + 625_000)
    const fixed = computeSalaryPeriod(
      denizEylul({ policy: { commissionMode: 'fixed', commissionFixedMinor: 100_000 } })
    )
    expect(fixed.commission).toBe(100_000)
    expect(computeSalaryPeriod(denizEylul({ commissionBaseMinor: 25_000_000 })).commission).toBe(0)
  })
})

describe('computeSalaryPeriod · avans, ödeme, ikramiye, kesinti', () => {
  it('parça parça avans toplanır; maaş + izin parası ödemeleri "ödenen"e girer, kalan = net − ödenen', () => {
    const r = computeSalaryPeriod(
      denizEylul({
        txns: [
          txn('advance', 500_000),
          txn('advance', 750_000),
          txn('salary_payment', 2_000_000),
          txn('leave_payout', 400_000)
        ]
      })
    )
    expect(r).toMatchObject({ advances: 1_250_000, net: 3_150_000, paid: 2_400_000, remaining: 750_000 })
  })

  it('ikramiye nete eklenir, kesinti düşülür; mesai ve prim ödemeleri de ödenen sayılır', () => {
    const r = computeSalaryPeriod(
      denizEylul({
        txns: [
          txn('advance', 1_250_000),
          txn('bonus', 100_000),
          txn('deduction', 50_000),
          txn('overtime_payment', 10_000),
          txn('commission_payment', 20_000)
        ]
      })
    )
    expect(r).toMatchObject({
      bonus: 100_000,
      deductions: 50_000,
      net: 3_200_000,
      paid: 30_000,
      remaining: 3_170_000
    })
  })

  it('maaştan farklı para birimindeki hareket hata verir', () => {
    const txns: StaffTxnEntry[] = [{ kind: 'advance', amountMinor: 10_000, currency: 'EUR' }]
    expect(() => computeSalaryPeriod(denizEylul({ txns }))).toThrow(TypeError)
  })

  it('ay başında geçerli maaş yoksa hata verir', () => {
    expect(() => computeSalaryPeriod(period({ salaryHistory: history(['2026-09-15', 4_000_000]) }))).toThrow(
      RangeError
    )
  })

  it('geçersiz ay ve politika değerleri reddedilir', () => {
    expect(() => computeSalaryPeriod(period({ month: 13 }))).toThrow(RangeError)
    expect(() => computeSalaryPeriod(period({ policy: { hourlyDivisor: 0 } }))).toThrow(RangeError)
    expect(() => computeSalaryPeriod(period({ policy: { unusedLeaveMultiplier: '1.5x' } }))).toThrow(
      RangeError
    )
  })
})

describe('salaryForMonth', () => {
  const h = history(['2026-01-15', 4_000_000], ['2025-06-01', 3_000_000], ['2026-07-01', 4_500_000])

  it('ayın 1. günü ya da öncesinde başlayan son kaydı seçer (sıra önemsiz)', () => {
    expect(salaryForMonth(h, 2026, 1)?.amountMinor).toBe(3_000_000)
    expect(salaryForMonth(h, 2026, 2)?.amountMinor).toBe(4_000_000)
    expect(salaryForMonth(h, 2026, 6)?.amountMinor).toBe(4_000_000)
    expect(salaryForMonth(h, 2026, 7)).toEqual({ amountMinor: 4_500_000, currency: 'TRY' })
  })

  it('henüz maaş yoksa null; aynı tarihte iki kayıt varsa sonraki kazanır', () => {
    expect(salaryForMonth(h, 2025, 5)).toBeNull()
    const same = history(['2026-01-01', 1_000_000], ['2026-01-01', 2_000_000])
    expect(salaryForMonth(same, 2026, 3)?.amountMinor).toBe(2_000_000)
  })
})

describe('minutesWorked', () => {
  it('geliş–çıkış süresini dakika olarak verir', () => {
    expect(minutesWorked('09:00', '17:30')).toBe(510)
    expect(minutesWorked('8:05', '8:50')).toBe(45)
  })

  it('gece yarısını aşan vardiya: çıkış < geliş → +24 saat', () => {
    expect(minutesWorked('22:00', '06:00')).toBe(480)
    expect(minutesWorked('20:00', '08:00')).toBe(720)
    expect(minutesWorked('23:30', '00:15')).toBe(45)
  })

  it('aynı saat 0 dakika; geçersiz saat reddedilir', () => {
    expect(minutesWorked('08:00', '08:00')).toBe(0)
    expect(() => minutesWorked('24:00', '08:00')).toThrow(RangeError)
    expect(() => minutesWorked('09:60', '10:00')).toThrow(RangeError)
    expect(() => minutesWorked('abc', '10:00')).toThrow(RangeError)
  })
})

describe('parseDecimalRatio', () => {
  it('ondalık metni tam sayı oranına çevirir, kayan sayı kullanmaz', () => {
    expect(parseDecimalRatio('1.5')).toEqual({ num: 15n, den: 10n })
    expect(parseDecimalRatio('2')).toEqual({ num: 2n, den: 1n })
    expect(parseDecimalRatio('2,25')).toEqual({ num: 225n, den: 100n })
    expect(() => parseDecimalRatio('-1')).toThrow(RangeError)
    expect(() => parseDecimalRatio('')).toThrow(RangeError)
  })
})

describe('computeSalaryPeriod · ay içinde başlayan ya da ayrılan (son ay hesabı)', () => {
  it('tam ayda maaş payı aylık maaşın kendisidir (Excel örnekleri değişmez)', () => {
    const r = computeSalaryPeriod(denizEylul({ employedFrom: d('2025-01-01') }))
    expect(r).toMatchObject({ employedDays: 30, monthDays: 30, salaryDue: 4_000_000, net: 3_150_000 })
  })

  it('15 Eylül’de ayrılan: 40.000 ÷ 30 × 15 = 20.000, izin hakkı 4 × 15/30 = 2', () => {
    const r = computeSalaryPeriod(
      period({ employedFrom: d('2024-01-01'), employedUntil: d('2026-09-15'), leave: restDays(YEAR, 9, 1) })
    )
    expect(r).toMatchObject({
      employedDays: 15,
      salaryDue: 2_000_000,
      leaveEntitled: 2,
      leaveUsed: 1,
      leaveLeft: 1,
      leavePayout: 133_333,
      net: 2_133_333
    })
  })

  it('ayın 10’unda başlayan: maaş başladığı gün geçerli kayıttan, 22 gün payı', () => {
    const r = computeSalaryPeriod(
      period({
        month: 10,
        employedFrom: d('2026-10-10'),
        salaryHistory: history(['2026-10-10', 3_100_000])
      })
    )
    expect(r).toMatchObject({ monthly: 3_100_000, employedDays: 22, monthDays: 31 })
    // 31 000 ÷ 30 × 22 = 22.733,33; 4 × 22/31 = 2,8 → 2 days.
    expect(r.salaryDue).toBe(2_273_333)
    expect(r.leaveEntitled).toBe(2)
  })

  it('30 bölenle 31 günlük ayda 31 gün çalışan ayrılsa da aylıktan fazla almaz; ay dışı çalışma hata verir', () => {
    expect(computeSalaryPeriod(period({ month: 10, employedUntil: d('2026-10-31') })).salaryDue).toBe(
      4_000_000
    )
    expect(() => computeSalaryPeriod(period({ month: 10, employedUntil: d('2026-09-30') }))).toThrow(
      /not employed/
    )
    expect(employedRange(2026, 10, d('2026-11-01'))).toBeNull()
  })

  it('salaryOn o gün geçerli maaşı verir', () => {
    const h = history(['2026-01-01', 3_000_000], ['2026-09-01', 4_000_000])
    expect(salaryOn(h, d('2026-08-31'))?.amountMinor).toBe(3_000_000)
    expect(salaryOn(h, d('2026-09-01'))?.amountMinor).toBe(4_000_000)
  })
})

describe('suggestedOvertimeMinutes', () => {
  it('10 saat çalışan, 8 saat standart → 120 dakika; standarttan az çalışan → 0', () => {
    expect(suggestedOvertimeMinutes(600, 8)).toBe(120)
    expect(suggestedOvertimeMinutes(420, 8)).toBe(0)
  })
})

describe('erken hata avı düzeltmeleri (P7fix)', () => {
  const unpaid = (from: number, n: number): LeaveEntry[] =>
    Array.from({ length: n }, (_, i) => ({
      date: d(`2026-09-${String(from + i).padStart(2, '0')}`),
      kind: 'unpaid' as const
    }))

  it('ücretsiz izin günleri günlük ücretle maaştan düşer: 30.000, 5 gün → 30.000 − 5.000 + 4.000 = 29.000 (B3)', () => {
    const r = computeSalaryPeriod(
      period({ salaryHistory: history(['2025-01-01', 3_000_000]), leave: unpaid(10, 5) })
    )
    expect(r).toMatchObject({
      daily: 100_000,
      unpaidDays: 5,
      unpaidDeduction: 500_000,
      leaveLeft: 4,
      leavePayout: 400_000,
      net: 2_900_000
    })
  })

  it('ücretsiz izin kesintisi ayın maaşını geçmez ve Excel örneğini değiştirmez (B3)', () => {
    const all = computeSalaryPeriod(
      period({ salaryHistory: history(['2025-01-01', 3_000_000]), leave: unpaid(1, 30) })
    )
    expect(all.unpaidDeduction).toBe(3_000_000)
    expect(computeSalaryPeriod(denizEylul())).toMatchObject({
      unpaidDays: 0,
      unpaidDeduction: 0,
      net: 3_150_000
    })
  })

  it('"bayramda çalıştı" izin kaydı bayram mesaisi sayılır: günlük modda 1 gün, saatlik modda standart gün (B15)', () => {
    const leave: LeaveEntry[] = [{ date: d('2026-09-15'), kind: 'holiday_worked' }]
    const daily = computeSalaryPeriod(denizEylul({ leave, policy: { holidayPayMode: 'daily' } }))
    expect(daily).toMatchObject({ holidayDays: 1, holidayPay: 133_333 })
    const hourly = computeSalaryPeriod(denizEylul({ leave }))
    expect(hourly).toMatchObject({ holidayDays: 1, holidayMinutes: 480, holidayPay: 142_222 })
    // A work record of the same holiday is not counted twice.
    const both = computeSalaryPeriod(denizEylul({ leave, work: [work('2026-09-15', 600, 0, 'holiday')] }))
    expect(both).toMatchObject({ holidayDays: 1, holidayMinutes: 600 })
  })

  it('birden çok çalışma dönemi: aradaki aylar boş, dönen ayda yalnız çalışılan günler (B6)', () => {
    const employment = [
      { from: d('2026-01-01'), until: d('2026-03-31') },
      { from: d('2026-06-16'), until: null }
    ]
    expect(employedIn(2026, 4, employment)).toBeNull()
    expect(employedIn(2026, 6, employment)).toMatchObject({ start: '2026-06-16', days: 15 })
    const salaryHistory = history(['2026-01-01', 3_000_000])
    const june = computeSalaryPeriod(period({ month: 6, salaryHistory, employment }))
    expect(june).toMatchObject({ employedDays: 15, salaryDue: 1_500_000 })
    expect(() => computeSalaryPeriod(period({ month: 5, salaryHistory, employment }))).toThrow(/not employed/)
  })
})
