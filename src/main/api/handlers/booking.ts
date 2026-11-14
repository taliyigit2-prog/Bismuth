// Handlers of procedures/booking.ts (Faz 5, reservation panel): contract procedure → service calls. Every write
// answers with the panel's view of the reservation (reservations.view); permissions are checked in the services.
import type { bookingProcedures } from '@shared/contract/procedures/booking'
import { addDays, localDate } from '@shared/date'
import type { Ctx } from '../../services/context'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

const ok = { ok: true } as const
/** Calendar kinds that take the weekend price (S-20): holidays and the hotel's own special days. */
const PRICED_KINDS = new Set(['holiday', 'half_holiday', 'special'])

export const bookingHandlers = (services: Services): HandlersFor<keyof typeof bookingProcedures> => {
  const view = (ctx: Ctx, id: string) => services.reservations.view(ctx, id)
  return {
    'booking.options': (ctx) => services.reservations.formOptions(ctx),
    'booking.get': (ctx, input) => view(ctx, input.id),
    'booking.availability': (ctx, input) => services.reservations.roomsTaken(ctx, input),
    'booking.suggestPrices': (ctx, input) => {
      const from = localDate(input.checkIn)
      const to = input.checkOut > input.checkIn ? localDate(input.checkOut) : addDays(from, 1)
      const special = new Set(
        services.calendar
          .listRange(ctx, from, to)
          .filter((d) => PRICED_KINDS.has(d.kind))
          .map((d) => d.occurrenceDate)
      )
      return services.reservations.suggestPrices(ctx, input, special)
    },
    'booking.searchGuests': (ctx, input) => {
      const found = services.guests.search(ctx, input.q, input.limit ?? 8)
      const counts = services.reservations.stayCounts(
        ctx,
        found.map((g) => g.id)
      )
      return found.map((g) => ({
        id: g.id,
        firstName: g.firstName,
        lastName: g.lastName,
        phone: g.phone,
        nationality: g.nationality,
        vip: g.vip,
        stays: counts.get(g.id) ?? 0
      }))
    },
    'booking.guestSummary': (ctx, input) => {
      const guest = services.guests.get(ctx, input.guestId)
      const history = services.guests.guestHistory(ctx, input.guestId, {
        excludeReservationId: input.excludeReservationId
      })
      return {
        guestId: history.guestId,
        firstName: guest.firstName,
        lastName: guest.lastName,
        vip: guest.vip,
        standingNote: history.standingNote,
        lastStayDate: history.lastStayDate,
        lastNightly: history.lastNightly,
        averageNightly: history.averageNightly,
        totalSpent: history.totalSpent,
        totalNights: history.totalNights,
        stayCount: history.stayCount,
        tagIds: services.guests.tagIdsOf(ctx, history.guestId),
        recent: history.stays.slice(0, 5).map((s) => ({
          reservationId: s.reservationId,
          roomNumber: s.roomNumber,
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          status: s.status,
          paidMinor: s.paidMinor,
          currency: s.currency,
          nightlyMinor: s.nights.at(-1)?.priceMinor ?? null
        }))
      }
    },
    'booking.checkBlacklist': (ctx, input) => services.reservations.blacklistCheck(ctx, input),

    'booking.create': (ctx, input) => {
      const { blacklistConfirmed, ...data } = input
      const created = services.reservations.create(ctx, data, { blacklistConfirmed })
      return view(ctx, created.reservation.id)
    },
    'booking.createHourlyStay': (ctx, input) => {
      const { blacklistConfirmed, roomId, date, startTime, endTime, priceMinor, adults, ...rest } = input
      const created = services.reservations.create(
        ctx,
        {
          ...rest,
          adults,
          stays: [
            { roomId, checkIn: date, checkOut: date, startTime, endTime, nightlyPriceMinor: priceMinor }
          ]
        },
        { blacklistConfirmed }
      )
      return view(ctx, created.reservation.id)
    },
    'booking.hourlyCheck': (ctx, input) => services.reservations.hourlyCheck(ctx, input),
    'booking.update': (ctx, input) =>
      view(ctx, services.reservations.update(ctx, input.id, input.patch).reservation.id),
    'booking.addRoom': (ctx, input) =>
      view(
        ctx,
        services.reservations.addRoom(ctx, input.reservationId, input.stay, input.overrideBlockReason)
          .reservation.id
      ),
    'booking.changeDates': (ctx, input) =>
      view(ctx, services.reservations.changeDates(ctx, input.stayId, input.dates).reservation.id),
    'booking.moveDates': (ctx, input) =>
      view(ctx, services.reservations.moveDates(ctx, input.stayId, input.move).reservation.id),
    'booking.changeRoom': (ctx, input) =>
      view(ctx, services.reservations.changeRoom(ctx, input.stayId, input.change).reservation.id),
    'booking.setNightPrices': (ctx, input) =>
      view(ctx, services.reservations.setNightPrices(ctx, input.stayId, input.prices).reservation.id),
    'booking.checkIn': (ctx, input) =>
      view(ctx, services.reservations.checkIn(ctx, input.stayId).reservation.id),
    'booking.checkOut': (ctx, input) =>
      view(
        ctx,
        services.reservations.checkOut(ctx, input.stayId, {
          kbsCheckoutIds: input.kbsCheckoutIds,
          dayUsePriceMinor: input.dayUsePriceMinor,
          dayUseFreeConfirmed: input.dayUseFreeConfirmed
        }).reservation.id
      ),
    'booking.cancel': (ctx, input) =>
      view(ctx, services.reservations.cancel(ctx, input.id, input.reason, input.refund).reservation.id),
    'booking.undoCheckIn': (ctx, input) =>
      view(
        ctx,
        services.reservations.undoCheckIn(ctx, input.stayId, {
          reason: input.reason,
          kbsConfirmed: input.kbsConfirmed,
          then: input.then
        }).reservation.id
      ),
    'booking.cancelStay': (ctx, input) =>
      view(ctx, services.reservations.cancelStay(ctx, input.stayId, input.reason).reservation.id),
    'booking.noShow': (ctx, input) =>
      view(ctx, services.reservations.noShow(ctx, input.id, 'no_show', input.feeMinor ?? 0).reservation.id),
    'booking.feeQuote': (ctx, input) => services.fees.quote(ctx, input),
    'booking.addLateCheckout': (ctx, input) =>
      view(ctx, services.fees.addLateCheckout(ctx, input).reservationId),
    'booking.voidFee': (ctx, input) => view(ctx, services.fees.voidFee(ctx, input).reservationId),
    'booking.folioLines': (ctx, input) => services.fees.folioLines(ctx, input.id),
    'booking.takeDeposit': (ctx, input) => view(ctx, services.fees.takeDeposit(ctx, input).reservationId),
    'booking.settleDeposit': (ctx, input) => view(ctx, services.fees.settleDeposit(ctx, input).reservationId),
    'booking.park': (ctx, input) =>
      view(ctx, services.reservations.park(ctx, input.id, input.park).reservation.id),
    'booking.unpark': (ctx, input) =>
      view(
        ctx,
        services.reservations.unpark(ctx, input.id, input.stays, input.overrideBlockReason).reservation.id
      ),
    'booking.listParked': (ctx) => services.reservations.parked(ctx),
    'booking.addPayment': (ctx, input) => {
      services.payments.create(ctx, input)
      return view(ctx, input.reservationId ?? '')
    },
    'booking.addNote': (ctx, input) =>
      view(ctx, services.reservations.addNote(ctx, input.reservationId, input.text).reservation.id),
    'booking.addOccupant': (ctx, input) => {
      const row = services.occupants.add(ctx, input.stayId, input.occupant, {
        blacklistConfirmed: input.blacklistConfirmed
      })
      if (input.kbsReported) services.occupants.markKbsReported(ctx, row.id)
      return ok
    },
    'booking.updateOccupant': (ctx, input) => {
      services.occupants.update(ctx, input.id, input.patch)
      return ok
    },
    'booking.group': (ctx, input) => services.reservations.group(ctx, input.id),
    'booking.createGroup': (ctx, input) => services.reservations.createGroup(ctx, input),
    'booking.checkInMany': (ctx, input) => services.reservations.checkInMany(ctx, input),
    'booking.checkOutMany': (ctx, input) => services.reservations.checkOutMany(ctx, input),
    'booking.addGroupNote': (ctx, input) => services.reservations.addGroupNote(ctx, input),
    'booking.cancelGroup': (ctx, input) => services.reservations.cancelGroup(ctx, input),
    'booking.payGroup': (ctx, input) => services.reservations.payGroup(ctx, input),
    'booking.attachToGroup': (ctx, input) => services.reservations.attachToGroup(ctx, input),
    'booking.markKbs': (ctx, input) => {
      const o = services.occupants
      if (input.mark === 'reported') o.markKbsReported(ctx, input.occupantId)
      else if (input.mark === 'checkout') o.markKbsCheckout(ctx, input.occupantId)
      else if (input.mark === 'clearReported') o.clearKbsReported(ctx, input.occupantId)
      else o.markLeft(ctx, input.occupantId)
      return ok
    }
  }
}
