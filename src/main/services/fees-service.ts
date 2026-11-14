// Small-hotel practices (P21d, Ö-22): the late check-out line, the no-show fee line, the damage deposit and the one-page
// night report. Fee rules are hotel settings (`fees.*`). Fee lines are ordinary folio charges (voided, never
// deleted); a damage deposit is money held, not income: it is given back or, with a reason, turned into a damage
// charge plus a payment (the only moment it becomes income).
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import {
  depositSettleSchema,
  depositTakeSchema,
  feeQuoteInputSchema,
  feeVoidSchema,
  lateCheckoutInputSchema,
  type FeeQuote,
  type FolioLines,
  type NightReport
} from '@shared/contract/fees'
import { lateCheckoutSuggestion, noShowSuggestion } from '@shared/domain/fees'
import { localDateOf, type LocalDate } from '@shared/date'
import {
  charges,
  damageDeposits,
  expenseSections,
  expenses,
  extraServices,
  folios,
  guests,
  paymentMethods,
  payments,
  reservationRooms,
  reservations,
  roomNights,
  rooms
} from '../db/schema'
import type { AuditEntry } from './audit'
import type { Ctx } from './context'
import { chargeBaseMinor } from './currency-service'
import {
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
import type { PaymentsService } from './payments-service'
import { assertDayWritable, staffMoneyFilter } from './expenses-service'
import { readSetting } from './settings-service'

type Reader = Pick<Tx, 'select'>
export type FeeCode = 'late_checkout' | 'no_show_fee' | 'damage_fee'

/** A fee line on a reservation's folio (extra-service charge); used by check-out, no-show and the deposit. */
export function insertFeeCharge(
  tx: Tx,
  audit: (entry: AuditEntry) => void,
  ctx: Ctx,
  now: Date,
  input: {
    reservationId: string
    code: FeeCode
    date: LocalDate
    amountMinor: number
    suffix?: string
    reason?: string
  }
): string {
  const folio = tx.select().from(folios).where(eq(folios.reservationId, input.reservationId)).get()
  if (!folio) throw notFound('folio', input.reservationId)
  const service = tx.select().from(extraServices).where(eq(extraServices.code, input.code)).get()
  if (!service) throw notFound('extra_service', input.code)
  const id = newId(now)
  const description = input.suffix ? `${service.name} ${input.suffix}` : service.name
  tx.insert(charges)
    .values({
      id,
      folioId: folio.id,
      date: input.date,
      kind: input.code === 'no_show_fee' ? 'penalty' : 'extra',
      extraServiceId: service.id,
      description,
      qty: 1,
      unitMinor: input.amountMinor,
      amountMinor: input.amountMinor,
      currency: folio.currency,
      amountBaseMinor: chargeBaseMinor(tx, input.amountMinor, folio.currency, now),
      createdBy: ctx.userId,
      ...stamps(now)
    })
    .run()
  audit({
    entity: 'charge',
    entityId: id,
    action: 'create',
    after: { folioId: folio.id, service: input.code, amountMinor: input.amountMinor, description },
    ...(input.reason ? { reason: input.reason } : {})
  })
  return id
}

export function createFeesService(deps: ServiceDeps, parts: { payments: PaymentsService }) {
  const { db } = deps
  const today = (now: Date): LocalDate => localDateOf(now)

  const folioOfReservation = (tx: Reader, reservationId: string) => {
    const f = tx.select().from(folios).where(eq(folios.reservationId, reservationId)).get()
    if (!f) throw notFound('folio', reservationId)
    return f
  }

  /** Price of the stay's last night (the one a late departure extends), else its first night; 0 when none. */
  function stayNightly(tx: Reader, stayId: string): number {
    const nights = tx
      .select({ price: roomNights.priceMinor, date: roomNights.date })
      .from(roomNights)
      .where(and(eq(roomNights.reservationRoomId, stayId), eq(roomNights.slot, 'night')))
      .orderBy(asc(roomNights.date))
      .all()
    return nights.at(-1)?.price ?? 0
  }

  function reservationFirstNight(tx: Reader, reservationId: string): number {
    const row = tx
      .select({ price: roomNights.priceMinor })
      .from(roomNights)
      .innerJoin(reservationRooms, eq(reservationRooms.id, roomNights.reservationRoomId))
      .where(and(eq(reservationRooms.reservationId, reservationId), eq(roomNights.slot, 'night')))
      .orderBy(asc(roomNights.date), asc(reservationRooms.sort))
      .get()
    return row?.price ?? 0
  }

  /** The no-show fee of a reservation as the rule suggests it (used by the dialog and as the cap-free default). */
  function noShowQuote(tx: Reader, reservationId: string): FeeQuote {
    const folio = folioOfReservation(tx, reservationId)
    const rule = readSetting(tx as Pick<typeof db, 'select'>, 'fees.noShow')
    const first = reservationFirstNight(tx, reservationId)
    return {
      suggestedMinor: noShowSuggestion(rule, first),
      currency: folio.currency,
      nightlyMinor: first,
      mode: rule.mode
    }
  }

  const depositView = (d: typeof damageDeposits.$inferSelect) => ({
    id: d.id,
    amountMinor: d.amountMinor,
    currency: d.currency,
    methodId: d.methodId,
    takenDate: d.takenDate as LocalDate,
    status: d.status,
    settledDate: (d.settledDate as LocalDate | null) ?? null,
    settleNote: d.settleNote,
    note: d.note
  })

  return {
    quote(ctx: Ctx, input: unknown): FeeQuote {
      requirePermission(ctx, 'calendar', 'view')
      const data = parseInput(feeQuoteInputSchema, input)
      if (data.kind === 'noShow') return noShowQuote(db, data.reservationId)
      const stay = db.select().from(reservationRooms).where(eq(reservationRooms.id, data.stayId)).get()
      if (!stay) throw notFound('reservation_room', data.stayId)
      const folio = folioOfReservation(db, stay.reservationId)
      const rule = readSetting(db, 'fees.lateCheckout')
      const nightly = stayNightly(db, stay.id)
      return {
        suggestedMinor: lateCheckoutSuggestion(rule, data.time, nightly, folio.currency),
        currency: folio.currency,
        nightlyMinor: nightly,
        mode: rule.mode
      }
    },

    /** The late check-out line (G-68 extras): a stay in the house or just checked out; `time` is the departure hour. */
    addLateCheckout(ctx: Ctx, input: unknown): { reservationId: string } {
      requirePermission(ctx, 'extras', 'edit')
      const data = parseInput(lateCheckoutInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = tx.select().from(reservationRooms).where(eq(reservationRooms.id, data.stayId)).get()
        if (!stay) throw notFound('reservation_room', data.stayId)
        if (stay.status !== 'in_house' && stay.status !== 'done') throw invalid('errors.feeStayNotStarted')
        const day = today(now)
        const closedReason = assertDayWritable(tx, ctx, day, data.dayClosedReason)
        insertFeeCharge(tx, audit, ctx, now, {
          reservationId: stay.reservationId,
          code: 'late_checkout',
          date: day,
          amountMinor: data.amountMinor,
          suffix: data.time,
          ...((closedReason ?? data.note) ? { reason: closedReason ?? data.note } : {})
        })
        return { reservationId: stay.reservationId }
      })
    },

    /** Voids a fee line written by mistake (never deleted). */
    voidFee(ctx: Ctx, input: unknown): { reservationId: string } {
      requirePermission(ctx, 'extras', 'edit')
      const data = parseInput(feeVoidSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const row = tx.select().from(charges).where(eq(charges.id, data.chargeId)).get()
        if (!row) throw notFound('charge', data.chargeId)
        if (row.voidedAt) throw invalid('errors.alreadyCancelled')
        const service = row.extraServiceId
          ? tx.select().from(extraServices).where(eq(extraServices.id, row.extraServiceId)).get()
          : undefined
        if (!service || !['late_checkout', 'no_show_fee', 'damage_fee'].includes(service.code))
          throw invalid('errors.feeNotVoidable')
        // The damage line of a deposit turned into income goes with its payment: it is not voided alone.
        if (tx.select().from(damageDeposits).where(eq(damageDeposits.convertedChargeId, row.id)).get())
          throw invalid('errors.feeNotVoidable')
        assertDayWritable(tx, ctx, row.date, data.dayClosedReason ?? data.reason)
        tx.update(charges)
          .set({ voidedAt: now.toISOString(), voidReason: data.reason, updatedAt: now.toISOString() })
          .where(eq(charges.id, row.id))
          .run()
        audit({ entity: 'charge', entityId: row.id, action: 'void', before: row, reason: data.reason })
        const folio = tx.select().from(folios).where(eq(folios.id, row.folioId)).get()
        return { reservationId: folio?.reservationId ?? '' }
      })
    },

    noShowQuote: (tx: Reader, reservationId: string) => noShowQuote(tx, reservationId),

    /** Fee lines of the folio (the panel's "Kalemler") and the deposits held for the reservation. */
    folioLines(ctx: Ctx, reservationId: string): FolioLines {
      requirePermission(ctx, 'calendar', 'view')
      const folio = folioOfReservation(db, reservationId)
      const lines = db
        .select({ c: charges, code: extraServices.code })
        .from(charges)
        .leftJoin(extraServices, eq(extraServices.id, charges.extraServiceId))
        .where(and(eq(charges.folioId, folio.id), ne(charges.kind, 'room_night')))
        .orderBy(asc(charges.date), asc(charges.createdAt))
        .all()
        .map(({ c, code }) => ({
          id: c.id,
          date: c.date as LocalDate,
          code,
          kind: c.kind,
          description: c.description,
          amountMinor: c.amountMinor,
          currency: c.currency,
          voided: c.voidedAt !== null
        }))
      const deposits = ctx.can('payments', 'view')
        ? db
            .select()
            .from(damageDeposits)
            .where(eq(damageDeposits.reservationId, reservationId))
            .orderBy(asc(damageDeposits.createdAt))
            .all()
            .map(depositView)
        : null
      return { charges: lines, deposits }
    },

    /** Takes a damage deposit: held money, not income (it is in no payment, charge or report total). */
    takeDeposit(ctx: Ctx, input: unknown): { reservationId: string } {
      requirePermission(ctx, 'payments', 'edit')
      const data = parseInput(depositTakeSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const r = tx.select().from(reservations).where(eq(reservations.id, data.reservationId)).get()
        if (!r) throw notFound('reservation', data.reservationId)
        if (r.status === 'cancelled' || r.status === 'no_show') throw invalid('errors.reservationClosed')
        const closedReason = assertDayWritable(tx, ctx, today(now), data.dayClosedReason)
        const folio = folioOfReservation(tx, r.id)
        if (!tx.select().from(paymentMethods).where(eq(paymentMethods.id, data.methodId)).get())
          throw notFound('payment_method', data.methodId)
        const row = {
          id: newId(now),
          reservationId: r.id,
          amountMinor: data.amountMinor,
          currency: folio.currency,
          methodId: data.methodId,
          takenDate: today(now),
          status: 'held' as const,
          note: data.note ?? null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(damageDeposits).values(row).run()
        audit({
          entity: 'damage_deposit',
          entityId: row.id,
          action: 'create',
          after: row,
          ...(closedReason ? { reason: closedReason } : {})
        })
        return { reservationId: r.id }
      })
    },

    /**
     * Gives the deposit back, turns it into a damage charge + payment on the folio (needs a reason), or takes such a
     * conversion back (`undoConvert`: charge and payment voided together, the deposit is held again).
     */
    settleDeposit(ctx: Ctx, input: unknown): { reservationId: string } {
      const data = parseInput(depositSettleSchema, input)
      requirePermission(ctx, data.action === 'refund' ? 'payments.refund' : 'payments', 'edit')
      // Turning a deposit into income also writes a damage charge line.
      if (data.action !== 'refund') requirePermission(ctx, 'extras', 'edit')
      if (data.action === 'undoConvert') requirePermission(ctx, 'payments.void', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(damageDeposits).where(eq(damageDeposits.id, data.id)).get()
        if (!before) throw notFound('damage_deposit', data.id)
        const day = today(now)
        if (data.action === 'undoConvert') {
          if (before.status !== 'converted' || !before.convertedChargeId)
            throw invalid('errors.depositNotConverted')
          const charge = tx.select().from(charges).where(eq(charges.id, before.convertedChargeId)).get()
          if (!charge) throw notFound('charge', before.convertedChargeId)
          const folio = folioOfReservation(tx, before.reservationId)
          const payment = tx
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.folioId, folio.id),
                eq(payments.kind, 'payment'),
                eq(payments.methodId, before.methodId),
                eq(payments.amountMinor, before.amountMinor),
                eq(payments.currency, before.currency),
                eq(payments.date, before.settledDate ?? day),
                isNull(payments.voidedAt)
              )
            )
            .orderBy(desc(payments.createdAt))
            .get()
          const reason = data.reason ?? ''
          const closedReason = assertDayWritable(tx, ctx, charge.date, data.dayClosedReason ?? reason)
          if (!charge.voidedAt)
            tx.update(charges)
              .set({ voidedAt: now.toISOString(), voidReason: reason, updatedAt: now.toISOString() })
              .where(eq(charges.id, charge.id))
              .run()
          if (payment) parts.payments.voidIn(ctx, tx, audit, now, payment.id, reason)
          audit({ entity: 'charge', entityId: charge.id, action: 'void', before: charge, reason })
          tx.update(damageDeposits)
            .set({
              status: 'held',
              settledDate: null,
              settledAt: null,
              settledBy: null,
              settleNote: null,
              convertedChargeId: null,
              updatedAt: now.toISOString()
            })
            .where(eq(damageDeposits.id, before.id))
            .run()
          audit({
            entity: 'damage_deposit',
            entityId: before.id,
            action: 'update',
            before,
            after: { status: 'held', undoneChargeId: charge.id },
            reason: closedReason ?? reason
          })
          return { reservationId: before.reservationId }
        }
        if (before.status !== 'held') throw invalid('errors.depositSettled')
        const closedReason = assertDayWritable(tx, ctx, day, data.dayClosedReason)
        let chargeId: string | null = null
        if (data.action === 'convert') {
          chargeId = insertFeeCharge(tx, audit, ctx, now, {
            reservationId: before.reservationId,
            code: 'damage_fee',
            date: day,
            amountMinor: before.amountMinor,
            reason: data.reason ?? ''
          })
          parts.payments.createIn(ctx, tx, audit, now, {
            reservationId: before.reservationId,
            date: day,
            kind: 'payment',
            methodId: before.methodId,
            amountMinor: before.amountMinor,
            currency: before.currency,
            note: data.reason ?? null,
            ...(data.dayClosedReason ? { dayClosedReason: data.dayClosedReason } : {})
          })
        }
        tx.update(damageDeposits)
          .set({
            status: data.action === 'refund' ? 'refunded' : 'converted',
            settledDate: day,
            settledAt: now.toISOString(),
            settledBy: ctx.userId,
            settleNote: data.reason ?? null,
            convertedChargeId: chargeId,
            updatedAt: now.toISOString()
          })
          .where(eq(damageDeposits.id, before.id))
          .run()
        audit({
          entity: 'damage_deposit',
          entityId: before.id,
          action: 'update',
          before,
          after: { status: data.action === 'refund' ? 'refunded' : 'converted', chargeId },
          ...((closedReason ?? data.reason) ? { reason: closedReason ?? data.reason } : {})
        })
        return { reservationId: before.reservationId }
      })
    },

    /** Deposits still held for a reservation (check-out reminds the desk to settle them). */
    heldDeposits(ctx: Ctx, reservationId: string) {
      requirePermission(ctx, 'payments', 'view')
      return db
        .select()
        .from(damageDeposits)
        .where(and(eq(damageDeposits.reservationId, reservationId), eq(damageDeposits.status, 'held')))
        .all()
        .map(depositView)
    },

    /** One A4 page for a day: arrivals, departures, who stays, no-shows, room states and the cash summary. */
    nightReport(ctx: Ctx, input: { date: string }): NightReport {
      requirePermission(ctx, 'reports.operations', 'view')
      const date = input.date as LocalDate
      const seeMoney = ctx.can('ledger', 'view') || ctx.can('cash', 'view')
      // Balances of every listed reservation in three queries (folios, charges, payments), not three per row.
      const balances = new Map<string, { balance: number | null; currency: string }>()
      const loadBalances = (reservationIds: string[]): void => {
        if (reservationIds.length === 0) return
        const folioRows = db.select().from(folios).where(inArray(folios.reservationId, reservationIds)).all()
        const folioOf = new Map<string, (typeof folioRows)[number]>()
        for (const f of folioRows)
          if (f.reservationId && !folioOf.has(f.reservationId)) folioOf.set(f.reservationId, f)
        const chargeSum = new Map<string, number>()
        const paymentSum = new Map<string, number>()
        if (seeMoney && folioOf.size > 0) {
          const ids = [...folioOf.values()].map((f) => f.id)
          for (const r of db
            .select({ id: charges.folioId, total: sql<number>`coalesce(sum(${charges.amountMinor}), 0)` })
            .from(charges)
            .where(and(inArray(charges.folioId, ids), isNull(charges.voidedAt)))
            .groupBy(charges.folioId)
            .all())
            chargeSum.set(r.id, Number(r.total))
          for (const r of db
            .select({
              id: payments.folioId,
              total: sql<number>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amountFolioMinor} else ${payments.amountFolioMinor} end), 0)`
            })
            .from(payments)
            .where(and(inArray(payments.folioId, ids), isNull(payments.voidedAt)))
            .groupBy(payments.folioId)
            .all())
            paymentSum.set(r.id, Number(r.total))
        }
        for (const id of reservationIds) {
          const f = folioOf.get(id)
          if (!f) balances.set(id, { balance: null, currency: '' })
          else if (!seeMoney) balances.set(id, { balance: null, currency: f.currency })
          else
            balances.set(id, {
              balance: (chargeSum.get(f.id) ?? 0) - (paymentSum.get(f.id) ?? 0),
              currency: f.currency
            })
        }
      }
      const folioBalance = (reservationId: string): { balance: number | null; currency: string } =>
        balances.get(reservationId) ?? { balance: null, currency: '' }
      const line = (r: {
        res: typeof reservations.$inferSelect
        stay: typeof reservationRooms.$inferSelect
        room: string
        first: string
        last: string
      }) => {
        const b = folioBalance(r.res.id)
        return {
          reservationId: r.res.id,
          code: r.res.code,
          guest: `${r.first} ${r.last}`.trim(),
          room: r.room,
          checkIn: r.stay.checkIn as LocalDate,
          checkOut: r.stay.checkOut as LocalDate,
          balanceMinor: b.balance,
          currency: b.currency
        }
      }
      const stays = db
        .select({
          res: reservations,
          stay: reservationRooms,
          room: rooms.number,
          first: guests.firstName,
          last: guests.lastName
        })
        .from(reservationRooms)
        .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
        .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(
          and(
            // A no-show's stays are released (cancelled) by the no-show itself: keep them for the "Gelmeyenler" list.
            or(ne(reservationRooms.status, 'cancelled'), eq(reservations.status, 'no_show')),
            inArray(reservations.status, ['tentative', 'confirmed', 'checked_in', 'checked_out', 'no_show']),
            lte(reservationRooms.checkIn, date),
            gte(reservationRooms.checkOut, date)
          )
        )
        .all()
        .sort((a, b) => a.room.localeCompare(b.room, 'tr', { numeric: true }))
      loadBalances([...new Set(stays.map((s) => s.res.id))])
      const arrivals = stays.filter(
        (s) => s.stay.checkIn === date && s.res.status !== 'no_show' && s.stay.checkOut >= date
      )
      const noShows = stays.filter((s) => s.stay.checkIn === date && s.res.status === 'no_show')
      const departures = stays.filter(
        (s) =>
          s.stay.checkOut === date &&
          s.stay.checkIn < date &&
          s.res.status !== 'no_show' &&
          s.stay.status !== 'planned'
      )
      const staying = stays.filter(
        (s) =>
          s.stay.checkIn <= date &&
          s.stay.checkOut > date &&
          s.res.status !== 'no_show' &&
          s.stay.status !== 'cancelled' &&
          (s.stay.status === 'in_house' || s.stay.status === 'planned' || s.stay.status === 'done')
      )
      const allRooms = db.select().from(rooms).where(eq(rooms.active, true)).all()
      const occupiedIds = new Set(stays.filter((s) => s.stay.status === 'in_house').map((s) => s.stay.roomId))
      const roomStats = {
        total: allRooms.length,
        occupied: allRooms.filter((r) => occupiedIds.has(r.id)).length,
        clean: allRooms.filter((r) => r.hkStatus === 'clean').length,
        dirty: allRooms.filter((r) => r.hkStatus === 'dirty').length,
        inspected: allRooms.filter((r) => r.hkStatus === 'inspected').length,
        outOfService: allRooms.filter((r) => r.hkStatus === 'maintenance' || r.hkStatus === 'out_of_order')
          .length
      }
      let cash: NightReport['cash'] = null
      if (seeMoney) {
        const by = new Map<
          string,
          {
            currency: string
            incomeMinor: number
            refundMinor: number
            expenseMinor: number
            depositHeldMinor: number
          }
        >()
        const of = (c: string) => {
          const v = by.get(c) ?? {
            currency: c,
            incomeMinor: 0,
            refundMinor: 0,
            expenseMinor: 0,
            depositHeldMinor: 0
          }
          by.set(c, v)
          return v
        }
        for (const p of db
          .select()
          .from(payments)
          .where(and(eq(payments.date, date), isNull(payments.voidedAt)))
          .all()) {
          if (p.kind === 'refund') of(p.currency).refundMinor += p.amountMinor
          else of(p.currency).incomeMinor += p.amountMinor
        }
        if (ctx.can('expenses', 'view')) {
          const open = new Set(
            db
              .select({ id: expenseSections.id })
              .from(expenseSections)
              .where(eq(expenseSections.visibilityPermission, 'expenses'))
              .all()
              .map((s) => s.id)
          )
          for (const e of db
            .select()
            .from(expenses)
            .where(and(eq(expenses.date, date), isNull(expenses.voidedAt), staffMoneyFilter(ctx)))
            .all())
            if (open.has(e.sectionId)) of(e.currency).expenseMinor += e.amountMinor
        }
        for (const d of db
          .select()
          .from(damageDeposits)
          .where(and(eq(damageDeposits.status, 'held'), lte(damageDeposits.takenDate, date)))
          .all())
          of(d.currency).depositHeldMinor += d.amountMinor
        cash = { byCurrency: [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency)) }
      }
      return {
        date,
        hotelName: readSetting(db, 'hotel.name'),
        arrivals: arrivals.map(line),
        departures: departures.map(line),
        staying: staying.map(line),
        noShows: noShows.map(line),
        rooms: roomStats,
        cash
      }
    }
  }
}

export type FeesService = ReturnType<typeof createFeesService>
