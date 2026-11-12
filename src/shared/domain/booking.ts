// Reservation panel rules (03-mimari.md §6.2, §6.15; G-48, G-53, G-54): the suggested price of each night and
// what the check-out still asks of KBS. Pure functions: the service writes, the panel shows the same answer.
import { nightsOf, weekday, type LocalDate } from '../date'
import { staySlots } from './stays'

/** Why a night got its suggested price: the room type's price, its weekend price, or a special day. */
export type PriceReason = 'base' | 'weekend' | 'special'

export interface TypePrices {
  /** Room type base price (G-48); null = the hotel set no price for the type. */
  baseMinor: number | null
  /** Price of the hotel's weekend nights and special days; null = same as base. */
  weekendMinor: number | null
}

export interface SuggestedNight {
  date: LocalDate
  priceMinor: number
  reason: PriceReason
}

/**
 * §6.2 / S-20: a special day (holiday, the hotel's own special day) or a weekend night takes the room type's
 * weekend price; any other night the base price. A special day wins over the weekday so the reason names it.
 * Weekend nights are their own setting (`pricing.weekendNights`, K-44: Friday and Saturday nights), apart from the
 * days the calendar highlights. Null when the room type has no price at all: the user types it.
 */
export function suggestNightPrice(
  date: LocalDate,
  prices: TypePrices,
  weekendNights: readonly number[],
  specialDates: ReadonlySet<string>
): SuggestedNight | null {
  if (prices.baseMinor === null) return null
  const special = specialDates.has(date)
  const highlighted = weekendNights.includes(weekday(date))
  if ((special || highlighted) && prices.weekendMinor !== null)
    return { date, priceMinor: prices.weekendMinor, reason: special ? 'special' : 'weekend' }
  return { date, priceMinor: prices.baseMinor, reason: 'base' }
}

/** Suggested price for every slot of a stay (its nights, or the one day of a day-use). */
export function suggestStayPrices(
  checkIn: LocalDate,
  checkOut: LocalDate,
  prices: TypePrices,
  weekendNights: readonly number[],
  specialDates: ReadonlySet<string>
): SuggestedNight[] {
  if (checkOut < checkIn) return []
  const out: SuggestedNight[] = []
  for (const s of staySlots(checkIn, checkOut)) {
    const night = suggestNightPrice(s.date, prices, weekendNights, specialDates)
    if (night) out.push(night)
  }
  return out
}

export interface CheckoutPlan {
  /**
   * `onTime`: on (or after) the check-out day, nothing is freed; `early`: the nights from today on are freed;
   * `sameDay`: left on the check-in day — the first night becomes that day's day-use (its price stays, the
   * check-out dialog may change it) and the later nights are freed: the room can be sold tonight (K-44).
   */
  kind: 'onTime' | 'early' | 'sameDay'
  /** Nights the check-out frees. */
  released: LocalDate[]
}

/** What a check-out today does to a stay's nights (the dialog says "N gece boşalacak"; the service does it). */
export function checkoutPlan(
  stay: { checkIn: LocalDate; checkOut: LocalDate },
  today: LocalDate
): CheckoutPlan {
  if (stay.checkIn === stay.checkOut || today >= stay.checkOut) return { kind: 'onTime', released: [] }
  const nights = nightsOf(stay.checkIn, stay.checkOut)
  if (today <= stay.checkIn) return { kind: 'sameDay', released: nights.filter((d) => d > stay.checkIn) }
  return { kind: 'early', released: nights.filter((d) => d >= today) }
}

export interface CheckoutOccupant {
  id: string
  fullName: string
  leftAt?: string | null
  kbsReportedAt?: string | null
  kbsCheckoutAt?: string | null
}

export interface CheckoutGap {
  occupantId: string
  fullName: string
  /** `notReported`: the person was never reported to KBS at all; `checkout`: the KBS check-out is not marked. */
  kind: 'checkout' | 'notReported'
}

/**
 * G-53 at check-out: the people of the room who would still miss a KBS mark once the check-outs ticked in the
 * dialog (`marking`) are written. A ticked person never reported cannot be checked out of KBS: still a gap.
 */
export function checkoutKbsGaps(
  occupants: readonly CheckoutOccupant[],
  marking: ReadonlySet<string>
): CheckoutGap[] {
  const out: CheckoutGap[] = []
  for (const o of occupants) {
    if (o.kbsCheckoutAt) continue
    if (!o.kbsReportedAt) out.push({ occupantId: o.id, fullName: o.fullName, kind: 'notReported' })
    else if (!marking.has(o.id)) out.push({ occupantId: o.id, fullName: o.fullName, kind: 'checkout' })
  }
  return out
}

/** "Ahmet Yılmaz" → { firstName: "Ahmet", lastName: "Yılmaz" }; the last word is the surname. */
export function splitFullName(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' }
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] ?? '' }
}
