// Payments, deposits, refunds, the owner's "x" (handover) and extra-service sales (03-mimari.md §4.4, §6.3, §6.4,
// §6.5; G-43, G-61, G-64, G-68, G-70, K-15, S-30…S-32). Payments are never deleted: voided with a reason. A
// collected ("x") payment cannot be changed until its handover is reverted (§4.8-3).
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm'
import {
  extraSaleSchema,
  handoverSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  type ExtraSaleInput,
  type HandoverInput,
  type PaymentCreateInput,
  type PaymentUpdateInput
} from '@shared/contract/reservations'
import { cashPanel, type MethodGroup } from '@shared/domain/cash'
import { needsNewRate } from '@shared/domain/fx'
import { money, multiplyRatio } from '@shared/money'
import {
  cashHandovers,
  charges,
  expenses,
  extraServices,
  folios,
  paymentMethods,
  payments,
  reservations,
  salesChannels
} from '../db/schema'
import type { AuditEntry } from './audit'
import type { Ctx } from './context'
import { chargeBaseMinor, convertViaBase } from './currency-service'
import { assertDayWritable, assertExpenseDateNear, sectionAccess } from './expenses-service'
import {
  conflict,
  inChunks,
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'

export type PaymentRow = typeof payments.$inferSelect

interface Conversion {
  amountFolioMinor: number
  fxRateToBase: number | null
  fxRateAt: string | null
  fxRateObservedAt: string | null
  fxSource: string | null
  amountBaseMinor: number | null
}

export function createPaymentsService(deps: ServiceDeps) {
  const { db } = deps

  /**
   * Folio and base values frozen at the minute of writing (K-15, S-32: "o dakikanın kuru", `freezeNow`); with no
   * internet the last known rate is used (the panel marks it as an old rate). K-43: the folio amount is always
   * taken through the base currency (USD → TRY → EUR), so the folio and the ledger show the same base amount; a
   * typed rate ("1 USD = 34 TL", "1 EUR = 38 TL") counts only when no rate is known.
   */
  function convertAt(
    tx: Pick<Tx, 'select'>,
    amountMinor: number,
    currency: string,
    folioCurrency: string,
    now: Date,
    manual: { rateMicro?: number | undefined; folioRateMicro?: number | undefined } = {}
  ): Conversion {
    const at = now.toISOString()
    const conv = convertViaBase(tx, money(amountMinor, currency), folioCurrency, now, {
      rateMicro: manual.rateMicro,
      targetRateMicro: manual.folioRateMicro
    })
    if (conv.targetMinor === null) throw invalid('errors.noRate', { from: currency, to: folioCurrency })
    return {
      amountFolioMinor: conv.targetMinor,
      fxRateToBase: conv.base?.rateToBaseMicro ?? null,
      fxRateAt: at,
      fxRateObservedAt: conv.base?.rateObservedAt ?? null,
      fxSource: conv.base?.source ?? null,
      amountBaseMinor: conv.base?.amountBaseMinor ?? null
    }
  }

  /** G-72: writing into a closed day needs `ledger.locked` and a reason. */
  const guardDay = (tx: Pick<Tx, 'select'>, ctx: Ctx, date: string, reason: string | undefined): void => {
    assertDayWritable(tx, ctx, date, reason)
  }

  function folioFor(tx: Tx, input: { reservationId?: string; folioId?: string }) {
    const folio = input.folioId
      ? tx.select().from(folios).where(eq(folios.id, input.folioId)).get()
      : tx
          .select()
          .from(folios)
          .where(eq(folios.reservationId, input.reservationId ?? ''))
          .get()
    if (!folio) throw notFound('folio', input.folioId ?? input.reservationId)
    return folio
  }

  function paymentOf(tx: Pick<Tx, 'select'>, id: string): PaymentRow {
    const row = tx.select().from(payments).where(eq(payments.id, id)).get()
    if (!row) throw notFound('payment', id)
    return row
  }

  function methodOf(tx: Pick<Tx, 'select'>, id: string) {
    const m = tx.select().from(paymentMethods).where(eq(paymentMethods.id, id)).get()
    if (!m) throw notFound('payment_method', id)
    return m
  }

  function insertPayment(
    tx: Tx,
    ctx: Ctx,
    now: Date,
    data: ReturnType<typeof parsePayment>,
    folio: { id: string; currency: string; reservationId: string | null }
  ) {
    methodOf(tx, data.methodId)
    let channelId = data.channelId ?? null
    if (channelId === null && folio.reservationId)
      channelId =
        tx
          .select({ c: reservations.channelId })
          .from(reservations)
          .where(eq(reservations.id, folio.reservationId))
          .get()?.c ?? null
    const conv = convertAt(tx, data.amountMinor, data.currency, folio.currency, now, {
      rateMicro: data.manualRateMicro,
      folioRateMicro: data.manualFolioRateMicro
    })
    if (data.kind === 'refund') assertRefundCovered(tx, folio.id, conv.amountFolioMinor)
    // A cancelled / no-show reservation only takes what is still owed (a fee line); more is refused.
    if (data.kind === 'payment' && folio.reservationId) {
      const status = tx
        .select({ s: reservations.status })
        .from(reservations)
        .where(eq(reservations.id, folio.reservationId))
        .get()?.s
      if (status === 'cancelled' || status === 'no_show') {
        let owed = -folioNet(tx, folio.id)
        for (const c of tx
          .select({ a: charges.amountMinor })
          .from(charges)
          .where(and(eq(charges.folioId, folio.id), isNull(charges.voidedAt)))
          .all())
          owed += c.a
        if (conv.amountFolioMinor > Math.max(0, owed)) throw invalid('errors.reservationClosed')
      }
    }
    const id = newId(now)
    const row = {
      id,
      folioId: folio.id,
      date: data.date,
      kind: data.kind,
      methodId: data.methodId,
      channelId,
      amountMinor: data.amountMinor,
      currency: data.currency,
      ...conv,
      reference: data.reference ?? null,
      note: data.note ?? null,
      createdBy: ctx.userId,
      soldByUserId: data.soldByUserId ?? ctx.userId,
      ...stamps(now)
    }
    tx.insert(payments).values(row).run()
    return row
  }

  const parsePayment = (input: PaymentCreateInput) => parseInput(paymentCreateSchema, input)

  /**
   * A refund gives back money the folio took: never more than its net collected amount (payments and deposits
   * minus refunds, voided rows left out), in the folio currency. `exceptId` = the refund being changed.
   */
  function assertRefundCovered(
    tx: Pick<Tx, 'select'>,
    folioId: string,
    refundFolioMinor: number,
    exceptId?: string
  ) {
    const net = folioNet(tx, folioId, exceptId)
    if (refundFolioMinor > net) throw invalid('errors.refundExceedsPaid', { paidMinor: Math.max(0, net) })
  }

  /** Net collected on a folio (payments and deposits minus refunds, voided rows left out); `exceptId` is left out. */
  function folioNet(tx: Pick<Tx, 'select'>, folioId: string, exceptId?: string): number {
    let net = 0
    for (const p of tx
      .select({ id: payments.id, kind: payments.kind, amount: payments.amountFolioMinor })
      .from(payments)
      .where(and(eq(payments.folioId, folioId), isNull(payments.voidedAt)))
      .all())
      if (p.id !== exceptId) net += p.kind === 'refund' ? -p.amount : p.amount
    return net
  }

  /**
   * A collection that refunds were made against cannot be voided or lowered below them: the folio net would go
   * negative (a refund row is only checked when it is written). `newFolioMinor` = 0 for a void.
   */
  function assertCollectionKeepsRefunds(
    tx: Pick<Tx, 'select'>,
    folioId: string,
    paymentId: string,
    newFolioMinor: number
  ) {
    const net = folioNet(tx, folioId, paymentId) + newFolioMinor
    if (net < 0) throw invalid('errors.refundExceedsPaid', { paidMinor: Math.max(0, net) })
  }

  function createIn(
    ctx: Ctx,
    tx: Tx,
    audit: (entry: AuditEntry) => void,
    now: Date,
    input: PaymentCreateInput
  ): PaymentRow {
    const data = parsePayment(input)
    requirePermission(ctx, data.kind === 'refund' ? 'payments.refund' : 'payments', 'edit')
    assertExpenseDateNear(data.date, now)
    guardDay(tx, ctx, data.date, data.dayClosedReason)
    const folio = folioFor(tx, data)
    const row = insertPayment(tx, ctx, now, data, folio)
    audit({
      entity: 'payment',
      entityId: row.id,
      action: 'create',
      after: row,
      reason: data.dayClosedReason
    })
    return paymentOf(tx, row.id)
  }

  function voidIn(
    ctx: Ctx,
    tx: Tx,
    audit: (entry: AuditEntry) => void,
    now: Date,
    id: string,
    reason: string
  ): PaymentRow {
    requirePermission(ctx, 'payments.void', 'edit')
    const before = paymentOf(tx, id)
    if (before.voidedAt) throw invalid('errors.paymentVoided')
    if (before.collectedAt) throw conflict('errors.paymentCollected')
    if (before.kind === 'refund') requirePermission(ctx, 'payments.refund', 'edit')
    else assertCollectionKeepsRefunds(tx, before.folioId, before.id, 0)
    guardDay(tx, ctx, before.date, reason.trim())
    tx.update(payments)
      .set({ voidedAt: now.toISOString(), voidReason: reason.trim(), updatedAt: now.toISOString() })
      .where(eq(payments.id, id))
      .run()
    const after = paymentOf(tx, id)
    audit({ entity: 'payment', entityId: id, action: 'void', before, after, reason })
    return after
  }

  return {
    create(ctx: Ctx, input: PaymentCreateInput): PaymentRow {
      const data = parsePayment(input)
      requirePermission(ctx, data.kind === 'refund' ? 'payments.refund' : 'payments', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => createIn(ctx, tx, audit, now, input))
    },

    /**
     * The same write inside a transaction the caller owns (a cancellation that gives the money back in one
     * step, K-55): permission, closed-day guard, refund cap and audit row are the ones of `create`.
     */
    createIn,

    /** S-32: the frozen rate changes only when the amount or the currency changes. */
    update(ctx: Ctx, id: string, input: PaymentUpdateInput): PaymentRow {
      requirePermission(ctx, 'payments', 'edit')
      const data = parseInput(paymentUpdateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = paymentOf(tx, id)
        if (before.voidedAt) throw invalid('errors.paymentVoided')
        if (before.collectedAt) throw conflict('errors.paymentCollected')
        if (before.kind === 'refund') requirePermission(ctx, 'payments.refund', 'edit')
        guardDay(tx, ctx, before.date, data.dayClosedReason)
        if (data.date && data.date !== before.date) assertExpenseDateNear(data.date, now)
        if (data.date && data.date !== before.date) guardDay(tx, ctx, data.date, data.dayClosedReason)
        if (data.methodId) methodOf(tx, data.methodId)
        const next = {
          amountMinor: data.amountMinor ?? before.amountMinor,
          currency: data.currency ?? before.currency
        }
        const folio = tx.select().from(folios).where(eq(folios.id, before.folioId)).get()
        if (!folio) throw notFound('folio', before.folioId)
        // B11: a row saved without a known rate takes the typed one even when the amount stays the same.
        const typedForMissing =
          before.amountBaseMinor === null && (!!data.manualRateMicro || !!data.manualFolioRateMicro)
        const conv: Partial<Conversion> =
          needsNewRate(before, next) || typedForMissing
            ? convertAt(tx, next.amountMinor, next.currency, folio.currency, now, {
                rateMicro: data.manualRateMicro,
                folioRateMicro: data.manualFolioRateMicro
              })
            : {}
        if (before.kind === 'refund' && conv.amountFolioMinor !== undefined)
          assertRefundCovered(tx, folio.id, conv.amountFolioMinor, before.id)
        if (before.kind !== 'refund' && conv.amountFolioMinor !== undefined)
          assertCollectionKeepsRefunds(tx, folio.id, before.id, conv.amountFolioMinor)
        const { dayClosedReason: _r, manualRateMicro: _m, manualFolioRateMicro: _f, ...fields } = data
        tx.update(payments)
          .set({ ...fields, ...next, ...conv, updatedAt: now.toISOString() })
          .where(eq(payments.id, id))
          .run()
        const after = paymentOf(tx, id)
        audit({
          entity: 'payment',
          entityId: id,
          action: 'update',
          before,
          after,
          reason: data.dayClosedReason
        })
        return after
      })
    },

    void(ctx: Ctx, id: string, reason: string): PaymentRow {
      requirePermission(ctx, 'payments.void', 'edit')
      if (!reason?.trim()) throw invalid('errors.reasonRequired')
      return inTransaction(deps, ctx, (tx, audit, now) => voidIn(ctx, tx, audit, now, id, reason))
    },

    /** The same void inside a transaction the caller owns (a deposit conversion taken back). */
    voidIn,

    listForFolio(ctx: Ctx, folioId: string): PaymentRow[] {
      requirePermission(ctx, 'payments', 'view')
      return db
        .select()
        .from(payments)
        .where(eq(payments.folioId, folioId))
        .orderBy(asc(payments.createdAt))
        .all()
    },

    /**
     * The owner takes the money (G-64, S-30, S-31): cash, card and IBAN rows alike. Unsettled drawer expenses up to
     * the same day are settled in the same batch. One transaction; totals kept in the handover row.
     */
    handover(ctx: Ctx, input: HandoverInput) {
      requirePermission(ctx, 'payments.handover', 'edit')
      const data = parseInput(handoverSchema, input)
      if (!data.paymentIds && !data.upToDate) throw invalid('errors.validation')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const rows = tx
          .select({
            p: payments,
            group: paymentMethods.group,
            isCash: paymentMethods.isCash,
            channel: salesChannels.code
          })
          .from(payments)
          .innerJoin(paymentMethods, eq(payments.methodId, paymentMethods.id))
          .leftJoin(salesChannels, eq(payments.channelId, salesChannels.id))
          .where(
            and(
              isNull(payments.collectedAt),
              isNull(payments.voidedAt),
              data.paymentIds ? inArray(payments.id, data.paymentIds) : undefined,
              data.upToDate ? lte(payments.date, data.upToDate) : undefined
            )
          )
          .all()
          .filter((r) => !data.onlyCash || r.isCash)
        if (data.paymentIds && rows.length !== data.paymentIds.length)
          throw conflict('errors.paymentCollected')
        // Drawer expenses settled with the batch, only from sections the caller can see (K-38). "Up to a day":
        // every one up to that day. Selected rows (B10): per currency of the selected cash, every one up to the
        // newest selected cash day — the drawer is counted as a whole, so it never goes below zero.
        const visible = sectionAccess(tx, ctx).viewIds
        const cuts = new Map<string | null, string>()
        if (data.upToDate) cuts.set(null, data.upToDate)
        else
          for (const r of rows)
            if (r.isCash) {
              const was = cuts.get(r.p.currency)
              if (!was || r.p.date > was) cuts.set(r.p.currency, r.p.date)
            }
        const drawerExpenses = visible.length
          ? [...cuts].flatMap(([currency, upTo]) =>
              tx
                .select()
                .from(expenses)
                .where(
                  and(
                    eq(expenses.paidFromDrawer, true),
                    isNull(expenses.settledAt),
                    isNull(expenses.voidedAt),
                    lte(expenses.date, upTo),
                    currency ? eq(expenses.currency, currency) : undefined,
                    inArray(expenses.sectionId, visible)
                  )
                )
                .all()
            )
          : []
        // B23: nothing to take = no handover row.
        if (!rows.length && !drawerExpenses.length) throw invalid('errors.nothingToCollect')
        const id = newId(now)
        const iso = now.toISOString()
        const panel = cashPanel(
          rows.map((r) => ({
            kind: r.p.kind,
            amountMinor: r.p.amountMinor,
            currency: r.p.currency,
            methodGroup: r.group as MethodGroup,
            isCash: r.isCash,
            channelCode: r.channel,
            collected: false
          })),
          drawerExpenses.map((e) => ({
            amountMinor: e.amountMinor,
            currency: e.currency,
            paidFromDrawer: true,
            settled: false
          }))
        )
        tx.insert(cashHandovers)
          .values({
            id,
            at: iso,
            byUser: ctx.userId,
            note: data.note ?? null,
            totals: { ...panel, payments: rows.length, expenses: drawerExpenses.length },
            ...stamps(now)
          })
          .run()
        for (const ids of inChunks(rows.map((r) => r.p.id)))
          tx.update(payments)
            .set({ collectedAt: iso, collectedBy: ctx.userId, handoverId: id, updatedAt: iso })
            .where(inArray(payments.id, ids))
            .run()
        for (const ids of inChunks(drawerExpenses.map((e) => e.id)))
          tx.update(expenses)
            .set({ settledAt: iso, handoverId: id, updatedAt: iso })
            .where(inArray(expenses.id, ids))
            .run()
        audit({
          entity: 'cash_handover',
          entityId: id,
          action: 'handover',
          after: {
            payments: rows.map((r) => r.p.id),
            expenses: drawerExpenses.map((e) => e.id),
            totals: panel
          }
        })
        return { id, payments: rows.length, expenses: drawerExpenses.length, totals: panel }
      })
    },

    /** Undo one handover batch (§6.4): reason required; rows become uncollected again. */
    revertHandover(ctx: Ctx, handoverId: string, reason: string) {
      requirePermission(ctx, 'payments.handover', 'edit')
      if (!reason?.trim()) throw invalid('errors.reasonRequired')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const h = tx.select().from(cashHandovers).where(eq(cashHandovers.id, handoverId)).get()
        if (!h) throw notFound('cash_handover', handoverId)
        if (h.revertedAt) throw invalid('errors.alreadyCancelled')
        const iso = now.toISOString()
        tx.update(payments)
          .set({ collectedAt: null, collectedBy: null, handoverId: null, updatedAt: iso })
          .where(eq(payments.handoverId, handoverId))
          .run()
        tx.update(expenses)
          .set({ settledAt: null, handoverId: null, updatedAt: iso })
          .where(eq(expenses.handoverId, handoverId))
          .run()
        tx.update(cashHandovers)
          .set({ revertedAt: iso, revertedBy: ctx.userId, revertReason: reason.trim(), updatedAt: iso })
          .where(eq(cashHandovers.id, handoverId))
          .run()
        audit({ entity: 'cash_handover', entityId: handoverId, action: 'handover_revert', before: h, reason })
        return { id: handoverId, revertedAt: iso }
      })
    },

    /** Extra service (G-68): on a reservation folio, or a stand-alone sale folio (luggage "1 bag", Bounce). */
    sellExtra(ctx: Ctx, input: ExtraSaleInput) {
      requirePermission(ctx, 'extras', 'edit')
      const data = parseInput(extraSaleSchema, input)
      if (data.payment) requirePermission(ctx, 'payments', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const service = tx.select().from(extraServices).where(eq(extraServices.id, data.extraServiceId)).get()
        if (!service) throw notFound('extra_service', data.extraServiceId)
        guardDay(tx, ctx, data.date, data.dayClosedReason)
        let folio: { id: string; currency: string; reservationId: string | null }
        if (data.reservationId) folio = folioFor(tx, { reservationId: data.reservationId })
        else {
          folio = { id: newId(now), currency: data.currency, reservationId: null }
          const saleFolio = {
            id: folio.id,
            kind: 'sale' as const,
            title: data.description ?? service.name,
            currency: data.currency,
            createdBy: ctx.userId,
            ...stamps(now)
          }
          tx.insert(folios).values(saleFolio).run()
          // B14: every row the sale writes has its audit row (G-24).
          audit({
            entity: 'folio',
            entityId: folio.id,
            action: 'create',
            after: saleFolio,
            reason: data.dayClosedReason
          })
        }
        if (folio.currency !== data.currency)
          throw invalid('errors.currencyMismatch', { folio: folio.currency })
        const amount = multiplyRatio(money(data.unitMinor, data.currency), data.qty).amountMinor
        const chargeId = newId(now)
        tx.insert(charges)
          .values({
            id: chargeId,
            folioId: folio.id,
            date: data.date,
            kind: 'extra',
            extraServiceId: service.id,
            description: data.description ?? service.name,
            qty: data.qty,
            unitMinor: data.unitMinor,
            amountMinor: amount,
            currency: data.currency,
            amountBaseMinor: chargeBaseMinor(tx, amount, data.currency, now),
            createdBy: ctx.userId,
            ...stamps(now)
          })
          .run()
        const payment = data.payment
          ? insertPayment(
              tx,
              ctx,
              now,
              parsePayment({
                folioId: folio.id,
                date: data.date,
                kind: 'payment',
                methodId: data.payment.methodId,
                channelId: data.payment.channelId ?? null,
                amountMinor: amount,
                currency: data.currency,
                manualRateMicro: data.manualRateMicro,
                reference: data.payment.reference ?? null
              }),
              folio
            )
          : null
        if (payment)
          audit({
            entity: 'payment',
            entityId: payment.id,
            action: 'create',
            after: payment,
            reason: data.dayClosedReason
          })
        audit({
          entity: 'charge',
          entityId: chargeId,
          action: 'create',
          after: { folioId: folio.id, service: service.code, amount, payment: payment?.id },
          reason: data.dayClosedReason
        })
        return { folioId: folio.id, chargeId, paymentId: payment?.id ?? null }
      })
    }
  }
}

export type PaymentsService = ReturnType<typeof createPaymentsService>
