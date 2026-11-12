// Data plumbing of the Personel screen (Faz 8): month arithmetic, the staff reads every write refreshes, and one
// mutation hook (errors toast with the service's `errors.*` text; the service decides the rights, G-23).
import { localDate, localDateOf, type LocalDate } from '@shared/date'
import type { ProcedureName } from '@shared/contract'
import { useAdminMutation, type AdminMutationOptions } from '@/features/settings/use-admin'

export interface YearMonth {
  year: number
  month: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Today on this computer (the hotel's day; tests fake the clock). */
export const todayLocal = (): LocalDate => localDateOf(new Date())

export const monthOf = (day: LocalDate): YearMonth => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7))
})

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export const firstDay = ({ year, month }: YearMonth): LocalDate => localDate(`${year}-${pad(month)}-01`)

export function lastDay(ym: YearMonth): LocalDate {
  const next = shiftMonth(ym, 1)
  const d = new Date(Date.UTC(next.year, next.month - 1, 1) - 86_400_000)
  return localDate(d.toISOString().slice(0, 10))
}

export const monthKey = ({ year, month }: YearMonth): string => `${year}-${pad(month)}`

export const sameMonth = (a: YearMonth, b: YearMonth): boolean => a.year === b.year && a.month === b.month

/** Every read of the screen: a write may change any of them (the table, the panel, the card, the ledger). */
export const STAFF_READS: readonly ProcedureName[] = [
  'staff.employees',
  'staff.getEmployee',
  'staff.myEmployee',
  'staff.panel',
  'staff.salaryTable',
  'staff.salaryPeriod',
  'staff.listTransactions',
  'staff.leaveBetween',
  'staff.listWork',
  'staff.salaryHistory',
  'staff.linkableUsers',
  'staff.getPolicy',
  'staff.listEmployees',
  // Money paid out is a ledger expense: the ledger, the drawer button and the Today card at once (B27).
  'ledger.day',
  'ledger.month',
  'ledger.cashPanel',
  'ledger.drawerSummary',
  'ledger.handovers'
]

/** A staff write that refreshes the screen's reads and toasts `success` (already translated). */
export function useStaffMutation<K extends ProcedureName>(
  name: K,
  options: Omit<AdminMutationOptions, 'invalidate'> = {}
) {
  return useAdminMutation(name, { ...options, invalidate: STAFF_READS })
}

const HOURS = /^\d{1,2}(?:[.,]\d{1,2})?$/

/**
 * Minutes → hours text the overtime field takes back ("4,33" for 260): at most two decimals, which turn back into
 * the same minutes (B13: "4,333333333333333" could not be saved).
 */
export const minutesToText = (minutes: number, locale: string): string =>
  minutes ? String(Math.round((minutes * 100) / 60) / 100).replace('.', locale === 'en' ? '.' : ',') : ''

/** "2" / "1,5" hours → minutes; null when not a number of hours. */
export function hoursToMinutes(text: string): number | null {
  const v = text.trim()
  if (!v) return 0
  if (!HOURS.test(v)) return null
  const minutes = Math.round(Number(v.replace(',', '.')) * 60)
  return minutes <= 1440 ? minutes : null
}
