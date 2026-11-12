// The tables of each report as files (faz-10 madde 8; S-43: every table). Column titles are i18n keys in the
// asking person's language (writers.ts translates them); names of lists, months and weekdays are written as text in
// that language, amounts as real numbers in the base currency (or the row's own currency where the report keeps it).
import type {
  CashReport,
  ExpensesReport,
  FxSourceRow,
  ListName,
  MonthEnd,
  MonthlyReport,
  OccupancyReport,
  ReportSummary,
  StaffReport,
  SupplySpend,
  YearlyReport
} from '@shared/contract/procedures/reports'
import { FX_PROVIDER_NAMES } from '@shared/domain/external'
import type { TopGroup } from '@shared/domain/reports'
import { basisPoints, staffLeaveDays } from '@shared/domain/reports'
import { LOCALE_TAG, formatMoney, type AppLocale } from '@shared/format'
import { money } from '@shared/money'
import { listLabel, type Translate } from '../data-transfer/labels'
import type { Column, Row, Table } from '../data-transfer/writers'

export type ReportData =
  | { kind: 'summary'; data: ReportSummary }
  | { kind: 'monthly'; data: MonthlyReport }
  | { kind: 'yearly'; data: YearlyReport }
  | { kind: 'occupancy'; data: OccupancyReport }
  | { kind: 'cash'; data: CashReport }
  | { kind: 'expenses'; data: ExpensesReport }
  | { kind: 'staff'; data: StaffReport }
  | { kind: 'monthEnd'; data: MonthEnd }

export interface NamedTable extends Table {
  /** Stable id the screen asks for ("income", "daily"…). */
  id: string
}

interface Ctx {
  locale: AppLocale
  t: Translate
}

const text = (key: string, label: string): Column => ({ key, label, type: 'text' })
const int = (key: string, label: string): Column => ({ key, label, type: 'int' })
const amount = (key: string, label: string, currencyKey = 'currency'): Column => ({
  key,
  label,
  type: 'money',
  currencyKey
})
const day = (key: string, label: string): Column => ({ key, label, type: 'date' })

function helpers({ locale, t }: Ctx) {
  const tag = LOCALE_TAG[locale]
  const monthFmt = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', numberingSystem: 'latn' })
  const weekdayFmt = new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' })
  const pct = new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    numberingSystem: 'latn'
  })
  return {
    month: (ym: string): string => monthFmt.format(new Date(`${ym}-15T12:00:00Z`)),
    /** 0 = Sunday (2023-01-01 was a Sunday). */
    weekday: (wd: number): string => weekdayFmt.format(new Date(Date.UTC(2023, 0, 1 + wd))),
    percent: (bp: number): string => pct.format(bp / 10_000),
    name: (n: ListName): string => listLabel(n.name, n.nameI18n, locale),
    channel: (n: ListName & { code: string }): string =>
      n.code === 'none' ? t('reports.channel.none') : listLabel(n.name, n.nameI18n, locale) || n.code,
    group: (g: string): string => t(`ledger.group.${g}`),
    money: (minor: number, currency: string): string =>
      formatMoney(money(minor, currency), locale, { showMinor: true }),
    top: (
      g: TopGroup,
      categories: readonly (ListName & { id: string })[]
    ): { name: string; kind: string } => ({
      name:
        g.kind === 'staff'
          ? t('reports.expenseGroup.staff')
          : g.kind === 'laundry'
            ? t('reports.expenseGroup.laundry')
            : g.kind === 'category'
              ? listLabel(
                  categories.find((c) => c.id === g.categoryId)?.name ?? g.categoryId,
                  categories.find((c) => c.id === g.categoryId)?.nameI18n ?? null,
                  locale
                )
              : g.label,
      kind: t(`reports.expenseKind.${g.kind}`)
    })
  }
}

const table = (id: string, title: string, columns: Column[], rows: Row[]): NamedTable => ({
  id,
  title,
  columns,
  rows
})

function topTable(
  ctx: Ctx,
  id: string,
  title: string,
  groups: readonly TopGroup[],
  categories: readonly (ListName & { id: string })[],
  currency: string
): NamedTable {
  const h = helpers(ctx)
  const total = groups.reduce((s, g) => s + g.totalMinor, 0)
  return table(
    id,
    title,
    [
      text('name', 'reports.col.item'),
      text('kind', 'reports.col.kind'),
      amount('total', 'reports.col.amount'),
      text('share', 'reports.col.share')
    ],
    groups.map((g) => ({
      ...h.top(g, categories),
      total: g.totalMinor,
      currency,
      share: h.percent(basisPoints(Math.max(0, g.totalMinor), Math.max(1, total)))
    }))
  )
}

/** Kur kaynakları (Faz 11 teslimat 5): foreign-currency rows by kind × currency × rate source; none → no table. */
function fxSourcesTable(ctx: Ctx, rows: readonly FxSourceRow[], base: string): NamedTable[] {
  if (!rows.length) return []
  const { t } = ctx
  return [
    table(
      'fxSources',
      t('reports.fx.title'),
      [
        text('kind', 'reports.col.record'),
        text('cur', 'reports.col.currency'),
        text('source', 'reports.col.fxSource'),
        text('provider', 'reports.col.provider'),
        int('rows', 'reports.col.records'),
        amount('amount', 'reports.col.original', 'cur'),
        amount('base', 'reports.col.base', 'baseCur')
      ],
      rows.map((r) => ({
        kind: t(`reports.fx.kind.${r.kind}`),
        cur: r.currency,
        source: t(`reports.fx.source.${r.source}`),
        provider: r.provider
          ? (FX_PROVIDER_NAMES[r.provider as keyof typeof FX_PROVIDER_NAMES] ?? r.provider)
          : '',
        rows: r.rows,
        amount: r.amountMinor,
        base: r.baseMinor,
        baseCur: base
      }))
    )
  ]
}

/** Tedarik giderleri (Faz 12 teslimat 2): purchases by product category in the base currency. */
function supplyTable(
  ctx: Ctx,
  supply: SupplySpend,
  categories: readonly (ListName & { id: string })[],
  currency: string
): NamedTable {
  const h = helpers(ctx)
  return table(
    'supply',
    ctx.t('reports.supply.title'),
    [
      text('category', 'reports.col.category'),
      int('purchases', 'reports.col.purchases'),
      amount('total', 'reports.col.amount'),
      text('share', 'reports.col.share')
    ],
    supply.categories.map((c) => ({
      category: h.top({ kind: 'category', categoryId: c.categoryId, totalMinor: c.totalMinor }, categories)
        .name,
      purchases: c.purchases,
      total: c.totalMinor,
      currency,
      share: h.percent(basisPoints(Math.max(0, c.totalMinor), Math.max(1, supply.totalMinor)))
    }))
  )
}

export function buildTables(report: ReportData, ctx: Ctx): NamedTable[] {
  const { t } = ctx
  const h = helpers(ctx)
  switch (report.kind) {
    case 'summary': {
      const d = report.data
      const o = d.occupancy
      const c = d.baseCurrency
      const rows: Row[] = []
      if (d.finance) {
        rows.push(
          { metric: t('reports.kpi.revenue'), value: h.money(d.finance.revenueMinor, c) },
          { metric: t('reports.kpi.profit'), value: h.money(d.finance.profitMinor, c) },
          { metric: t('reports.kpi.expenses'), value: h.money(d.finance.expensesMinor, c) }
        )
      }
      rows.push(
        { metric: t('reports.kpi.occupancy'), value: h.percent(o.occupancyBp) },
        { metric: t('reports.col.soldNights'), value: String(o.soldNights) },
        { metric: t('reports.col.sellableNights'), value: String(o.sellableNights) },
        { metric: t('reports.col.dayUse'), value: String(o.dayUseNights) }
      )
      if (d.finance)
        rows.push(
          { metric: t('reports.kpi.adr'), value: h.money(d.finance.adrMinor, c) },
          { metric: t('reports.kpi.revpar'), value: h.money(d.finance.revparMinor, c) }
        )
      rows.push({
        metric: t('reports.kpi.alos'),
        value: (o.alosHundredths / 100).toLocaleString(LOCALE_TAG[ctx.locale])
      })
      return [
        table(
          'kpis',
          t('reports.tab.summary'),
          [text('metric', 'reports.col.metric'), text('value', 'reports.col.value')],
          rows
        )
      ]
    }
    case 'monthly': {
      const d = report.data
      const c = d.baseCurrency
      const out = [
        table(
          'income',
          t('reports.monthly.income'),
          [
            text('method', 'reports.col.method'),
            text('cur', 'reports.col.currency'),
            amount('amount', 'reports.col.original', 'cur'),
            amount('base', 'reports.col.base', 'baseCur')
          ],
          d.income.map((r) => ({
            method: h.group(r.methodGroup),
            cur: r.currency,
            amount: r.amountMinor,
            base: r.baseMinor,
            baseCur: c
          }))
        ),
        table(
          'channels',
          t('reports.monthly.channels'),
          [text('channel', 'reports.col.channel'), amount('amount', 'reports.col.amount')],
          d.channels.map((r) => ({ channel: h.channel(r), amount: r.baseMinor, currency: c }))
        ),
        table(
          'daily',
          t('reports.monthly.daily'),
          [
            day('date', 'reports.col.date'),
            amount('revenue', 'reports.kpi.revenue'),
            amount('expenses', 'reports.kpi.expenses'),
            amount('profit', 'reports.kpi.profit')
          ],
          d.daily.map((r) => ({
            date: r.date,
            revenue: r.revenueMinor,
            expenses: r.expensesMinor,
            profit: r.revenueMinor - r.expensesMinor,
            currency: c
          }))
        ),
        table(
          'sections',
          t('reports.monthly.sections'),
          [text('section', 'reports.col.section'), amount('total', 'reports.col.amount')],
          d.sections.map((s) => ({ section: h.name(s) || s.code, total: s.totalMinor, currency: c }))
        ),
        topTable(ctx, 'top', t('monthEnd.top.title'), d.topExpenses, d.categories, c)
      ]
      if (d.ownerExpenses)
        out.push(topTable(ctx, 'owner', t('reports.monthly.owner'), d.ownerExpenses, d.categories, c))
      if (d.supply?.categories.length) out.push(supplyTable(ctx, d.supply, d.categories, c))
      out.push(...fxSourcesTable(ctx, d.fxSources, c))
      return out
    }
    case 'yearly': {
      const d = report.data
      return [
        table(
          'months',
          t('reports.tab.yearly'),
          [
            int('year', 'reports.col.year'),
            text('month', 'reports.col.month'),
            amount('revenue', 'reports.kpi.revenue'),
            amount('expenses', 'reports.kpi.expenses'),
            amount('profit', 'reports.kpi.profit')
          ],
          d.years.flatMap((y) =>
            y.months.map((m) => ({
              year: y.year,
              month: h.month(`${y.year}-${String(m.month).padStart(2, '0')}`),
              revenue: m.revenueMinor,
              expenses: m.expensesMinor,
              profit: m.revenueMinor - m.expensesMinor,
              currency: d.baseCurrency
            }))
          )
        )
      ]
    }
    case 'occupancy': {
      const d = report.data
      const c = d.baseCurrency
      const nightCols = [
        int('sold', 'reports.col.soldNights'),
        int('dayUse', 'reports.col.dayUse'),
        int('sellable', 'reports.col.sellableNights'),
        text('occ', 'reports.kpi.occupancy')
      ]
      const nights = (r: { soldNights: number; dayUseNights: number; sellableNights: number }) => ({
        sold: r.soldNights,
        dayUse: r.dayUseNights,
        sellable: r.sellableNights,
        occ: h.percent(basisPoints(r.soldNights, r.sellableNights))
      })
      const withRevenue = d.rooms.some((r) => r.revenueMinor !== null)
      const revenueCol = withRevenue ? [amount('revenue', 'reports.col.roomRevenue')] : []
      const out = [
        table(
          'months',
          t('reports.occupancy.months'),
          [text('month', 'reports.col.month'), ...nightCols],
          d.months.map((m) => ({ month: h.month(m.month), ...nights(m) }))
        ),
        table(
          'weekdays',
          t('reports.occupancy.heatmap'),
          [text('month', 'reports.col.month'), text('weekday', 'reports.col.weekday'), ...nightCols],
          d.heatmap.map((m) => ({ month: h.month(m.month), weekday: h.weekday(m.weekday), ...nights(m) }))
        ),
        table(
          'roomTypes',
          t('reports.occupancy.roomTypes'),
          [text('type', 'reports.col.roomType'), ...nightCols, ...revenueCol],
          d.roomTypes.map((r) => ({ type: h.name(r), ...nights(r), revenue: r.revenueMinor, currency: c }))
        ),
        table(
          'rooms',
          t('reports.occupancy.rooms'),
          [text('room', 'reports.col.room'), ...nightCols, ...revenueCol],
          d.rooms.map((r) => ({ room: r.number, ...nights(r), revenue: r.revenueMinor, currency: c }))
        )
      ]
      if (d.topGuests)
        out.push(
          table(
            'topGuests',
            t('reports.occupancy.topGuests'),
            [
              text('guest', 'reports.col.guest'),
              int('stays', 'reports.col.stays'),
              amount('revenue', 'reports.kpi.revenue')
            ],
            d.topGuests.map((g) => ({ guest: g.name, stays: g.stays, revenue: g.revenueMinor, currency: c }))
          )
        )
      return out
    }
    case 'cash': {
      const d = report.data
      const c = d.baseCurrency
      return [
        table(
          'methods',
          t('reports.cash.methods'),
          [
            text('method', 'reports.col.method'),
            text('cur', 'reports.col.currency'),
            amount('amount', 'reports.col.original', 'cur'),
            amount('pending', 'reports.col.pending', 'cur'),
            amount('base', 'reports.col.base', 'baseCur'),
            int('rows', 'reports.col.rows')
          ],
          d.methods.map((m) => ({
            method: h.name(m) || h.group(m.group),
            cur: m.currency,
            amount: m.amountMinor,
            pending: m.pendingMinor,
            base: m.baseMinor,
            baseCur: c,
            rows: m.rows
          }))
        ),
        table(
          'handovers',
          t('reports.cash.handovers'),
          [
            { key: 'at', label: 'reports.col.time', type: 'datetime' },
            text('by', 'reports.col.by'),
            int('count', 'reports.col.rows'),
            text('totals', 'reports.col.amount'),
            text('state', 'reports.col.state')
          ],
          d.handovers.map((x) => ({
            at: x.at,
            by: x.byName ?? '',
            count: x.paymentCount,
            totals: x.totals.map((tt) => h.money(tt.amountMinor, tt.currency)).join(' + '),
            state: x.reverted ? t('reports.cash.reverted') : ''
          }))
        ),
        table(
          'aging',
          t('reports.cash.aging'),
          [
            text('age', 'reports.col.age'),
            amount('amount', 'reports.col.amount'),
            int('rows', 'reports.col.rows')
          ],
          d.aging.map((a) => ({
            age: t(`reports.cash.age.${a.bucket}`),
            amount: a.baseMinor,
            currency: c,
            rows: a.rows
          }))
        ),
        table(
          'unchecked',
          t('reports.cash.unchecked'),
          [
            day('date', 'reports.col.date'),
            text('method', 'reports.col.method'),
            text('guest', 'reports.col.guest'),
            text('code', 'reports.col.reservation'),
            amount('amount', 'reports.col.amount')
          ],
          d.unchecked.map((u) => ({
            date: u.date,
            method: h.group(u.group),
            guest: u.guestName ?? '',
            code: u.reservationCode ?? '',
            amount: u.amountMinor,
            currency: u.currency
          }))
        ),
        table(
          'drawer',
          t('reports.cash.drawer'),
          [text('cur', 'reports.col.currency'), amount('amount', 'reports.col.amount', 'cur')],
          d.drawer.map((x) => ({ cur: x.currency, amount: x.amountMinor }))
        )
      ]
    }
    case 'expenses': {
      const d = report.data
      const c = d.baseCurrency
      return [
        table(
          'months',
          t('reports.expenses.months'),
          [
            text('month', 'reports.col.month'),
            amount('total', 'reports.kpi.expenses'),
            amount('staff', 'reports.staff.cost')
          ],
          d.months.map((m) => ({
            month: h.month(m.month),
            total: m.totalMinor,
            staff: m.staffMinor,
            currency: c
          }))
        ),
        table(
          'sections',
          t('reports.monthly.sections'),
          [text('section', 'reports.col.section'), amount('total', 'reports.col.amount')],
          d.sections.map((s) => ({ section: h.name(s) || s.code, total: s.totalMinor, currency: c }))
        ),
        topTable(ctx, 'top', t('monthEnd.top.title'), d.topExpenses, d.categories, c),
        ...fxSourcesTable(ctx, d.fxSources, c)
      ]
    }
    case 'staff': {
      const d = report.data
      const c = d.baseCurrency
      const hours = (minutes: number): number => Math.round((minutes * 1000) / 60)
      const moneyColumns = d.salaryVisible
        ? [
            amount('cost', 'reports.staff.yearCost'),
            amount('salary', 'reports.staff.kind.salary_payment'),
            amount('advance', 'reports.staff.kind.advance'),
            amount('leavePay', 'reports.staff.kind.leave_payout'),
            amount('overtimePay', 'reports.staff.kind.overtime_payment'),
            amount('other', 'reports.staff.kind.other')
          ]
        : []
      const out = [
        table(
          'employees',
          t('reports.staff.employees'),
          [
            text('name', 'reports.col.employee'),
            text('position', 'reports.col.position'),
            ...moneyColumns,
            int('leaveDays', 'reports.staff.leaveDays'),
            { key: 'worked', label: 'reports.staff.workedHours', type: 'qty' },
            { key: 'overtime', label: 'reports.staff.overtimeHours', type: 'qty' }
          ],
          d.employees.map((e) => ({
            name: e.name,
            position: e.position ?? '',
            cost: e.costMinor ?? 0,
            salary: e.byKind.salary_payment ?? 0,
            advance: e.byKind.advance ?? 0,
            leavePay: e.byKind.leave_payout ?? 0,
            overtimePay: e.byKind.overtime_payment ?? 0,
            other: (e.byKind.other ?? 0) + (e.byKind.commission_payment ?? 0),
            leaveDays: staffLeaveDays(e.leave),
            worked: hours(e.workedMinutes),
            overtime: hours(e.overtimeMinutes),
            currency: c
          }))
        )
      ]
      if (d.salaryVisible)
        out.push(
          table(
            'months',
            t('reports.staff.byMonth'),
            [text('month', 'reports.col.month'), amount('cost', 'reports.staff.cost')],
            d.months.map((m) => ({
              month: h.month(`${d.year}-${String(m.month).padStart(2, '0')}`),
              cost: m.costMinor ?? 0,
              currency: c
            }))
          )
        )
      return out
    }
    case 'monthEnd': {
      const d = report.data
      const c = d.baseCurrency
      const out = [
        table(
          'methods',
          t('monthEnd.cards.title'),
          [
            text('method', 'reports.col.method'),
            amount('total', 'monthEnd.cards.total'),
            amount('received', 'monthEnd.cards.received'),
            amount('pending', 'monthEnd.cards.pending'),
            int('rows', 'monthEnd.cards.pendingRows')
          ],
          d.methods.map((m) => ({
            method: h.group(m.group),
            total: m.totalMinor,
            received: m.receivedMinor,
            pending: m.pendingMinor,
            rows: m.pendingRows,
            currency: c
          }))
        ),
        table(
          'results',
          t('monthEnd.check.step.results'),
          [
            text('metric', 'reports.col.metric'),
            amount('value', 'reports.col.amount'),
            amount('previous', 'reports.col.previous')
          ],
          [
            {
              metric: t('reports.kpi.revenue'),
              value: d.revenueMinor,
              previous: d.previous.revenueMinor,
              currency: c
            },
            {
              metric: t('reports.kpi.expenses'),
              value: d.expensesMinor,
              previous: d.previous.expensesMinor,
              currency: c
            },
            {
              metric: t('reports.kpi.profit'),
              value: d.profitMinor,
              previous: d.previous.profitMinor,
              currency: c
            }
          ]
        ),
        topTable(ctx, 'top', t('monthEnd.top.title'), d.topExpenses, d.categories, c)
      ]
      if (d.salaries)
        out.push(
          table(
            'salaries',
            t('monthEnd.salaries.title'),
            [
              text('name', 'monthEnd.salaries.employee'),
              amount('monthly', 'monthEnd.salaries.monthly'),
              amount('advances', 'monthEnd.salaries.advances'),
              amount('leavePay', 'monthEnd.salaries.leavePay'),
              amount('net', 'monthEnd.salaries.net'),
              amount('paid', 'monthEnd.salaries.paid'),
              amount('remaining', 'monthEnd.salaries.remaining')
            ],
            d.salaries.rows.map((r) => ({
              name: r.fullName,
              monthly: r.monthly,
              advances: r.advances,
              leavePay: r.leavePayout,
              net: r.net,
              paid: r.paid,
              remaining: r.remaining,
              currency: r.currency
            }))
          )
        )
      out.push(...fxSourcesTable(ctx, d.fxSources, c))
      return out
    }
  }
}
