// "Yine de yaz" (03-mimari.md §6.1, G-38): a write into a blocked range or a room the hotel does not sell is
// refused by the service; whoever may close rooms (`rooms.block`) can send it again with a reason, which goes into
// the audit log. This hook catches such a refusal of a panel write; `OverrideDialog` asks for the reason.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import type { ApiError } from '@/lib/transport/types'
import { bookingErrorText, dateList } from './booking-api'

const OVERRIDABLE = new Set(['errors.roomBlocked', 'errors.roomNotForSale'])

/** A refusal the user may overrule with a reason (a block, a room not for sale). */
export const isOverridable = (error: ApiError): boolean => OVERRIDABLE.has(error.messageKey)

export interface BlockOverride<I> {
  /** For `useBookingMutation`'s `onError`: true when the refusal waits for a reason (no toast). */
  onError: (error: ApiError, input: I) => boolean
  /** The refused write and what the service said, while the reason is asked. */
  pending: { input: I; message: string } | null
  clear: () => void
}

export function useBlockOverride<I>(): BlockOverride<I> {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const [pending, setPending] = useState<{ input: I; message: string } | null>(null)
  return {
    onError: (error, input) => {
      if (!isOverridable(error) || !can('rooms.block', 'edit')) return false
      // The person may write it anyway: say what is closed, not "choose another room" (QA3c1 #12).
      const d = (error.details && typeof error.details === 'object' ? error.details : {}) as Record<
        string,
        unknown
      >
      const message = !d['room']
        ? bookingErrorText(t, f, error)
        : error.messageKey === 'errors.roomBlocked'
          ? t('booking.override.blocked', { room: d['room'], dates: dateList(f, d['dates']) })
          : t('booking.override.notForSale', { room: d['room'] })
      setPending({ input, message })
      return true
    },
    pending,
    clear: () => setPending(null)
  }
}
