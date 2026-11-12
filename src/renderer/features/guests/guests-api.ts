// Data plumbing of the guest screens (Faz 6): the reads, the names of the hotel's lists a history row shows
// (sales channel, payment method) and the queries a guest write makes stale.
import { useCallback, useMemo } from 'react'
import type { ListItem, ProcedureName } from '@shared/contract'
import { formatPhone, type PhoneValue } from '@/components/phone-field'
import { useApiQuery } from '@/lib/api/hooks'
import { useLocalName } from '@/features/settings/use-admin'

/** Every read a guest, company or blacklist write may change (the reservation panel reads guests too). */
export const GUEST_READS: readonly ProcedureName[] = [
  'guests.list',
  'guests.card',
  'guests.history',
  'companies.list',
  'companies.get',
  'blacklist.list',
  'blacklist.check',
  'booking.guestSummary',
  'booking.searchGuests',
  'booking.checkBlacklist'
]

/** Channel and payment-method names by id, in the UI language (inactive rows too: old stays use them). */
export function useListNames(): { channel: (id: string | null) => string; method: (id: string) => string } {
  const nameOf = useLocalName()
  const channels = useApiQuery(
    'lists.list',
    { kind: 'salesChannels', includeInactive: true },
    { staleTime: 60_000 }
  )
  const methods = useApiQuery(
    'lists.list',
    { kind: 'paymentMethods', includeInactive: true },
    { staleTime: 60_000 }
  )
  const channel = useCallback(
    (id: string | null): string => {
      const row = id ? channels.data?.find((c) => c.id === id) : undefined
      return row ? nameOf(row.nameI18n, row.name) : ''
    },
    [channels.data, nameOf]
  )
  const method = useCallback(
    (id: string): string => {
      const row = methods.data?.find((m) => m.id === id)
      return row ? nameOf(row.nameI18n, row.name) : ''
    },
    [methods.data, nameOf]
  )
  return { channel, method }
}

/** A guest tag (G-50) in the UI language. */
export interface GuestTag {
  id: string
  name: string
  active: boolean
}

/** Every guest tag (switched-off ones too: old cards show them), in the list's order. */
export function useGuestTags(enabled = true): { tags: GuestTag[]; isPending: boolean; isError: boolean } {
  const nameOf = useLocalName()
  const query = useApiQuery(
    'lists.list',
    { kind: 'guestTags', includeInactive: true },
    { staleTime: 60_000, enabled }
  )
  const tags = useMemo(
    () =>
      (query.data ?? []).map((row: ListItem) => ({
        id: row.id,
        name: nameOf(row.nameI18n, row.name),
        active: row.active
      })),
    [query.data, nameOf]
  )
  return { tags, isPending: enabled && query.isPending, isError: query.isError }
}

/** "905321234567" → "+90 532 123 45 67" for a stored normalised phone (blacklist rows keep only that). */
export function displayPhone(normalized: string | null): string | null {
  if (!normalized) return null
  if (normalized.startsWith('90') && normalized.length === 12)
    return `+90 ${normalized.slice(2, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 10)} ${normalized.slice(10)}`
  return `+${normalized}`
}

/** The phone as stored, '' when empty; a Turkish number typed with its leading 0 ("0533…") keeps one 90. */
export function phoneText(value: PhoneValue): string {
  const number = value.code === '90' ? value.number.replace(/^0+/, '') : value.number
  return number ? formatPhone({ ...value, number }) : ''
}
