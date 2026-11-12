// Test fixtures of the report screens (not imported by the app): invented aggregate figures shaped like the service's
// answers for October 2026 (the Excel October: card 26.300, IBAN 1.000 via Airbnb, cash 10.000 → 37.300).
import type {
  CashReport,
  ExpensesReport,
  MonthEnd,
  MonthlyReport,
  OccupancyReport,
  ReportsContext,
  ReportSummary,
  StaffReport,
  YearlyReport
} from '@shared/contract/procedures/reports'
import type { ProcedureName } from '@shared/contract'
import { localDate as d } from '@shared/date'
import { fakeTransport, type FakeTransport } from '@/test/render'
import { ApiError } from '@/lib/transport'

export const CONTEXT: ReportsContext = {
  today: d('2026-10-20'),
  baseCurrency: 'TRY',
  firstDay: d('2025-03-01'),
  dayUseIncluded: false
}

export const summary = (revenue = 3_730_000, expenses = 400_000): ReportSummary => ({
  from: d('2026-10-01'),
  to: d('2026-11-01'),
  baseCurrency: 'TRY',
  occupancy: {
    soldNights: 15,
    dayUseNights: 1,
    sellableNights: 89,
    occupancyBp: 1685,
    dayUseIncluded: false,
    stays: 3,
    alosHundredths: 500
  },
  finance: {
    revenueMinor: revenue,
    expensesMinor: expenses,
    profitMinor: revenue - expenses,
    roomRevenueMinor: revenue,
    adrMinor: 248_667,
    revparMinor: 41_910,
    missingRate: { payments: 0, expenses: 0 },
    missingNightRates: 0,
    partial: false
  }
})

/** Foreign-currency rows of the month by rate source (Faz 11 teslimat 5). */
export const FX_SOURCES: MonthlyReport['fxSources'] = [
  {
    kind: 'payment',
    source: 'market_mid',
    provider: 'truncgil',
    currency: 'EUR',
    rows: 12,
    amountMinor: 120_000,
    baseMinor: 6_000_000
  },
  {
    kind: 'payment',
    source: 'hotel',
    provider: null,
    currency: 'USD',
    rows: 2,
    amountMinor: 20_000,
    baseMinor: 700_000
  },
  {
    kind: 'expense',
    source: 'manual',
    provider: null,
    currency: 'EUR',
    rows: 2,
    amountMinor: 5_000,
    baseMinor: 245_000
  },
  {
    kind: 'expense',
    source: 'none',
    provider: null,
    currency: 'GBP',
    rows: 1,
    amountMinor: 3_000,
    baseMinor: 0
  }
]

export const MONTHLY: MonthlyReport = {
  from: d('2026-10-01'),
  to: d('2026-11-01'),
  baseCurrency: 'TRY',
  revenueMinor: 3_730_000,
  expensesMinor: 400_000,
  profitMinor: 3_330_000,
  income: [
    { methodGroup: 'card', currency: 'TRY', amountMinor: 2_630_000, baseMinor: 2_630_000 },
    { methodGroup: 'bank', currency: 'TRY', amountMinor: 100_000, baseMinor: 100_000 },
    { methodGroup: 'cash', currency: 'TRY', amountMinor: 900_000, baseMinor: 900_000 },
    { methodGroup: 'cash', currency: 'EUR', amountMinor: 2_000, baseMinor: 100_000 }
  ],
  channels: [
    {
      code: 'direct',
      name: null,
      nameI18n: { tr: 'Doğrudan', en: 'Direct', ru: 'Напрямую' },
      baseMinor: 3_630_000
    },
    { code: 'airbnb', name: 'Airbnb', nameI18n: null, baseMinor: 100_000 }
  ],
  daily: [
    {
      date: d('2026-10-02'),
      revenueMinor: 2_630_000,
      expensesMinor: 0,
      byMethod: { card: 2_630_000 },
      byChannel: { direct: 2_630_000 }
    },
    {
      date: d('2026-10-15'),
      revenueMinor: 100_000,
      expensesMinor: 27_000,
      byMethod: { bank: 100_000 },
      byChannel: { airbnb: 100_000 }
    },
    {
      date: d('2026-10-20'),
      revenueMinor: 1_000_000,
      expensesMinor: 373_000,
      byMethod: { cash: 1_000_000 },
      byChannel: { direct: 1_000_000 }
    }
  ],
  sections: [
    {
      code: 'general',
      name: null,
      nameI18n: { tr: 'Genel', en: 'General', ru: 'Общие' },
      ownerOnly: false,
      totalMinor: 350_000
    },
    {
      code: 'owner',
      name: null,
      nameI18n: { tr: 'Yönetici', en: 'Owner', ru: 'Владелец' },
      ownerOnly: true,
      totalMinor: 50_000
    }
  ],
  ownerExpenses: [{ kind: 'description', key: 'kira', label: 'Kira payı', totalMinor: 50_000 }],
  topExpenses: [
    { kind: 'staff', totalMinor: 323_000 },
    { kind: 'description', key: 'kira', label: 'Kira payı', totalMinor: 50_000 },
    { kind: 'description', key: 'camasir suyu', label: 'Çamaşır suyu', totalMinor: 27_000 }
  ],
  categories: [
    { id: 'cat-cleaning', name: null, nameI18n: { tr: 'Temizlik', en: 'Cleaning', ru: 'Уборка' } },
    { id: 'cat-drinks', name: null, nameI18n: { tr: 'İçecek', en: 'Drinks', ru: 'Напитки' } }
  ],
  supply: {
    totalMinor: 39_000,
    purchases: 3,
    missingRate: 0,
    categories: [
      { categoryId: 'cat-cleaning', totalMinor: 27_000, purchases: 2 },
      { categoryId: 'cat-drinks', totalMinor: 12_000, purchases: 1 }
    ]
  },
  fxSources: FX_SOURCES,
  missingRate: { payments: 0, expenses: 0 },
  partial: false
}

export const YEARLY: YearlyReport = {
  baseCurrency: 'TRY',
  years: [2026, 2025].map((year) => ({
    year,
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      revenueMinor: year === 2026 && i > 9 ? 0 : (i + 1) * 100_000 * (year === 2026 ? 3 : 2),
      expensesMinor: year === 2026 && i > 9 ? 0 : (i + 1) * 50_000
    }))
  })),
  partial: false
}

export const OCCUPANCY: OccupancyReport = {
  from: d('2026-10-01'),
  to: d('2026-11-01'),
  baseCurrency: 'TRY',
  dayUseIncluded: false,
  months: [{ month: '2026-10', soldNights: 15, dayUseNights: 1, sellableNights: 89 }],
  heatmap: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    month: '2026-10',
    weekday,
    soldNights: weekday === 6 ? 9 : 1,
    dayUseNights: 0,
    sellableNights: weekday === 6 ? 15 : 12
  })),
  roomTypes: [
    {
      id: 'type-1',
      name: 'standard',
      nameI18n: { tr: 'Standart', en: 'Standard', ru: 'Стандарт' },
      soldNights: 15,
      dayUseNights: 1,
      sellableNights: 89,
      revenueMinor: 3_730_000
    }
  ],
  rooms: [
    {
      id: 'room-101',
      number: '101',
      typeId: 'type-1',
      soldNights: 10,
      dayUseNights: 0,
      sellableNights: 31,
      revenueMinor: 2_630_000
    },
    {
      id: 'room-102',
      number: '102',
      typeId: 'type-1',
      soldNights: 1,
      dayUseNights: 1,
      sellableNights: 31,
      revenueMinor: 100_000
    }
  ],
  guests: { total: 3, repeat: 1, repeatBp: 3333 },
  topGuests: [{ guestId: 'g1', name: 'Deniz Arslan', stays: 1, revenueMinor: 2_630_000 }],
  missingNightRates: 0
}

export const CASH: CashReport = {
  from: d('2026-10-01'),
  to: d('2026-11-01'),
  today: d('2026-10-20'),
  baseCurrency: 'TRY',
  methods: [
    {
      methodId: 'm-card',
      code: 'card',
      name: null,
      nameI18n: { tr: 'Kredi kartı', en: 'Credit card', ru: 'Карта' },
      group: 'card',
      currency: 'TRY',
      amountMinor: 2_630_000,
      baseMinor: 2_630_000,
      pendingMinor: 2_630_000,
      rows: 1,
      pendingRows: 1
    }
  ],
  handovers: [
    {
      id: 'h1',
      at: '2026-10-20T15:00:00.000Z',
      byName: 'Otel Sahibi',
      paymentCount: 1,
      totals: [{ currency: 'TRY', amountMinor: 1_000_000 }],
      reverted: false
    }
  ],
  aging: [
    { bucket: 'd0_7', baseMinor: 0, rows: 0 },
    { bucket: 'd8_30', baseMinor: 2_630_000, rows: 1 },
    { bucket: 'd31_90', baseMinor: 0, rows: 0 },
    { bucket: 'd90', baseMinor: 0, rows: 0 }
  ],
  unchecked: [
    {
      id: 'p1',
      date: d('2026-10-02'),
      group: 'card',
      amountMinor: 2_630_000,
      currency: 'TRY',
      guestName: 'Deniz Arslan',
      reservationCode: 'R-2026-000001',
      channelCode: null
    }
  ],
  uncheckedTotal: 1,
  drawer: [{ currency: 'TRY', amountMinor: 150_000 }]
}

export const EXPENSES: ExpensesReport = {
  from: d('2026-10-01'),
  to: d('2026-11-01'),
  baseCurrency: 'TRY',
  totalMinor: 400_000,
  staffMinor: 373_000,
  revenueMinor: 3_730_000,
  laborRatioBp: 1000,
  months: [{ month: '2026-10', totalMinor: 400_000, staffMinor: 373_000 }],
  sections: MONTHLY.sections,
  topExpenses: MONTHLY.topExpenses,
  categories: [],
  fxSources: FX_SOURCES.filter((r) => r.kind === 'expense'),
  missingRate: { payments: 0, expenses: 0 },
  partial: false
}

export const STAFF: StaffReport = {
  year: 2026,
  baseCurrency: 'TRY',
  salaryVisible: true,
  partial: false,
  employees: [
    {
      id: 'e1',
      name: 'Deniz Yıldız',
      position: 'Resepsiyon',
      active: true,
      costMinor: 373_000,
      byKind: { advance: 373_000 },
      leave: { rest_day: 4 },
      workedMinutes: 9_600,
      overtimeMinutes: 120
    }
  ],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, costMinor: i === 9 ? 373_000 : 0 })),
  revenueMinor: 3_730_000,
  laborRatioBp: 1000
}

export const monthEnd = (over: Partial<MonthEnd> = {}): MonthEnd => ({
  year: 2026,
  month: 9,
  from: d('2026-09-01'),
  to: d('2026-10-01'),
  today: d('2026-10-05'),
  baseCurrency: 'TRY',
  methods: [
    { group: 'card', totalMinor: 2_630_000, receivedMinor: 0, pendingMinor: 2_630_000, pendingRows: 1 },
    { group: 'bank', totalMinor: 100_000, receivedMinor: 100_000, pendingMinor: 0, pendingRows: 0 },
    { group: 'cash', totalMinor: 1_000_000, receivedMinor: 1_000_000, pendingMinor: 0, pendingRows: 0 }
  ],
  bankByChannel: [{ code: 'airbnb', name: 'Airbnb', nameI18n: null, baseMinor: 100_000 }],
  revenueMinor: 3_730_000,
  expensesMinor: 400_000,
  profitMinor: 3_330_000,
  previous: { revenueMinor: 3_000_000, expensesMinor: 500_000, profitMinor: 2_500_000 },
  occupancy: { soldNights: 15, sellableNights: 89, previousSold: 10, previousSellable: 90 },
  topExpenses: MONTHLY.topExpenses,
  categories: [],
  salaries: {
    rows: [
      {
        employeeId: 'e1',
        fullName: 'Deniz Yıldız',
        position: 'Resepsiyon',
        year: 2026,
        month: 9,
        currency: 'TRY',
        monthly: 4_000_000,
        employedDays: 30,
        monthDays: 30,
        salaryDue: 4_000_000,
        daily: 133_333,
        hourly: 16_667,
        leaveEntitled: 4,
        leaveCarriedIn: 0,
        leaveUsed: 1,
        leaveLeft: 3,
        leavePayout: 400_000,
        overtimeMinutes: 0,
        overtimePay: 0,
        holidayDays: 0,
        holidayMinutes: 0,
        holidayPay: 0,
        commission: 0,
        advances: 1_250_000,
        bonus: 0,
        deductions: 0,
        net: 3_150_000,
        paid: 0,
        remaining: 3_150_000,
        commissionBaseMinor: null,
        locked: false,
        lockedAt: null,
        lockedBy: null
      }
    ],
    withoutSalary: 0
  },
  tourism: { imported: true, reportedAt: null, due: d('2026-10-10') },
  fxSources: FX_SOURCES,
  missingRate: { payments: 0, expenses: 0 },
  partial: false,
  ...over
})

export interface ReportsState {
  context?: ReportsContext
  failContext?: boolean
  pending?: boolean
  monthEnd?: MonthEnd
  staff?: StaffReport
}

/** The settings/sign-in fake plus the report procedures. */
export function reportsTransport(state: ReportsState = {}): FakeTransport {
  const base = fakeTransport()
  const call = base.call.bind(base)
  base.call = (async (name: ProcedureName, input: unknown) => {
    if (!name.startsWith('reports.')) return call(name, input as never)
    base.calls.push({ name, input })
    if (state.pending) return new Promise(() => {})
    switch (name) {
      case 'reports.context':
        if (state.failContext) throw new ApiError('INTERNAL', 500, 'errors.internal')
        return state.context ?? CONTEXT
      case 'reports.summary': {
        const p = input as { from: string }
        return p.from === '2026-10-01' ? summary() : summary(3_000_000, 500_000)
      }
      case 'reports.monthly':
        return MONTHLY
      case 'reports.yearly':
        return YEARLY
      case 'reports.occupancy':
        return OCCUPANCY
      case 'reports.cash':
        return CASH
      case 'reports.expenses':
        return EXPENSES
      case 'reports.staff':
        return state.staff ?? STAFF
      case 'reports.monthEnd': {
        const q = input as { year: number; month: number }
        return { ...(state.monthEnd ?? monthEnd()), year: q.year, month: q.month }
      }
      case 'reports.export':
        return {
          fileName: 'Özet raporu.xlsx',
          mime: 'application/x',
          base64: 'AA==',
          rows: 3,
          delivery: 'download',
          savedPath: null
        }
      default:
        throw new Error(`unexpected ${name}`)
    }
  }) as FakeTransport['call']
  return base
}
