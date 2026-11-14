// Late check-out and no-show fee suggestions (P21d, Ö-22). The rules are hotel settings (`fees.*`); this only turns a
// rule and a nightly price into the amount the desk is offered. All money stays integer minor units; the share of a
// price goes through src/shared/money.ts.
import type { LateCheckoutRule, NoShowRule } from '../contract/settings'
import { money, multiplyRatio } from '../money'

/** Minutes since midnight of 'HH:MM'. */
export const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** Fee offered for leaving at `time`: 0 up to the rule's hour, then a fixed amount or a share of the night's price. */
export function lateCheckoutSuggestion(
  rule: LateCheckoutRule,
  time: string,
  nightlyMinor: number,
  currency: string
): number {
  if (rule.mode === 'none' || minutesOf(time) <= minutesOf(rule.afterTime)) return 0
  if (rule.mode === 'fixed') return rule.amountMinor
  return multiplyRatio(money(nightlyMinor, currency), rule.percentBp, 10_000).amountMinor
}

/** Fee offered when the guest does not arrive: nothing, the first night's price or a fixed amount. */
export function noShowSuggestion(rule: NoShowRule, firstNightMinor: number): number {
  if (rule.mode === 'none') return 0
  return rule.mode === 'fixed' ? rule.amountMinor : firstNightMinor
}
