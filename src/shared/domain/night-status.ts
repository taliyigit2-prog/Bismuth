// The automatic status of a calendar night (faz-05 teknik not, 03-mimari.md §6.3, §6.14; G-32, G-37): the one
// place a night's colour comes from. Payments fill a folio's nights in order (payment-allocation.ts); the date
// against today gives "geçmiş tarih, boş" for empty cells. The tape chart, the day list and the reports call this,
// so they never disagree.
import type { StatusKey } from '../contract/settings'
import { diffDays, type LocalDate } from '../date'
import { autoStatus } from './cell-status'
import { allocatePayments, type CreditLike, type NightLike, type NightPayStatus } from './payment-allocation'

export interface NightCell {
  date: LocalDate
  /** Payment status of the stay's night on this date, null when the cell is empty. */
  pay: NightPayStatus | null
  dayUse?: boolean
  blocked?: boolean
}

/** Automatic status of one cell on `today`: paid / partial / unpaid / day-use, or blocked / past-empty / empty. */
export function deriveNightStatus(night: NightCell, today: LocalDate): StatusKey {
  return autoStatus({
    pay: night.pay,
    dayUse: night.dayUse ?? false,
    blocked: night.blocked ?? false,
    past: diffDays(night.date, today) > 0
  })
}

export interface FolioNight extends NightLike {
  dayUse: boolean
}

export interface DerivedNight {
  pay: NightPayStatus
  status: StatusKey
  allocatedMinor: number
}

/**
 * Every night of one folio at once (allocation needs all of them, §6.3): its payment status, the automatic
 * status and the amount the payments cover. Keyed by night id.
 */
export function deriveFolioNights(
  nights: readonly FolioNight[],
  payments: readonly CreditLike[],
  today: LocalDate
): Map<string, DerivedNight> {
  const out = new Map<string, DerivedNight>()
  for (const a of allocatePayments(nights, payments))
    out.set(a.night.id, {
      pay: a.status,
      allocatedMinor: a.allocatedMinor,
      status: deriveNightStatus({ date: a.night.date, pay: a.status, dayUse: a.night.dayUse }, today)
    })
  return out
}
