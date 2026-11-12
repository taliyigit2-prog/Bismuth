// Small read helpers over the demo hotel that several mock-up screens share (Bugün, gün listesi, otelde kalanlar,
// vardiya devri). They stand in for the joins the real services return (Faz 5–9).
import type { LocalDate } from '@shared/date'
import { cashPanel, type CashPanel, type PaymentRowLike } from '@shared/domain/cash'
import type { DemoGuest, DemoHotel, DemoPayment, DemoReservation, DemoRoom, DemoStay } from './types'

export interface StayRow {
  reservation: DemoReservation
  stay: DemoStay
  guest: DemoGuest | undefined
  room: DemoRoom | undefined
}

export const guestOf = (hotel: DemoHotel, id: string): DemoGuest | undefined =>
  hotel.guests.find((g) => g.id === id)

export const fullName = (g: DemoGuest | undefined): string => (g ? `${g.firstName} ${g.lastName}` : '—')

export const roomOf = (hotel: DemoHotel, id: string): DemoRoom | undefined =>
  hotel.rooms.find((r) => r.id === id)

/** Every stay of a live reservation (parked and cancelled ones are not on the calendar). */
export function stayRows(hotel: DemoHotel): StayRow[] {
  return hotel.reservations.flatMap((reservation) =>
    reservation.status === 'parked' || reservation.status === 'cancelled'
      ? []
      : reservation.stays.map((stay) => ({
          reservation,
          stay,
          guest: guestOf(hotel, reservation.guestId),
          room: roomOf(hotel, stay.roomId)
        }))
  )
}

const byRoom = (a: StayRow, b: StayRow): number =>
  (a.room?.number ?? '').localeCompare(b.room?.number ?? '', 'tr', { numeric: true })

/** Arrivals, departures and stay-overs of a day ([giriş, çıkış): the departure day is not a night). */
export function dayActivity(hotel: DemoHotel, day: LocalDate) {
  const rows = stayRows(hotel)
  const arrivals = rows.filter((r) => r.stay.checkIn === day).sort(byRoom)
  const departures = rows.filter((r) => r.stay.checkOut === day && !r.stay.dayUse).sort(byRoom)
  const staying = rows.filter((r) => r.stay.checkIn < day && day < r.stay.checkOut).sort(byRoom)
  const taken = new Set([...arrivals, ...staying].map((r) => r.stay.roomId))
  const blocked = new Set(
    hotel.blocks.filter((b) => b.dateFrom <= day && day < b.dateTo).map((b) => b.roomId)
  )
  const free = hotel.rooms.filter((room) => !taken.has(room.id) && !blocked.has(room.id))
  return { arrivals, departures, staying, free }
}

/** People in the hotel now: stays checked in and not out, with their occupants (G-53, G-54). */
export function inHouse(hotel: DemoHotel): StayRow[] {
  return stayRows(hotel)
    .filter((r) => r.stay.status === 'in_house')
    .sort(byRoom)
}

/** Occupants of in-house stays with a KBS mark missing (§6.15): arrived but not reported, or left unreported. */
export function kbsGaps(hotel: DemoHotel) {
  return inHouse(hotel).flatMap((row) =>
    row.stay.occupants
      .filter((o) => !o.kbsReportedAt || (o.leftAt !== null && !o.kbsCheckoutAt))
      .map((occupant) => ({ ...row, occupant }))
  )
}

/** Every payment of the hotel (reservation folios and sale folios) as the cash rule expects it. */
export function paymentRows(hotel: DemoHotel): (DemoPayment & PaymentRowLike)[] {
  const methods = new Map(hotel.methods.map((m) => [m.code, m]))
  return [...hotel.reservations.flatMap((r) => r.payments), ...hotel.saleFolios].map((p) => {
    const m = methods.get(p.methodCode)
    return { ...p, methodGroup: m?.group ?? 'other', isCash: m?.isCash ?? false }
  })
}

/** The drawer and the not-yet-collected money (§6.4) from the shared rule. */
export const drawerOf = (hotel: DemoHotel): CashPanel => cashPanel(paymentRows(hotel), hotel.expenses)
