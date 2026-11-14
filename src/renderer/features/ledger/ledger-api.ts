// Data plumbing of the ledger and the drawer panel (Faz 7): the reads, one write hook that refreshes every screen a
// ledger write touches — the ledger itself, the drawer panel, the tape chart and the reservation panel (a payment
// written here repaints the nights, G-60), supply purchases (an expense with product lines is a purchase), staff
// and Today — and small helpers shared by the dialogs.
import { useMutation, useQueryClient, type Query } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ProcedureInput, ProcedureName, ProcedureOutput } from '@shared/contract'
import type { LocalDate } from '@shared/date'
import { useApiQuery } from '@/lib/api/hooks'
import { useTransport } from '@/lib/api/api-context'
import { isSessionError } from '@/lib/session/query-client'
import type { ApiError } from '@/lib/transport/types'
import type { Format } from '@/hooks/use-format'
import { errorText } from '@/features/settings/use-admin'

export type LedgerOptions = ProcedureOutput<'ledger.options'>
export type LedgerDay = ProcedureOutput<'ledger.day'>
export type LedgerMonth = ProcedureOutput<'ledger.month'>
export type IncomeRow = LedgerDay['income'][number]
export type ExpenseRow = LedgerDay['expenses'][number]
export type CashPanelData = ProcedureOutput<'ledger.cashPanel'>
export type HandoverRow = ProcedureOutput<'ledger.handovers'>[number]
export type ReservationHit = ProcedureOutput<'ledger.searchReservations'>[number]

/** Query names a ledger write makes stale. */
const TOUCHED = ['ledger.', 'reservations.', 'booking.', 'supply.', 'staff.', 'today.', 'shift.']

export const isLedgerTouched = (query: Pick<Query, 'queryKey'>): boolean => {
  const name = query.queryKey[0]
  return typeof name === 'string' && TOUCHED.some((p) => name.startsWith(p))
}

export const useLedgerOptions = (enabled = true) =>
  useApiQuery('ledger.options', {}, { staleTime: 60_000, enabled })

export const useLedgerDay = (date: LocalDate, enabled = true) =>
  useApiQuery('ledger.day', { date, includeVoided: true }, { enabled })

export const useLedgerMonth = (year: number, month: number, enabled = true) =>
  useApiQuery('ledger.month', { year, month }, { enabled })

export interface LedgerMutationOptions<K extends ProcedureName> {
  /** Toast after success (already translated). */
  success?: string
  onSuccess?: (data: ProcedureOutput<K>) => void
  /** Return true when the caller showed the error itself (no toast). */
  onError?: (error: ApiError) => boolean | void
}

/** A write of the ledger or the drawer: refreshes every read it touches, toasts the outcome. */
export function useLedgerMutation<K extends ProcedureName>(name: K, options: LedgerMutationOptions<K> = {}) {
  const transport = useTransport()
  const client = useQueryClient()
  const { t } = useTranslation()
  return useMutation<ProcedureOutput<K>, ApiError, ProcedureInput<K>>({
    mutationFn: (input) => transport.call(name, input),
    onSuccess: async (data) => {
      if (options.success) toast.success(options.success, { id: 'ledger-ok' })
      options.onSuccess?.(data)
      await client.invalidateQueries({ predicate: isLedgerTouched })
    },
    onError: (error) => {
      if (isSessionError(error)) return
      if (options.onError?.(error)) return
      toast.error(errorText(t, error), { id: 'ledger-error' })
    }
  })
}

/** A seeded name in the UI language; the hotel's own rows keep their own words. */
export function localName(
  f: Format,
  item: { name: string | null; nameI18n: { tr?: string; en?: string; ru?: string } | null }
): string {
  return item.nameI18n?.[f.locale] || item.name || item.nameI18n?.tr || ''
}

/** Thousandths → "1,5" (quantities of product lines). */
export function qtyText(qtyMilli: number, f: Format): string {
  const whole = Math.trunc(qtyMilli / 1000)
  const rest = qtyMilli % 1000
  if (!rest) return f.number(whole)
  const sep = f.locale === 'en' ? '.' : ','
  return `${f.number(whole)}${sep}${String(rest).padStart(3, '0').replace(/0+$/, '')}`
}

/** "1,5" / "1.5" / "2" → thousandths; null when not a positive number with at most three decimals. */
export function qtyToMilli(text: string): number | null {
  const m = /^(\d{1,9})(?:[.,](\d{1,3}))?$/.exec(text.trim())
  if (!m) return null
  const milli = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'))
  return milli > 0 ? milli : null
}

/**
 * How the base-currency value of a row was found: `none` = no rate was known (left out of the base totals),
 * `old` = the last known rate was hours old when the row was written (internet off, G-70), `manual` = typed.
 */
export function rateBadge(row: {
  currency: string
  amountBaseMinor: number | null
  fxSource: string | null
  fxRateObservedAt: string | null
  at: string
}): 'none' | 'old' | 'manual' | null {
  if (row.amountBaseMinor == null) return 'none'
  if (row.fxSource === 'manual') return 'manual'
  if (row.fxRateObservedAt && Date.parse(row.at) - Date.parse(row.fxRateObservedAt) > 6 * 3_600_000)
    return 'old'
  return null
}

/** Signed amount (refunds negative). */
export const signedAmount = (r: Pick<IncomeRow, 'kind' | 'amountMinor'>): number =>
  r.kind === 'refund' ? -r.amountMinor : r.amountMinor
