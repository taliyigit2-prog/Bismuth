// Handlers of procedures/ledger.ts (Faz 7): contract procedure → service call. Payments go through the same
// payments service as the reservation panel (one `payments` table, G-60); expenses through the expenses service
// that staff pay, laundry, supply and the import also use. Permissions are checked in the services.
import type { ledgerProcedures } from '@shared/contract/procedures/ledger'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

const ok = { ok: true } as const

export const ledgerHandlers = (services: Services): HandlersFor<keyof typeof ledgerProcedures> => ({
  'ledger.options': (ctx) => services.ledger.options(ctx),
  'ledger.day': (ctx, input) =>
    services.ledger.getDay(ctx, input.date, { includeVoided: input.includeVoided ?? false }),
  'ledger.month': (ctx, input) => services.ledger.month(ctx, input.year, input.month),
  'ledger.setSort': (ctx, input) => services.ledger.setSort(ctx, input.sort),
  'ledger.setDayNote': (ctx, input) => {
    services.ledger.setDayNote(ctx, input.date, input.note, input.reason)
    return ok
  },
  'ledger.closeDay': (ctx, input) => {
    services.ledger.closeDay(ctx, input.date)
    return ok
  },
  'ledger.reopenDay': (ctx, input) => {
    services.ledger.reopenDay(ctx, input.date, input.reason)
    return ok
  },

  'ledger.cashPanel': (ctx) => services.ledger.drawerPanel(ctx),
  'ledger.drawerSummary': (ctx) => services.ledger.drawerSummary(ctx),
  'ledger.handovers': (ctx, input) => services.ledger.handovers(ctx, input.limit ?? 30),
  'ledger.handover': (ctx, input) => {
    const done = services.payments.handover(ctx, input)
    return { id: done.id, payments: done.payments, expenses: done.expenses }
  },
  'ledger.revertHandover': (ctx, input) => {
    services.payments.revertHandover(ctx, input.id, input.reason)
    return ok
  },

  'ledger.searchReservations': (ctx, input) => services.ledger.searchReservations(ctx, input.q, input.date),
  'ledger.addPayment': (ctx, input) => ({ id: services.payments.create(ctx, input).id }),
  'ledger.updatePayment': (ctx, input) => ({ id: services.payments.update(ctx, input.id, input.patch).id }),
  'ledger.voidPayment': (ctx, input) => ({ id: services.payments.void(ctx, input.id, input.reason).id }),
  'ledger.sellExtra': (ctx, input) => services.payments.sellExtra(ctx, input),

  'ledger.expense': (ctx, input) => services.ledger.expenseRow(ctx, input.id),
  'ledger.addExpense': (ctx, input) => ({ id: services.expenses.createExpense(ctx, input).id }),
  'ledger.updateExpense': (ctx, input) => ({
    id: services.expenses.updateExpense(ctx, input.id, input.patch).id
  }),
  'ledger.voidExpense': (ctx, input) => ({
    id: services.expenses.voidExpense(ctx, input.id, input.reason).id
  }),
  'ledger.suggestDescriptions': (ctx, input) =>
    services.expenses.suggestDescriptions(ctx, input.prefix, input.limit),
  'ledger.descriptionGroups': (ctx) => services.expenses.descriptionGroups(ctx),
  'ledger.renameDescription': (ctx, input) =>
    services.expenses.renameDescription(ctx, input.key, input.description, input.reason),
  'ledger.knownRates': (ctx, input) => services.currency.knownRates(ctx, input.currencies)
})
