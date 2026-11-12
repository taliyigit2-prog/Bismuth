// Payment allocation and the automatic night status (03-mimari.md §6.3; G-32, G-36, G-43). Payments are
// credited in the folio currency and fill the nights in date order (then room order for multi-room
// reservations): first night first, as the owner colours the Excel cells night by night.
import type { LocalDate } from '../date'

export type PaymentKind = 'payment' | 'deposit' | 'refund'

export interface CreditLike {
  kind: PaymentKind
  /** Amount credited to the folio in the folio currency (frozen at write time), always positive. */
  amountFolioMinor: number
  voided?: boolean
}

export interface NightLike {
  id: string
  date: LocalDate
  /** Room order inside the reservation (multi-room: earlier rooms first on the same date). */
  roomSort: number
  priceMinor: number
}

export type NightPayStatus = 'paid' | 'partial' | 'unpaid'

export interface AllocatedNight<N extends NightLike = NightLike> {
  night: N
  allocatedMinor: number
  status: NightPayStatus
}

/** Σ payments and deposits − Σ refunds, voided rows excluded (never negative for allocation). */
export function creditedTotal(credits: readonly CreditLike[]): number {
  let total = 0
  for (const c of credits) {
    if (c.voided) continue
    total += c.kind === 'refund' ? -c.amountFolioMinor : c.amountFolioMinor
  }
  return total
}

export function allocatePayments<N extends NightLike>(
  nights: readonly N[],
  credits: readonly CreditLike[]
): AllocatedNight<N>[] {
  let left = Math.max(0, creditedTotal(credits))
  const ordered = [...nights].sort((a, b) =>
    a.date === b.date ? a.roomSort - b.roomSort : a.date < b.date ? -1 : 1
  )
  return ordered.map((night) => {
    const price = Math.max(0, night.priceMinor)
    const allocatedMinor = Math.min(price, left)
    left -= allocatedMinor
    const status: NightPayStatus =
      allocatedMinor >= price ? 'paid' : allocatedMinor > 0 ? 'partial' : 'unpaid'
    return { night, allocatedMinor, status }
  })
}

export interface FolioTotals {
  chargesMinor: number
  creditedMinor: number
  /** Positive = the guest still owes, negative = the hotel owes back. */
  balanceMinor: number
}

/** Balance = Σ charges (void excluded) − credited (K-09). */
export function folioTotals(
  charges: readonly { amountMinor: number; voided?: boolean }[],
  credits: readonly CreditLike[]
): FolioTotals {
  let chargesMinor = 0
  for (const c of charges) if (!c.voided) chargesMinor += c.amountMinor
  const creditedMinor = creditedTotal(credits)
  return { chargesMinor, creditedMinor, balanceMinor: chargesMinor - creditedMinor }
}
