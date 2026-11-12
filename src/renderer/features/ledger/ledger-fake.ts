// Test helper (imported by tests only): an in-memory stand-in for the ledger procedures over the shared settings and
// sign-in fake (test/render.tsx). It keeps what the screens show — the day's rows, the drawer matrix (the shared
// cashPanel rule), handovers — and records every call; the service tests cover the rules. Names and amounts are
// invented.
import { SETTINGS_DEFAULTS, type ProcedureName, type ProcedureOutput } from '@shared/contract'
import { cashPanel } from '@shared/domain/cash'
import { money, multiplyRatio } from '@shared/money'
import type { LocalDate } from '@shared/date'
import { ApiError, type Transport } from '@/lib/transport/types'
import { fakeTransport } from '@/test/render'

type Options = ProcedureOutput<'ledger.options'>
type Day = ProcedureOutput<'ledger.day'>
type Income = Day['income'][number]
type Expense = Day['expenses'][number]
type Handover = ProcedureOutput<'ledger.handovers'>[number]
type Hit = ProcedureOutput<'ledger.searchReservations'>[number]
type Group = ProcedureOutput<'ledger.descriptionGroups'>[number]

export const TODAY = '2026-10-04' as LocalDate
const STAMP = '2026-10-04T07:00:00.000Z'

const named = (id: string, code: string, tr: string, en = tr, ru = tr) => ({
  id,
  code,
  name: null,
  nameI18n: { tr, en, ru }
})

export function ledgerOptions(partial: Partial<Options> = {}): Options {
  return {
    today: TODAY,
    baseCurrency: 'TRY',
    currencies: ['TRY', 'EUR'],
    closingEnabled: false,
    sort: 'method',
    methods: [
      { ...named('m-cash', 'cash', 'Nakit', 'Cash', 'Наличные'), group: 'cash', isCash: true },
      { ...named('m-card', 'card', 'Kredi kartı', 'Card', 'Карта'), group: 'card', isCash: false },
      { ...named('m-bank', 'bank', 'Havale / EFT (IBAN)'), group: 'bank', isCash: false }
    ],
    channels: [
      { ...named('ch-direct', 'direct', 'Doğrudan'), kind: 'direct' },
      { ...named('ch-booking', 'booking', 'Booking.com'), kind: 'ota' }
    ],
    extraServices: [
      {
        ...named('x-luggage', 'luggage', 'Bavul emaneti'),
        defaultPriceMinor: 15_000,
        defaultCurrency: 'TRY',
        unit: 'per_bag_day'
      }
    ],
    sections: [
      { ...named('s-general', 'general', 'Genel giderler'), canEdit: true, drawerAllowed: true },
      { ...named('s-owner', 'owner', 'Sahip giderleri'), canEdit: true, drawerAllowed: false }
    ],
    ...partial
  }
}

export function income(partial: Partial<Income> & Pick<Income, 'id' | 'amountMinor'>): Income {
  return {
    at: STAMP,
    date: TODAY,
    kind: 'payment',
    methodId: 'm-cash',
    methodCode: 'cash',
    methodGroup: 'cash',
    isCash: true,
    currency: 'TRY',
    amountBaseMinor: partial.amountMinor,
    fxRateToBase: 1_000_000,
    fxRateObservedAt: null,
    fxSource: null,
    folioCurrency: 'TRY',
    channelId: null,
    channelCode: null,
    reservationId: 'r-1',
    reservationCode: 'R-0001',
    guestName: 'Deniz Yıldırım',
    roomNumbers: ['101'],
    saleTitle: null,
    reference: null,
    note: null,
    collected: false,
    collectedAt: null,
    collectedByName: null,
    handoverId: null,
    createdByName: 'Otel Sahibi',
    recordedByEmployeeId: null,
    voided: false,
    voidReason: null,
    ...partial
  }
}

export function expense(
  partial: Partial<Expense> & Pick<Expense, 'id' | 'amountMinor' | 'description'>
): Expense {
  return {
    at: STAMP,
    date: TODAY,
    sectionId: 's-general',
    sectionCode: 'general',
    kind: 'manual',
    staffKind: null,
    descriptionKey: partial.description.toLocaleLowerCase('tr'),
    currency: 'TRY',
    amountBaseMinor: partial.amountMinor,
    fxRateToBase: 1_000_000,
    fxRateObservedAt: null,
    fxSource: null,
    methodId: null,
    methodGroup: 'cash',
    paidFromDrawer: true,
    settled: false,
    handoverId: null,
    employeeId: null,
    employeeName: null,
    laundrySettlementId: null,
    items: [],
    createdByName: 'Otel Sahibi',
    recordedByEmployeeId: null,
    voided: false,
    voidReason: null,
    ...partial
  }
}

export interface LedgerState {
  options: Options
  income: Income[]
  expenses: Expense[]
  notes: Record<string, string>
  closed: string[]
  handovers: Handover[]
  hits: Hit[]
  partial: boolean
  /** Currencies without a known rate (K-43: the forms ask for a typed one). */
  missingRates?: string[]
  /** Rows the dictionary rename left alone because their day is closed (B16). */
  skippedClosed?: number
}

/** A small day: cash, card and IBAN payments (one voided), a drawer expense and a locked salary payment. */
export function sampleLedger(): LedgerState {
  return {
    options: ledgerOptions(),
    income: [
      income({
        id: 'p-card',
        amountMinor: 500_000,
        methodId: 'm-card',
        methodCode: 'card',
        methodGroup: 'card',
        isCash: false,
        at: '2026-10-04T08:00:00.000Z'
      }),
      income({
        id: 'p-cash',
        amountMinor: 300_000,
        at: '2026-10-04T09:00:00.000Z',
        channelId: 'ch-booking',
        channelCode: 'booking'
      }),
      income({
        id: 'p-bank',
        amountMinor: 100_000,
        methodId: 'm-bank',
        methodCode: 'bank',
        methodGroup: 'bank',
        isCash: false,
        guestName: 'Ayşe Demir',
        roomNumbers: ['202'],
        at: '2026-10-04T10:00:00.000Z'
      }),
      income({
        id: 'p-eur',
        amountMinor: 10_000,
        currency: 'EUR',
        amountBaseMinor: null,
        fxRateToBase: null,
        guestName: 'Olga Petrova',
        roomNumbers: ['301'],
        at: '2026-10-04T11:00:00.000Z'
      }),
      income({
        id: 'p-void',
        amountMinor: 3_000_000,
        voided: true,
        voidReason: 'yanlış tutar',
        at: '2026-10-04T08:30:00.000Z'
      })
    ],
    expenses: [
      expense({ id: 'e-market', amountMinor: 40_000, description: 'Market' }),
      expense({
        id: 'e-salary',
        amountMinor: 3_000_000,
        description: 'Selin Kaya',
        kind: 'staff',
        staffKind: 'salary_payment',
        employeeId: 'emp-1',
        employeeName: 'Selin Kaya',
        paidFromDrawer: false,
        methodId: 'm-bank',
        methodGroup: 'bank'
      })
    ],
    notes: { [TODAY]: 'Selin izin kullandı.' },
    closed: [],
    handovers: [],
    hits: [
      {
        reservationId: 'r-1',
        code: 'R-0001',
        guestName: 'Deniz Yıldırım',
        roomNumbers: ['101'],
        checkIn: '2026-10-03' as LocalDate,
        checkOut: '2026-10-06' as LocalDate,
        status: 'checked_in',
        currency: 'TRY',
        balanceMinor: 450_000,
        channelId: 'ch-booking'
      }
    ],
    partial: false
  }
}

const signed = (r: Income): number => (r.kind === 'refund' ? -r.amountMinor : r.amountMinor)

export function ledgerTransport(state: LedgerState = sampleLedger(), opts: { fail?: ProcedureName[] } = {}) {
  const base = fakeTransport(SETTINGS_DEFAULTS)
  const calls: { name: ProcedureName; input: unknown }[] = []
  let next = 1
  const id = (p: string): string => `${p}-new-${next++}`

  const dayOf = (date: string): Day => {
    const income = state.income.filter((r) => r.date === date)
    const expenses = state.expenses.filter((e) => e.date === date)
    const byCurrency = new Map<string, { currency: string; incomeMinor: number; expensesMinor: number }>()
    const of = (c: string) => {
      const v = byCurrency.get(c) ?? { currency: c, incomeMinor: 0, expensesMinor: 0 }
      byCurrency.set(c, v)
      return v
    }
    for (const r of income) if (!r.voided) of(r.currency).incomeMinor += signed(r)
    for (const e of expenses) if (!e.voided) of(e.currency).expensesMinor += e.amountMinor
    const revenue = income
      .filter((r) => !r.voided && r.amountBaseMinor != null)
      .reduce((s, r) => s + signed(r), 0)
    const spent = expenses.filter((e) => !e.voided).reduce((s, e) => s + (e.amountBaseMinor ?? 0), 0)
    return {
      date: date as LocalDate,
      status: state.closed.includes(date) ? 'closed' : 'open',
      closedAt: null,
      closedByName: null,
      note: state.notes[date] ?? null,
      closingEnabled: state.options.closingEnabled,
      income,
      expenses,
      totals: {
        baseCurrency: 'TRY',
        revenueBaseMinor: revenue,
        expensesBaseMinor: spent,
        netBaseMinor: revenue - spent,
        missingRate: income.filter((r) => !r.voided && r.amountBaseMinor == null).length,
        byCurrency: [...byCurrency.values()]
      },
      partial: state.partial
    }
  }

  const panel = (): ProcedureOutput<'ledger.cashPanel'> => {
    const open = state.income.filter((r) => !r.collected && !r.voided)
    const drawerExpenses = state.expenses.filter((e) => e.paidFromDrawer && !e.settled && !e.voided)
    const p = cashPanel(open, drawerExpenses)
    return {
      baseCurrency: 'TRY',
      pending: p.pending as Record<string, Record<string, number>>,
      pendingToday: cashPanel(
        open.filter((r) => r.date <= TODAY),
        []
      ).pending as Record<string, Record<string, number>>,
      drawer: p.drawer,
      channels: cashPanel(
        state.income.filter((r) => !r.voided),
        []
      ).channels,
      monthFrom: '2026-10-01' as LocalDate,
      uncollectedCount: open.length,
      unsettledExpenseCount: drawerExpenses.length,
      oldestDate: open.length ? TODAY : null,
      lastHandover: state.handovers[0] ?? null,
      partial: state.partial,
      cashToday: cashPanel(
        open.filter((r) => r.date <= TODAY && r.isCash),
        []
      ).drawer,
      drawerOut: drawerExpenses.map((e) => ({
        date: e.date as LocalDate,
        currency: e.currency,
        expensesMinor: e.kind === 'staff' ? 0 : e.amountMinor,
        staffMinor: e.kind === 'staff' ? e.amountMinor : 0
      }))
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (name: ProcedureName, input: any): unknown => {
    if (opts.fail?.includes(name)) throw new ApiError('INTERNAL', 500, 'errors.loadFailed')
    switch (name) {
      case 'ledger.options':
        return state.options
      case 'ledger.day':
        return dayOf(input.date)
      case 'ledger.month':
        return {
          year: input.year,
          month: input.month,
          from: '2026-10-01',
          to: '2026-11-01',
          baseCurrency: 'TRY',
          closingEnabled: state.options.closingEnabled,
          days: Object.entries(state.notes).map(([date, note]) => ({
            date,
            status: state.closed.includes(date) ? 'closed' : 'open',
            note
          })),
          income: state.income,
          expenses: state.expenses,
          employees: [{ id: 'emp-1', name: 'Selin Kaya' }],
          partial: state.partial
        }
      case 'ledger.setSort':
      case 'ledger.closeDay':
      case 'ledger.reopenDay':
        return { ok: true }
      case 'ledger.setDayNote':
        state.notes[input.date] = input.note ?? ''
        return { ok: true }
      case 'ledger.cashPanel':
        return panel()
      case 'ledger.handovers':
        return state.handovers
      case 'ledger.handover': {
        const p = panel()
        const rows = state.income.filter(
          (r) =>
            !r.collected &&
            !r.voided &&
            (input.paymentIds ? input.paymentIds.includes(r.id) : !input.onlyCash || r.isCash)
        )
        for (const r of rows) Object.assign(r, { collected: true, collectedByName: 'Otel Sahibi' })
        const settled = input.paymentIds ? [] : state.expenses.filter((e) => e.paidFromDrawer && !e.settled)
        for (const e of settled) e.settled = true
        const h: Handover = {
          id: id('h'),
          at: '2026-10-04T18:00:00.000Z',
          byName: 'Otel Sahibi',
          note: input.note ?? null,
          pending: p.pending,
          drawer: p.drawer,
          paymentCount: rows.length,
          expenseCount: settled.length,
          revertedAt: null,
          revertedByName: null,
          revertReason: null
        }
        state.handovers.unshift(h)
        return { id: h.id, payments: rows.length, expenses: settled.length }
      }
      case 'ledger.revertHandover': {
        const h = state.handovers.find((x) => x.id === input.id)
        if (h) Object.assign(h, { revertedAt: '2026-10-04T19:00:00.000Z', revertReason: input.reason })
        for (const r of state.income) r.collected = false
        return { ok: true }
      }
      case 'ledger.searchReservations':
        return input.q
          ? state.hits.filter((h) => h.guestName.toLowerCase().includes(input.q.toLowerCase()))
          : state.hits
      case 'ledger.addPayment': {
        const row = income({
          id: id('p'),
          amountMinor: input.amountMinor,
          date: input.date,
          methodId: input.methodId
        })
        state.income.push(row)
        return { id: row.id }
      }
      case 'ledger.updatePayment':
      case 'ledger.voidPayment': {
        const row = state.income.find((r) => r.id === input.id)
        if (row && name === 'ledger.voidPayment')
          Object.assign(row, { voided: true, voidReason: input.reason })
        if (row && input.patch) Object.assign(row, input.patch)
        return { id: input.id }
      }
      case 'ledger.sellExtra': {
        const row = income({
          id: id('p'),
          amountMinor: multiplyRatio(money(input.unitMinor, input.currency), input.qty).amountMinor,
          reservationId: null,
          reservationCode: null,
          guestName: null,
          roomNumbers: [],
          saleTitle: input.description ?? 'Bavul emaneti'
        })
        state.income.push(row)
        return { folioId: id('f'), chargeId: id('c'), paymentId: row.id }
      }
      case 'ledger.addExpense': {
        const row = expense({
          id: id('e'),
          amountMinor: input.amountMinor,
          description: input.description,
          date: input.date
        })
        state.expenses.push(row)
        return { id: row.id }
      }
      case 'ledger.updateExpense':
      case 'ledger.voidExpense': {
        const row = state.expenses.find((e) => e.id === input.id)
        if (row && name === 'ledger.voidExpense')
          Object.assign(row, { voided: true, voidReason: input.reason })
        return { id: input.id }
      }
      case 'ledger.suggestDescriptions': {
        const groups = descriptionGroups()
        return groups
          .filter((g) => !input.prefix || g.key.startsWith(input.prefix.toLocaleLowerCase('tr')))
          .map((g) => ({ description: g.description, key: g.key, count: g.count }))
      }
      case 'ledger.descriptionGroups':
        return descriptionGroups()
      case 'ledger.renameDescription': {
        let changed = 0
        for (const e of state.expenses)
          if (e.descriptionKey === input.key && e.kind === 'manual') {
            e.description = input.description
            e.descriptionKey = input.description.toLocaleLowerCase('tr')
            changed++
          }
        return {
          changed,
          key: input.description.toLocaleLowerCase('tr'),
          skippedClosed: state.skippedClosed ?? 0
        }
      }
      case 'ledger.knownRates':
        return {
          base: 'TRY',
          missing: (input.currencies as string[]).filter((c) => (state.missingRates ?? []).includes(c))
        }
      case 'supply.products':
        return [
          {
            id: 'prod-water',
            name: 'Damacana su',
            categoryId: 'cat-1',
            supplierContactId: null,
            unit: 'piece',
            trackStock: false,
            stockQtyMilli: null,
            active: true
          }
        ]
      default:
        return undefined
    }
  }

  function descriptionGroups(): Group[] {
    const groups = new Map<string, Group>()
    for (const e of state.expenses) {
      if (e.voided || e.kind !== 'manual') continue
      const g = groups.get(e.descriptionKey) ?? {
        key: e.descriptionKey,
        description: e.description,
        count: 0,
        spellings: []
      }
      g.count++
      const s = g.spellings.find((x) => x.description === e.description)
      if (s) s.count++
      else g.spellings.push({ description: e.description, count: 1 })
      groups.set(e.descriptionKey, g)
    }
    return [...groups.values()]
  }

  const transport: Transport & {
    calls: typeof calls
    callsTo: (n: ProcedureName) => unknown[]
    state: LedgerState
  } = {
    kind: 'ipc',
    calls,
    state,
    callsTo: (n) => calls.filter((c) => c.name === n).map((c) => c.input),
    async call(name, input) {
      calls.push({ name, input })
      const answer = handle(name, input ?? {})
      if (answer !== undefined) return structuredClone(answer) as never
      return base.call(name, input)
    }
  }
  return transport
}
