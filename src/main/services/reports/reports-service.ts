// Reports, KPIs and the month-end check (Faz 10 madde 1–9; G-100…G-105, G-70; 03-mimari.md §6.10). Every figure is
// derived from the records (G-60): revenue = live payments by business day (cash basis, the ledger's total), expenses =
// live expenses of the sections the caller may see, occupancy = sold room-nights ÷ sellable room-nights (capacity
// history, blocks dropped; day-use by setting), ADR/RevPAR from room-night charges. Permissions (G-105): the screen
// groups `reports.operations` (occupancy), `reports.finance` (money), `reports.staff`, `reports.export`.
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm'
import {
  CHECK_GROUPS,
  monthEndInputSchema,
  monthEndTicksInputSchema,
  kindedPeriodInputSchema,
  periodInputSchema,
  type StayKind,
  reportExportInputSchema,
  staffInputSchema,
  yearlyInputSchema,
  type CashReport,
  type ExpensesReport,
  type MonthEnd,
  type MonthEndManualStep,
  type MonthlyReport,
  type OccupancyReport,
  type ReportExportInput,
  type ReportsContext,
  type ReportSummary,
  type StaffReport,
  type SupplySpend,
  type YearlyReport
} from '@shared/contract/procedures/reports'
import type { ExportFile } from '@shared/contract/backup'
import { addDays, diffDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import { METHOD_GROUPS, type MethodGroup } from '@shared/domain/cash'
import { adrMinor, basisPoints, revparMinor, topExpenses } from '@shared/domain/reports'
import {
  addMonths,
  firstOfMonth,
  forEachSellableDay,
  monthPeriod,
  yearPeriod,
  type Period
} from '@shared/domain/reports-period'
import {
  cashHandovers,
  employees,
  expenses,
  folios,
  guests,
  kbsImports,
  leaveRecords,
  paymentMethods,
  payments,
  productCategories,
  reservations,
  roomTypes,
  salesChannels,
  staffTransactions,
  users,
  workRecords
} from '../../db/schema'
import type { Ctx } from '../context'
import { baseCurrencyOf } from '../currency-service'
import { permissionDenied } from '../errors'
import { sectionAccess, staffMoneyFilter } from '../expenses-service'
import { inTransaction, invalid, parseInput, requirePermission, type ServiceDeps } from '../kit'
import { readSetting } from '../settings-service'
import type { StaffService } from '../staff-service'
import { buildTables, type ReportData } from './export-tables'
import { readMonthEndTicks, writeMonthEndTicks } from './month-end-ticks'
import {
  capacityInputs,
  expenseFacts,
  expensesForTop,
  firstDataDay,
  fxSourceFacts,
  nightFacts,
  outcomeFacts,
  paymentFacts,
  repeatGuests,
  roomRevenueByRoom,
  stayLengths,
  supplyByCategory,
  type ExpenseFact,
  type PaymentFact
} from './queries'
import { toCsv, toXlsx } from '../data-transfer/writers'
import { translator } from '../data-transfer/labels'

export interface ReportsDeps extends ServiceDeps {
  staff: StaffService
  /** The program window's "Save as" dialog (main process); absent = bytes back to the window. */
  saveFile?: (fileName: string, bytes: Buffer) => Promise<string | null>
}

const MIME = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
} as const

const STAFF_KINDS = new Set([
  'salary_payment',
  'advance',
  'leave_payout',
  'overtime_payment',
  'commission_payment'
])

const sum = <T>(rows: readonly T[], pick: (r: T) => number): number => rows.reduce((s, r) => s + pick(r), 0)

function addTo<K extends string>(map: Partial<Record<K, number>>, key: K, v: number): void {
  map[key] = (map[key] ?? 0) + v
}

export function createReportsService(deps: ReportsDeps) {
  const { db } = deps
  const today = (): LocalDate => localDateOf(deps.clock())
  const can = (ctx: Ctx, key: Parameters<Ctx['can']>[0]): boolean => ctx.can(key, 'view')
  const period = (input: unknown): Period => parseInput(periodInputSchema, input) as Period
  const kindedPeriod = (input: unknown): { p: Period; kind: StayKind } => {
    const { stayKind, ...rest } = parseInput(kindedPeriodInputSchema, input)
    return { p: rest as Period, kind: stayKind ?? 'all' }
  }

  const channelNames = () =>
    new Map(
      db
        .select({ code: salesChannels.code, name: salesChannels.name, nameI18n: salesChannels.nameI18n })
        .from(salesChannels)
        .all()
        .map((c) => [c.code, c])
    )

  const categoryList = () =>
    db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        nameI18n: productCategories.nameI18n
      })
      .from(productCategories)
      .all()
      .map((c) => ({ id: c.id, name: c.name, nameI18n: c.nameI18n ?? null }))

  // ── money ────────────────────────────────────────────────────────────────────────────────────────────────────

  function money(ctx: Ctx, p: Period) {
    const access = sectionAccess(db, ctx)
    const pays = paymentFacts(db, p, 'day')
    const exps = expenseFacts(db, p, 'day', access)
    return {
      access,
      pays,
      exps,
      revenue: sum(pays, (r) => r.baseMinor),
      spent: sum(exps, (r) => r.baseMinor),
      missingRate: { payments: sum(pays, (r) => r.missing), expenses: sum(exps, (r) => r.missing) }
    }
  }

  function sections(access: ReturnType<typeof sectionAccess>, exps: readonly ExpenseFact[]) {
    return access.all
      .filter((s) => access.viewIds.includes(s.id))
      .map((s) => ({
        code: s.code,
        name: s.name,
        nameI18n: s.nameI18n ?? null,
        ownerOnly: s.visibilityPermission === 'expenses.owner',
        totalMinor: sum(
          exps.filter((e) => e.sectionId === s.id),
          (e) => e.baseMinor
        )
      }))
  }

  function supplySpend(p: Period, access: ReturnType<typeof sectionAccess>): SupplySpend {
    const s = supplyByCategory(db, p, access)
    return {
      totalMinor: sum(s.categories, (c) => c.totalMinor),
      purchases: s.purchases,
      missingRate: s.missing,
      categories: s.categories
    }
  }

  // ── nights ───────────────────────────────────────────────────────────────────────────────────────────────────

  function nights(p: Period, kind?: StayKind) {
    const cap = capacityInputs(db, p)
    // dayDays: room-days with a day-use or hourly sale (S-105: they always count as sold, once per room-day).
    type Cell = { sold: number; dayUse: number; dayDays: number; sellable: number }
    const cell = (map: Map<string, Cell>, key: string): Cell => {
      let c = map.get(key)
      if (!c) map.set(key, (c = { sold: 0, dayUse: 0, dayDays: 0, sellable: 0 }))
      return c
    }
    const byRoom = new Map<string, Cell>()
    const byMonth = new Map<string, Cell>()
    const byHeat = new Map<string, Cell>()
    forEachSellableDay(cap.rooms, cap.changes, cap.blocks, p, (roomId, day) => {
      const month = day.slice(0, 7)
      const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
      cell(byRoom, roomId).sellable++
      cell(byMonth, month).sellable++
      cell(byHeat, `${month}|${wd}`).sellable++
    })
    for (const f of nightFacts(db, p, kind)) {
      const field = f.slot === 'day' ? 'dayUse' : 'sold'
      for (const c of [
        cell(byRoom, f.roomId),
        cell(byMonth, f.month),
        cell(byHeat, `${f.month}|${f.weekday}`)
      ]) {
        c[field] += f.n
        if (f.slot === 'day') c.dayDays += f.days
      }
    }
    const total: Cell = { sold: 0, dayUse: 0, dayDays: 0, sellable: 0 }
    for (const c of byMonth.values()) {
      total.sold += c.sold
      total.dayUse += c.dayUse
      total.dayDays += c.dayDays
      total.sellable += c.sellable
    }
    const view = (c: Cell) => ({
      soldNights: c.sold + c.dayDays,
      dayUseNights: c.dayUse,
      sellableNights: c.sellable
    })
    return { dayUseIncluded: true, cap, byRoom, byMonth, byHeat, total, view }
  }

  function summaryOf(ctx: Ctx, p: Period, kind?: StayKind): ReportSummary {
    const n = nights(p, kind)
    const t = n.view(n.total)
    const lengths = stayLengths(db, p)
    const base = baseCurrencyOf(db)
    let finance: ReportSummary['finance'] = null
    if (can(ctx, 'reports.finance')) {
      const m = money(ctx, p)
      const rooms = roomRevenueByRoom(db, p, base, kind)
      const roomRevenue = sum([...rooms.byRoom.values()], (v) => v)
      // ADR is the nightly rate only: night charges / sold nights. Same-day and hourly revenue is shown apart
      // (`hourlyRevenueMinor`, the sale count is `occupancy.dayUseNights`) so cheap hours do not pull ADR down.
      finance = {
        revenueMinor: m.revenue,
        expensesMinor: m.spent,
        profitMinor: m.revenue - m.spent,
        roomRevenueMinor: roomRevenue,
        adrMinor: adrMinor(roomRevenue - rooms.hourlyMinor, n.total.sold, base),
        hourlyRevenueMinor: rooms.hourlyMinor,
        revparMinor: revparMinor(roomRevenue, t.sellableNights, base),
        missingRate: m.missingRate,
        missingNightRates: rooms.missing,
        partial: m.access.partial
      }
    }
    return {
      from: p.from,
      to: p.to,
      baseCurrency: base,
      occupancy: {
        ...t,
        occupancyBp: basisPoints(t.soldNights, t.sellableNights),
        dayUseIncluded: n.dayUseIncluded,
        stays: lengths.stays,
        alosHundredths: lengths.stays ? Math.round((lengths.nights * 100) / lengths.stays) : 0
      },
      finance
    }
  }

  function monthlyOf(ctx: Ctx, p: Period): MonthlyReport {
    const m = money(ctx, p)
    const names = channelNames()
    const income = new Map<
      string,
      { methodGroup: MethodGroup; currency: string; amountMinor: number; baseMinor: number }
    >()
    const channels = new Map<string, number>()
    const days = new Map<string, MonthlyReport['daily'][number]>()
    const dayOf = (date: string) => {
      let d = days.get(date)
      if (!d)
        days.set(
          date,
          (d = { date: localDate(date), revenueMinor: 0, expensesMinor: 0, byMethod: {}, byChannel: {} })
        )
      return d
    }
    for (const f of m.pays) {
      const key = `${f.group}|${f.currency}`
      const cellRow = income.get(key) ?? {
        methodGroup: f.group,
        currency: f.currency,
        amountMinor: 0,
        baseMinor: 0
      }
      cellRow.amountMinor += f.amountMinor
      cellRow.baseMinor += f.baseMinor
      income.set(key, cellRow)
      const code = f.channel ?? 'none'
      channels.set(code, (channels.get(code) ?? 0) + f.baseMinor)
      const d = dayOf(f.bucket)
      d.revenueMinor += f.baseMinor
      addTo(d.byMethod, f.group, f.baseMinor)
      addTo(d.byChannel, code, f.baseMinor)
    }
    for (const e of m.exps) dayOf(e.bucket).expensesMinor += e.baseMinor
    const ownerIds = m.access.all
      .filter((s) => s.visibilityPermission === 'expenses.owner' && m.access.viewIds.includes(s.id))
      .map((s) => s.id)
    const ownerExpenses = can(ctx, 'expenses.owner')
      ? topExpenses(
          expensesForTop(db, p, {
            viewIds: ownerIds,
            where: and(inArray(expenses.sectionId, ownerIds.length ? ownerIds : ['']), staffMoneyFilter(ctx))
          })
        )
      : null
    return {
      from: p.from,
      to: p.to,
      baseCurrency: baseCurrencyOf(db),
      revenueMinor: m.revenue,
      expensesMinor: m.spent,
      profitMinor: m.revenue - m.spent,
      income: [...income.values()].filter((c) => c.amountMinor !== 0 || c.baseMinor !== 0),
      channels: [...channels]
        .filter(([, v]) => v !== 0)
        .map(([code, baseMinor]) => {
          const n = names.get(code)
          return { code, name: n?.name ?? null, nameI18n: n?.nameI18n ?? null, baseMinor }
        })
        .sort((a, b) => b.baseMinor - a.baseMinor),
      daily: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      sections: sections(m.access, m.exps),
      ownerExpenses,
      topExpenses: topExpenses(expensesForTop(db, p, m.access)),
      categories: categoryList(),
      supply: can(ctx, 'supplies') ? supplySpend(p, m.access) : null,
      fxSources: fxSourceFacts(db, p, baseCurrencyOf(db), m.access),
      missingRate: m.missingRate,
      partial: m.access.partial
    }
  }

  function yearlyOf(ctx: Ctx, years: readonly number[]): YearlyReport {
    const access = sectionAccess(db, ctx)
    return {
      baseCurrency: baseCurrencyOf(db),
      years: years.map((year) => {
        const p = yearPeriod(year)
        const pays = paymentFacts(db, p, 'month')
        const exps = expenseFacts(db, p, 'month', access)
        return {
          year,
          months: Array.from({ length: 12 }, (_, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`
            return {
              month: i + 1,
              revenueMinor: sum(
                pays.filter((r) => r.bucket === key),
                (r) => r.baseMinor
              ),
              expensesMinor: sum(
                exps.filter((r) => r.bucket === key),
                (r) => r.baseMinor
              )
            }
          })
        }
      }),
      partial: access.partial
    }
  }

  function occupancyOf(ctx: Ctx, p: Period, kind?: StayKind): OccupancyReport {
    const n = nights(p, kind)
    const base = baseCurrencyOf(db)
    const finance = can(ctx, 'reports.finance')
    const rooms = finance ? roomRevenueByRoom(db, p, base, kind) : null
    const revenue = rooms?.byRoom ?? null
    const empty = { sold: 0, dayUse: 0, dayDays: 0, sellable: 0 }
    const types = db.select().from(roomTypes).all()
    const roomRows = n.cap.rooms
      .map((r) => ({ r, c: n.byRoom.get(r.id) ?? empty }))
      .filter(({ r, c }) => c.sellable > 0 || c.sold > 0 || c.dayUse > 0 || (revenue?.get(r.id) ?? 0) !== 0)
    const typeRows = types
      .map((type) => {
        const mine = roomRows.filter(({ r }) => r.typeId === type.id)
        const c = {
          sold: sum(mine, (x) => x.c.sold),
          dayUse: sum(mine, (x) => x.c.dayUse),
          dayDays: sum(mine, (x) => x.c.dayDays),
          sellable: sum(mine, (x) => x.c.sellable)
        }
        return {
          id: type.id,
          name: type.name,
          nameI18n: type.nameI18n ?? null,
          ...n.view(c),
          revenueMinor: revenue ? sum(mine, (x) => revenue.get(x.r.id) ?? 0) : null,
          rooms: mine.length
        }
      })
      .filter((t) => t.rooms > 0)
      .map(({ rooms: _rooms, ...t }) => t)
    const g = repeatGuests(db, p)
    const outcomes = outcomeFacts(db, p, (iso) => localDateOf(new Date(iso)))
    let topGuests: OccupancyReport['topGuests'] = null
    if (finance && can(ctx, 'guests')) {
      const signed = sql`case when ${payments.kind} = 'refund' then -1 else 1 end`
      const total = sql<number>`coalesce(sum(${signed} * coalesce(${payments.amountBaseMinor}, 0)), 0)`
      topGuests = db
        .select({
          guestId: guests.id,
          first: guests.firstName,
          last: guests.lastName,
          stays: sql<number>`count(distinct ${reservations.id})`,
          revenueMinor: total
        })
        .from(payments)
        .innerJoin(folios, eq(folios.id, payments.folioId))
        .innerJoin(reservations, eq(reservations.id, folios.reservationId))
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(and(isNull(payments.voidedAt), gte(payments.date, p.from), lt(payments.date, p.to)))
        .groupBy(guests.id)
        .orderBy(desc(total))
        .limit(10)
        .all()
        .filter((r) => r.revenueMinor > 0)
        .map((r) => ({
          guestId: r.guestId,
          name: `${r.first} ${r.last ?? ''}`.trim(),
          stays: r.stays,
          revenueMinor: r.revenueMinor
        }))
    }
    return {
      from: p.from,
      to: p.to,
      baseCurrency: base,
      dayUseIncluded: n.dayUseIncluded,
      months: [...n.byMonth]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, c]) => ({ month, ...n.view(c) })),
      heatmap: [...n.byHeat]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, c]) => {
          const [month, wd] = key.split('|') as [string, string]
          return { month, weekday: Number(wd), ...n.view(c) }
        }),
      roomTypes: typeRows,
      rooms: roomRows.map(({ r, c }) => ({
        id: r.id,
        number: r.number,
        typeId: r.typeId,
        ...n.view(c),
        revenueMinor: revenue ? (revenue.get(r.id) ?? 0) : null
      })),
      guests: { ...g, repeatBp: basisPoints(g.repeat, g.total) },
      topGuests,
      outcomes: {
        cancelled: outcomes.cancelled,
        noShow: outcomes.noShow,
        refundRows: finance ? outcomes.refundRows : null,
        refundMinor: finance ? outcomes.refundBaseMinor : null
      },
      missingNightRates: rooms?.missing ?? 0
    }
  }

  function cashOf(_ctx: Ctx, p: Period): CashReport {
    const now = today()
    const methods = new Map(
      db
        .select()
        .from(paymentMethods)
        .all()
        .map((m) => [m.id, m])
    )
    const facts = paymentFacts(db, p, 'month')
    const byMethod = new Map<string, CashReport['methods'][number]>()
    for (const f of facts) {
      const m = methods.get(f.methodId)
      const key = `${f.methodId}|${f.currency}`
      const row = byMethod.get(key) ?? {
        methodId: f.methodId,
        code: m?.code ?? '',
        name: m?.name ?? null,
        nameI18n: m?.nameI18n ?? null,
        group: f.group,
        currency: f.currency,
        amountMinor: 0,
        baseMinor: 0,
        pendingMinor: 0,
        rows: 0,
        pendingRows: 0
      }
      row.amountMinor += f.amountMinor
      row.baseMinor += f.baseMinor
      row.pendingMinor += f.pendingMinor
      row.rows += f.rows
      row.pendingRows += f.pendingRows
      byMethod.set(key, row)
    }
    const handoverRows = db
      .select()
      .from(cashHandovers)
      // `at` is UTC: a day around the period, then the hotel-local day decides.
      .where(
        and(
          gte(cashHandovers.at, `${addDays(p.from, -1)}T00:00:00`),
          lt(cashHandovers.at, `${addDays(p.to, 1)}T00:00:00`)
        )
      )
      .orderBy(desc(cashHandovers.at))
      .limit(200)
      .all()
      .filter((h) => {
        const day = localDateOf(new Date(h.at))
        return day >= p.from && day < p.to
      })
    const ids = handoverRows.map((h) => h.id)
    const signed = sql`case when ${payments.kind} = 'refund' then -1 else 1 end`
    const takenRows = ids.length
      ? db
          .select({
            id: payments.handoverId,
            currency: payments.currency,
            amount: sql<number>`sum(${signed} * ${payments.amountMinor})`,
            n: sql<number>`count(*)`
          })
          .from(payments)
          .where(and(inArray(payments.handoverId, ids), isNull(payments.voidedAt)))
          .groupBy(payments.handoverId, payments.currency)
          .all()
      : []
    const names = new Map(
      db
        .select({ id: users.id, name: users.displayName })
        .from(users)
        .all()
        .map((u) => [u.id, u.name])
    )
    const handovers = handoverRows.map((h) => {
      const mine = takenRows.filter((r) => r.id === h.id)
      const stored = (h.totals as { payments?: number }).payments
      return {
        id: h.id,
        at: h.at,
        byName: (h.byUser && names.get(h.byUser)) || null,
        paymentCount: h.revertedAt ? (stored ?? 0) : sum(mine, (r) => r.n),
        totals: mine.map((r) => ({ currency: r.currency, amountMinor: r.amount })),
        reverted: h.revertedAt !== null
      }
    })
    // Aging of everything not yet taken, up to the period's end.
    const pendingRows = db
      .select({
        date: payments.date,
        base: sql<number>`coalesce(sum(${signed} * coalesce(${payments.amountBaseMinor}, 0)), 0)`,
        n: sql<number>`count(*)`
      })
      .from(payments)
      .where(and(isNull(payments.voidedAt), isNull(payments.collectedAt), lt(payments.date, p.to)))
      .groupBy(payments.date)
      .all()
    const ref = p.to <= now ? addDays(p.to, -1) : now
    const aging = (['d0_7', 'd8_30', 'd31_90', 'd90'] as const).map((bucket) => ({
      bucket,
      baseMinor: 0,
      rows: 0
    }))
    for (const r of pendingRows) {
      const age = diffDays(r.date as LocalDate, ref)
      const i = age <= 7 ? 0 : age <= 30 ? 1 : age <= 90 ? 2 : 3
      aging[i]!.baseMinor += r.base
      aging[i]!.rows += r.n
    }
    const uncheckedWhere = and(
      isNull(payments.voidedAt),
      isNull(payments.collectedAt),
      gte(payments.date, p.from),
      lt(payments.date, p.to),
      ne(paymentMethods.group, 'cash')
    )
    const uncheckedTotal =
      db
        .select({ n: sql<number>`count(*)` })
        .from(payments)
        .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
        .where(uncheckedWhere)
        .get()?.n ?? 0
    const channelOf = new Map(
      db
        .select({ id: salesChannels.id, code: salesChannels.code })
        .from(salesChannels)
        .all()
        .map((c) => [c.id, c.code])
    )
    const unchecked = db
      .select({
        id: payments.id,
        date: payments.date,
        group: paymentMethods.group,
        kind: payments.kind,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        channelId: payments.channelId,
        resChannelId: reservations.channelId,
        code: reservations.code,
        first: guests.firstName,
        last: guests.lastName,
        title: folios.title
      })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .innerJoin(folios, eq(folios.id, payments.folioId))
      .leftJoin(reservations, eq(reservations.id, folios.reservationId))
      .leftJoin(guests, eq(guests.id, reservations.primaryGuestId))
      .where(uncheckedWhere)
      .orderBy(desc(payments.date), desc(payments.createdAt))
      .limit(300)
      .all()
      .map((r) => ({
        id: r.id,
        date: r.date as LocalDate,
        group: r.group,
        amountMinor: r.kind === 'refund' ? -r.amountMinor : r.amountMinor,
        currency: r.currency,
        guestName: r.first != null ? `${r.first} ${r.last ?? ''}`.trim() : (r.title ?? null),
        reservationCode: r.code ?? null,
        channelCode: channelOf.get(r.channelId ?? r.resChannelId ?? '') ?? null
      }))
    // The drawer now: uncollected cash − unsettled drawer expenses (every section: it is physical money).
    const cashIn = db
      .select({ currency: payments.currency, amount: sql<number>`sum(${signed} * ${payments.amountMinor})` })
      .from(payments)
      .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(and(isNull(payments.voidedAt), isNull(payments.collectedAt), eq(paymentMethods.isCash, true)))
      .groupBy(payments.currency)
      .all()
    const cashOut = db
      .select({ currency: expenses.currency, amount: sql<number>`sum(${expenses.amountMinor})` })
      .from(expenses)
      .where(and(isNull(expenses.voidedAt), eq(expenses.paidFromDrawer, true), isNull(expenses.settledAt)))
      .groupBy(expenses.currency)
      .all()
    const drawer = new Map<string, number>()
    for (const r of cashIn) drawer.set(r.currency, (drawer.get(r.currency) ?? 0) + r.amount)
    for (const r of cashOut) drawer.set(r.currency, (drawer.get(r.currency) ?? 0) - r.amount)
    return {
      from: p.from,
      to: p.to,
      today: now,
      baseCurrency: baseCurrencyOf(db),
      methods: [...byMethod.values()].sort((a, b) => b.baseMinor - a.baseMinor),
      handovers,
      aging,
      unchecked,
      uncheckedTotal,
      drawer: [...drawer]
        .filter(([, v]) => v !== 0)
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
        .sort((a, b) => (a.currency < b.currency ? -1 : 1))
    }
  }

  function expensesOf(ctx: Ctx, p: Period): ExpensesReport {
    const access = sectionAccess(db, ctx)
    const exps = expenseFacts(db, p, 'month', access)
    const revenue = sum(paymentFacts(db, p, 'month'), (r) => r.baseMinor)
    const total = sum(exps, (e) => e.baseMinor)
    const staff = sum(
      exps.filter((e) => e.kind === 'staff'),
      (e) => e.baseMinor
    )
    const months = new Map<string, { month: string; totalMinor: number; staffMinor: number }>()
    for (const e of exps) {
      const m = months.get(e.bucket) ?? { month: e.bucket, totalMinor: 0, staffMinor: 0 }
      m.totalMinor += e.baseMinor
      if (e.kind === 'staff') m.staffMinor += e.baseMinor
      months.set(e.bucket, m)
    }
    return {
      from: p.from,
      to: p.to,
      baseCurrency: baseCurrencyOf(db),
      totalMinor: total,
      staffMinor: staff,
      revenueMinor: revenue,
      laborRatioBp: basisPoints(Math.max(0, staff), revenue),
      months: [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
      sections: sections(access, exps),
      topExpenses: topExpenses(expensesForTop(db, p, access)),
      categories: categoryList(),
      fxSources: fxSourceFacts(db, p, baseCurrencyOf(db), access).filter((f) => f.kind === 'expense'),
      missingRate: { payments: 0, expenses: sum(exps, (e) => e.missing) },
      partial: access.partial
    }
  }

  /**
   * Personel raporu: hours and leave days for `reports.staff`; the money columns only with `staff.salary`, read
   * from the sections the caller sees (G-67, K-42 like the ledger); revenue and the staff-cost ratio only with
   * `reports.finance` as well.
   */
  function staffOf(ctx: Ctx, year: number): StaffReport {
    const p = yearPeriod(year)
    const month = sql<string>`substr(${expenses.date}, 1, 7)`
    const salaryVisible = can(ctx, 'staff.salary')
    const access = sectionAccess(db, ctx)
    const costs =
      !salaryVisible || !access.viewIds.length
        ? []
        : db
            .select({
              employeeId: expenses.employeeId,
              kind: staffTransactions.kind,
              month,
              base: sql<number>`coalesce(sum(coalesce(${expenses.amountBaseMinor}, 0)), 0)`
            })
            .from(expenses)
            .leftJoin(staffTransactions, eq(staffTransactions.id, expenses.staffTxnId))
            .where(
              and(
                isNull(expenses.voidedAt),
                eq(expenses.kind, 'staff'),
                gte(expenses.date, p.from),
                lt(expenses.date, p.to),
                access.where
              )
            )
            .groupBy(expenses.employeeId, staffTransactions.kind, month)
            .all()
    const leave = db
      .select({ employeeId: leaveRecords.employeeId, kind: leaveRecords.kind, n: sql<number>`count(*)` })
      .from(leaveRecords)
      .where(and(isNull(leaveRecords.voidedAt), gte(leaveRecords.date, p.from), lt(leaveRecords.date, p.to)))
      .groupBy(leaveRecords.employeeId, leaveRecords.kind)
      .all()
    const work = db
      .select({
        employeeId: workRecords.employeeId,
        worked: sql<number>`coalesce(sum(${workRecords.minutesWorked}), 0)`,
        overtime: sql<number>`coalesce(sum(${workRecords.overtimeMinutes}), 0)`
      })
      .from(workRecords)
      .where(and(gte(workRecords.date, p.from), lt(workRecords.date, p.to)))
      .groupBy(workRecords.employeeId)
      .all()
    const staffRows = db.select().from(employees).all()
    const collator = new Intl.Collator('tr')
    const rows = staffRows
      .map((e) => {
        const mine = costs.filter((c) => c.employeeId === e.id)
        const byKind: StaffReport['employees'][number]['byKind'] = {}
        for (const c of mine)
          addTo(byKind, c.kind && STAFF_KINDS.has(c.kind) ? (c.kind as 'advance') : 'other', c.base)
        const leaveOf: StaffReport['employees'][number]['leave'] = {}
        for (const l of leave.filter((x) => x.employeeId === e.id)) leaveOf[l.kind] = l.n
        const w = work.find((x) => x.employeeId === e.id)
        return {
          id: e.id,
          name: `${e.firstName} ${e.lastName}`.trim(),
          position: e.position,
          active: e.active,
          costMinor: salaryVisible ? sum(mine, (c) => c.base) : null,
          byKind,
          leave: leaveOf,
          workedMinutes: w?.worked ?? 0,
          overtimeMinutes: w?.overtime ?? 0
        }
      })
      .filter(
        (r) =>
          (r.costMinor ?? 0) !== 0 ||
          r.workedMinutes > 0 ||
          Object.keys(r.leave).length > 0 ||
          (r.active && staffRows.find((e) => e.id === r.id)!.startDate < p.to)
      )
      .sort((a, b) => collator.compare(a.name, b.name))
    const revenue = can(ctx, 'reports.finance') ? sum(paymentFacts(db, p, 'month'), (r) => r.baseMinor) : null
    const total = sum(costs, (c) => c.base)
    return {
      year,
      baseCurrency: baseCurrencyOf(db),
      salaryVisible,
      partial: salaryVisible && access.viewIds.length < access.all.length,
      employees: rows,
      months: Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, '0')}`
        return {
          month: i + 1,
          costMinor: salaryVisible
            ? sum(
                costs.filter((c) => c.month === key),
                (c) => c.base
              )
            : null
        }
      }),
      revenueMinor: revenue,
      laborRatioBp: salaryVisible && revenue !== null ? basisPoints(Math.max(0, total), revenue) : null
    }
  }

  function monthEndOf(ctx: Ctx, year: number, month: number): MonthEnd {
    const key = `${year}-${String(month).padStart(2, '0')}`
    const p = monthPeriod(key)
    const prevP = monthPeriod(addMonths(key, -1))
    const m = money(ctx, p)
    const prev = money(ctx, prevP)
    const groupOf = (g: MethodGroup) => m.pays.filter((f: PaymentFact) => f.group === g)
    // Card, IBAN and cash always; the hotel's own methods (online, platform, account, other) when they took money,
    // so the table adds up to the revenue (cash last: it is shown for reference, not checked against a bank).
    const extraGroups = METHOD_GROUPS.filter(
      (g) => !(CHECK_GROUPS as readonly string[]).includes(g) && groupOf(g).some((f) => f.rows > 0)
    )
    const order: MethodGroup[] = ['card', 'bank', ...extraGroups, 'cash']
    const methods = order.map((group) => {
      const rows = groupOf(group)
      const total = sum(rows, (r) => r.baseMinor)
      const pending = sum(rows, (r) => r.pendingBaseMinor)
      return {
        group,
        totalMinor: total,
        receivedMinor: total - pending,
        pendingMinor: pending,
        pendingRows: sum(rows, (r) => r.pendingRows)
      }
    })
    const names = channelNames()
    const bank = new Map<string, number>()
    for (const f of groupOf('bank'))
      bank.set(f.channel ?? 'none', (bank.get(f.channel ?? 'none') ?? 0) + f.baseMinor)
    const n = nights(p)
    const np = nights(prevP)
    let salaries: MonthEnd['salaries'] = null
    if (can(ctx, 'staff.salary')) {
      const table = deps.staff.salaryTable(ctx, year, month)
      salaries = { rows: table.rows, withoutSalary: table.withoutSalary.length }
    }
    let tourism: MonthEnd['tourism'] = null
    if (can(ctx, 'tourism_stats')) {
      const imp = db
        .select({ reportedAt: kbsImports.reportedAt })
        .from(kbsImports)
        .where(and(eq(kbsImports.periodYear, year), eq(kbsImports.periodMonth, month)))
        .orderBy(desc(kbsImports.importedAt), desc(kbsImports.id))
        .all()
      // The newest import decides, like the tourism screen (a new import keeps an earlier "bildirildi").
      tourism = {
        imported: imp.length > 0,
        reportedAt: imp[0]?.reportedAt ?? null,
        due: addDays(firstOfMonth(addMonths(key, 1)), 9)
      }
    }
    return {
      year,
      month,
      from: p.from,
      to: p.to,
      today: today(),
      baseCurrency: baseCurrencyOf(db),
      methods,
      bankByChannel: [...bank]
        .filter(([, v]) => v !== 0)
        .map(([code, baseMinor]) => {
          const c = names.get(code)
          return { code, name: c?.name ?? null, nameI18n: c?.nameI18n ?? null, baseMinor }
        })
        .sort((a, b) => b.baseMinor - a.baseMinor),
      revenueMinor: m.revenue,
      expensesMinor: m.spent,
      profitMinor: m.revenue - m.spent,
      previous: {
        revenueMinor: prev.revenue,
        expensesMinor: prev.spent,
        profitMinor: prev.revenue - prev.spent
      },
      occupancy: {
        soldNights: n.view(n.total).soldNights,
        sellableNights: n.total.sellable,
        previousSold: np.view(np.total).soldNights,
        previousSellable: np.total.sellable
      },
      topExpenses: topExpenses(expensesForTop(db, p, m.access)).slice(0, 10),
      categories: categoryList(),
      salaries,
      tourism,
      fxSources: fxSourceFacts(db, p, baseCurrencyOf(db), m.access),
      missingRate: m.missingRate,
      partial: m.access.partial
    }
  }

  // ── permission gates ─────────────────────────────────────────────────────────────────────────────────────────

  const service = {
    context(ctx: Ctx): ReportsContext {
      if (!(['reports.operations', 'reports.finance', 'reports.staff'] as const).some((k) => can(ctx, k)))
        throw permissionDenied()
      return {
        today: today(),
        baseCurrency: baseCurrencyOf(db),
        firstDay: firstDataDay(db),
        dayUseIncluded: true
      }
    },

    /** KPI cards: occupancy for `reports.operations`, money only with `reports.finance`. */
    summary(ctx: Ctx, input: unknown): ReportSummary {
      requirePermission(ctx, 'reports.operations', 'view')
      const { p, kind } = kindedPeriod(input)
      return summaryOf(ctx, p, kind)
    },

    monthly(ctx: Ctx, input: unknown): MonthlyReport {
      requirePermission(ctx, 'reports.finance', 'view')
      return monthlyOf(ctx, period(input))
    },

    yearly(ctx: Ctx, input: unknown): YearlyReport {
      requirePermission(ctx, 'reports.finance', 'view')
      return yearlyOf(ctx, parseInput(yearlyInputSchema, input).years)
    },

    occupancy(ctx: Ctx, input: unknown): OccupancyReport {
      requirePermission(ctx, 'reports.operations', 'view')
      const { p, kind } = kindedPeriod(input)
      return occupancyOf(ctx, p, kind)
    },

    cash(ctx: Ctx, input: unknown): CashReport {
      requirePermission(ctx, 'reports.finance', 'view')
      return cashOf(ctx, period(input))
    },

    expenses(ctx: Ctx, input: unknown): ExpensesReport {
      requirePermission(ctx, 'reports.finance', 'view')
      return expensesOf(ctx, period(input))
    },

    staff(ctx: Ctx, input: unknown): StaffReport {
      requirePermission(ctx, 'reports.staff', 'view')
      return staffOf(ctx, parseInput(staffInputSchema, input).year)
    },

    monthEnd(ctx: Ctx, input: unknown): MonthEnd {
      requirePermission(ctx, 'reports.finance', 'view')
      const { year, month } = parseInput(monthEndInputSchema, input)
      return monthEndOf(ctx, year, month)
    },

    /** The person's own "baktım" ticks of the month (K-46 (6)): the same on every device they sign in from. */
    monthEndTicks(ctx: Ctx, input: unknown): { ticks: MonthEndManualStep[] } {
      requirePermission(ctx, 'reports.finance', 'view')
      const { year, month } = parseInput(monthEndInputSchema, input)
      return { ticks: readMonthEndTicks(deps.db, ctx, year, month) }
    },

    /** Keeps the ticks for this person only; a personal view, so no audit row (like the ledger's remembered order). */
    setMonthEndTicks(ctx: Ctx, input: unknown): { ticks: MonthEndManualStep[] } {
      requirePermission(ctx, 'reports.finance', 'view')
      const data = parseInput(monthEndTicksInputSchema, input)
      const now = deps.clock()
      return { ticks: deps.db.transaction((tx) => writeMonthEndTicks(tx, ctx, data, now)) }
    },

    /** One report's tables as CSV (one table) or XLSX (one or all); the report's own permission applies too. */
    async export(ctx: Ctx, input: ReportExportInput): Promise<ExportFile> {
      requirePermission(ctx, 'reports.export', 'view')
      const data = parseInput(reportExportInputSchema, input)
      const needPeriod = (): Period => period({ from: data.from, to: data.to })
      const t = translator(data.locale)
      let report: ReportData
      switch (data.report) {
        case 'summary': {
          const p = needPeriod()
          report = { kind: 'summary', data: service.summary(ctx, p) }
          break
        }
        case 'monthly':
          report = { kind: 'monthly', data: service.monthly(ctx, needPeriod()) }
          break
        case 'yearly':
          report = { kind: 'yearly', data: service.yearly(ctx, { years: data.years ?? [data.year ?? 0] }) }
          break
        case 'occupancy':
          report = { kind: 'occupancy', data: service.occupancy(ctx, needPeriod()) }
          break
        case 'cash':
          report = { kind: 'cash', data: service.cash(ctx, needPeriod()) }
          break
        case 'expenses':
          report = { kind: 'expenses', data: service.expenses(ctx, needPeriod()) }
          break
        case 'staff':
          report = { kind: 'staff', data: service.staff(ctx, { year: data.year ?? 0 }) }
          break
        case 'monthEnd':
          report = { kind: 'monthEnd', data: service.monthEnd(ctx, { year: data.year, month: data.month }) }
          break
      }
      const all = buildTables(report, { locale: data.locale, t })
      const tables = data.table ? all.filter((tb) => tb.id === data.table) : all
      if (!tables.length) throw invalid('errors.validation', { fields: { table: ['unknown table'] } })
      const opts = { locale: data.locale, t, timeZone: readSetting(db, 'hotel.timezone') }
      const bytes =
        data.format === 'csv' ? Buffer.from(toCsv(tables[0]!, opts), 'utf8') : await toXlsx(tables, opts)
      const title = tables.length === 1 ? tables[0]!.title : t(`reports.file.${data.report}`)
      const range =
        data.from && data.to
          ? `${data.from}_${addDays(data.to as LocalDate, -1)}`
          : data.year && data.month
            ? `${data.year}-${String(data.month).padStart(2, '0')}`
            : (data.years ?? [data.year]).join('-')
      const fileName = `${title} ${range}.${data.format}`.replace(/[\\/:*?"<>|]/g, '-')
      const rows = tables.reduce((s, tb) => s + tb.rows.length, 0)
      const local = ctx.transport === 'ipc' && deps.saveFile ? deps.saveFile : null
      const savedPath = local ? await local(fileName, bytes) : null
      const head = { fileName, mime: MIME[data.format], rows }
      if (local && savedPath === null) return { ...head, base64: '', delivery: 'canceled', savedPath: null }
      inTransaction(deps, ctx, (_tx, audit) =>
        audit({
          entity: 'backup',
          entityId: `report:${data.report}`,
          action: 'export',
          after: { report: data.report, table: data.table ?? null, format: data.format, rows, range }
        })
      )
      return local
        ? { ...head, base64: '', delivery: 'saved', savedPath }
        : { ...head, base64: bytes.toString('base64'), delivery: 'download', savedPath: null }
    }
  }
  return service
}

export type ReportsService = ReturnType<typeof createReportsService>
