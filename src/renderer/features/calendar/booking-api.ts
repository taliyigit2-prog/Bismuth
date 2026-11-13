// Data plumbing of the reservation panel (faz-05 madde 2, 3, 4): the panel's reads, one write hook that refreshes
// every calendar read after a change (the tape chart's `reservations.*` and the panel's `booking.*`), and the
// error text of a refused write with its details (which room, which nights, whose booking).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient, type Query } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import type { ProcedureInput, ProcedureName, ProcedureOutput } from '@shared/contract'
import type { LocalDate } from '@shared/date'
import { useApiQuery } from '@/lib/api/hooks'
import { useTransport } from '@/lib/api/api-context'
import { isSessionError } from '@/lib/session/query-client'
import { ApiError } from '@/lib/transport/types'
import { useFormat, type Format } from '@/hooks/use-format'

export type BookingView = ProcedureOutput<'booking.get'>
export type BookingStay = BookingView['stays'][number]
export type BookingOptions = ProcedureOutput<'booking.options'>
export type BookingRoom = BookingOptions['rooms'][number]
export type BlacklistHit = ProcedureOutput<'booking.checkBlacklist'>[number]

/** Reads a reservation write can change: the tape chart, the panel, the ledger and cash drawer (payments taken
 * in the panel), Today and the in-house list. */
const BOOKING_DEPENDENT = ['reservations.', 'booking.', 'ledger.', 'today.', 'inHouse.', 'shift.'] as const
export const isCalendarQuery = (query: Pick<Query, 'queryKey'>): boolean => {
  const name = query.queryKey[0]
  return typeof name === 'string' && BOOKING_DEPENDENT.some((prefix) => name.startsWith(prefix))
}

export const useBookingOptions = (enabled = true) =>
  useApiQuery('booking.options', {}, { staleTime: 60_000, enabled })

export function useBooking(id: string | null) {
  return useApiQuery('booking.get', { id: id ?? '' }, { enabled: !!id })
}

/** A seeded name in the UI language; the hotel's own rows keep their own words. */
export function localName(
  f: Format,
  item: { name: string; nameI18n: { tr?: string; en?: string; ru?: string } | null }
): string {
  return item.nameI18n?.[f.locale] || item.name || item.nameI18n?.tr || ''
}

/** "3 Eki, 4 Eki" — the nights a refusal names. */
export const dateList = (f: Format, dates: unknown): string =>
  Array.isArray(dates)
    ? dates
        .slice(0, 5)
        .map((d) => f.dayMonth(String(d) as LocalDate))
        .join(', ') + (dates.length > 5 ? '…' : '')
    : ''

/** What a refused write says, with the service's details where the panel can name them. */
export function bookingErrorText(t: TFunction, f: Format, error: unknown): string {
  if (!(error instanceof ApiError)) return t('errors.internal')
  const d = (error.details && typeof error.details === 'object' ? error.details : {}) as Record<
    string,
    unknown
  >
  // An hourly clash names the hours in the way (K-48), not only the day.
  if (
    error.messageKey === 'errors.roomOccupied' &&
    d['room'] &&
    Array.isArray(d['hours']) &&
    d['hours'].length
  )
    return t('booking.conflict.occupiedHours', {
      room: d['room'],
      dates: dateList(f, d['dates']),
      hours: d['hours'].join(', ')
    })
  if (error.messageKey === 'errors.roomOccupied' && d['room'])
    return t('booking.conflict.occupied', {
      room: d['room'],
      dates: dateList(f, d['dates']),
      codes: Array.isArray(d['codes']) ? d['codes'].join(', ') : ''
    })
  if (error.messageKey === 'errors.roomBlocked' && d['room'])
    return t('booking.conflict.blocked', { room: d['room'], dates: dateList(f, d['dates']) })
  if (error.messageKey === 'errors.checkoutTooEarly' && typeof d['min'] === 'string')
    return t('errors.checkoutTooEarly', { min: f.date(d['min'] as LocalDate, 'medium') })
  return t(error.messageKey as 'errors.internal', { ...d, defaultValue: t('errors.internal') })
}

export interface BookingMutationOptions<K extends ProcedureName> {
  /** Toast after success (already translated). */
  success?: string
  onSuccess?: (data: ProcedureOutput<K>) => void
  /** Return true when the caller showed the error itself (no toast); `input` is what was sent. */
  onError?: (error: ApiError, input: ProcedureInput<K>) => boolean | void
}

/** A write of the panel: refreshes the calendar reads, toasts the outcome. */
export function useBookingMutation<K extends ProcedureName>(
  name: K,
  options: BookingMutationOptions<K> = {}
) {
  const transport = useTransport()
  const client = useQueryClient()
  const { t } = useTranslation()
  const f = useFormat()
  return useMutation<ProcedureOutput<K>, ApiError, ProcedureInput<K>>({
    mutationFn: (input) => transport.call(name, input),
    onSuccess: async (data) => {
      // The panel's own view first (no flash of the old one), then every calendar read.
      if (name !== 'booking.get' && data && typeof data === 'object' && 'reservation' in data) {
        const view = data as unknown as BookingView
        client.setQueryData(['booking.get', { id: view.reservation.id }], view)
      }
      if (options.success) toast.success(options.success)
      options.onSuccess?.(data)
      await client.invalidateQueries({ predicate: isCalendarQuery })
    },
    onError: (error, input) => {
      if (isSessionError(error)) return
      if (options.onError?.(error, input)) return
      toast.error(bookingErrorText(t, f, error))
    }
  })
}

/** "35,20" / "35.20" → rate × 1 000 000 (integer), for an offline payment in another currency; null if invalid. */
export function rateTextToMicro(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.')
  const m = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(clean)
  if (!m) return null
  const micro = Number(`${m[1]}${(m[2] ?? '').padEnd(6, '0')}`)
  return micro > 0 ? micro : null
}

// ---- which reservation the panel shows when nobody passed one (after "Kaydet", from the park area) ----

let requestedPanel: string | null = null
const panelListeners = new Set<() => void>()

/** Opens the reservation panel on `id` (null closes it), from anywhere on the calendar screen. */
export function requestPanel(id: string | null): void {
  requestedPanel = id
  for (const listener of panelListeners) listener()
}

export function usePanelRequest(): string | null {
  return useSyncExternalStore(
    (listener) => {
      panelListeners.add(listener)
      return () => panelListeners.delete(listener)
    },
    () => requestedPanel
  )
}

/** `value`, once it has stopped changing for `ms` (search as you type without a call per key). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
