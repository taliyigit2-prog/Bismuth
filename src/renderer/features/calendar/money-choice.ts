// What happens to the money of a reservation that is cancelled (K-55, S-100): the state of the choice and the rules
// the "Vazgeçme ve iade" and cancel windows share. No screen code here.
import { isAmount, type MoneyValue } from '@/components/money-input'

export type MoneyMode = 'refund' | 'park' | 'keep'

/** What the user chose for the money of a reservation that is cancelled. */
export interface MoneyChoice {
  mode: MoneyMode
  amount: MoneyValue
  methodId: string
  note: string
}

/** Start state: refund the whole collected amount when the user may refund, else park (when possible), else keep. */
export function initialMoneyChoice(
  collectedMinor: number,
  currency: string,
  opts: { canRefund: boolean; allowPark: boolean }
): MoneyChoice {
  return {
    mode: opts.canRefund ? 'refund' : opts.allowPark ? 'park' : 'keep',
    amount: { amountMinor: collectedMinor > 0 ? collectedMinor : null, currency },
    methodId: '',
    note: ''
  }
}

/** Why the choice cannot be sent yet (a translation key) — null when it can. */
export function moneyChoiceProblem(choice: MoneyChoice, collectedMinor: number): string | null {
  if (choice.mode === 'refund') {
    if (!isAmount(choice.amount) || choice.amount.amountMinor <= 0) return 'booking.refund.needAmount'
    if (choice.amount.amountMinor > collectedMinor) return 'booking.refund.tooMuch'
  }
  if (choice.mode === 'keep' && choice.note.trim().length < 3) return 'booking.refund.needNote'
  return null
}

/** The `refund` part of `booking.cancel` for a choice; undefined for "park" (that is `booking.park`). */
export function cancelRefundOf(
  choice: MoneyChoice,
  methods: readonly { id: string }[]
):
  | { mode: 'refund'; methodId: string; amountMinor: number; currency: string }
  | { mode: 'keep'; note: string }
  | undefined {
  if (choice.mode === 'keep') return { mode: 'keep', note: choice.note.trim() }
  if (choice.mode === 'park' || !isAmount(choice.amount)) return undefined
  return {
    mode: 'refund',
    methodId: choice.methodId || methods[0]?.id || '',
    amountMinor: choice.amount.amountMinor,
    currency: choice.amount.currency
  }
}
