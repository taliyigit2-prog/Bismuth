// Staff screen wording helpers: "2 yıl 7 ay" since the start date, "Ekim 2026" month titles, "9 sa 30 dk"
// durations and a role's name in the UI language.
import { useTranslation } from 'react-i18next'
import type { LocalDate } from '@shared/date'
import { LOCALE_TAG } from '@shared/format'
import type { ProcedureOutput } from '@shared/contract'
import { useFormat } from '@/hooks/use-format'
import { tenure } from './derive'
import { firstDay, type YearMonth } from './use-staff'

export function useTenureText(): (start: LocalDate, today: LocalDate) => string {
  const { t } = useTranslation()
  return (start, today) => {
    const { years, months } = tenure(start, today)
    if (!years && !months) return t('staff.tenure.lessThanMonth')
    const parts = [
      years ? t('staff.tenure.years', { count: years }) : null,
      months || !years ? t('staff.tenure.months', { count: months }) : null
    ]
    return parts.filter(Boolean).join(' ')
  }
}

/** "Ekim 2026" (the long month name, first letter upper case in every language). */
export function useMonthLabel(): (month: YearMonth) => string {
  const f = useFormat()
  const tag = LOCALE_TAG[f.locale]
  const fmt = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', numberingSystem: 'latn' })
  return (month) => {
    const text = fmt.format(new Date(`${firstDay(month)}T12:00:00`))
    return text.charAt(0).toLocaleUpperCase(tag) + text.slice(1)
  }
}

/** Minutes as hours: "10 sa", "9,5 sa"; zero as a dash. */
export function useHours(): (minutes: number) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return (minutes) =>
    minutes ? t('staff.salary.hours', { value: f.number(minutes / 60, minutes % 60 ? 1 : 0) }) : '—'
}

type Policy = ProcedureOutput<'staff.getPolicy'>['values']

/** What the hotel rule does with leave: "Ayda 4 gün izin · kullanılmayan izin ödenir (×1)". */
export function usePolicyLine(): (policy: Policy | undefined) => string | null {
  const { t } = useTranslation()
  return (policy) => {
    if (!policy || policy.leaveDaysPerMonth === undefined) return null
    return [
      t('staff.leave.policyDays', { count: policy.leaveDaysPerMonth }),
      policy.leaveCarryOver
        ? t('staff.leave.policyCarry')
        : policy.unusedLeavePaid
          ? t('staff.leave.policyPaid', { multiplier: policy.unusedLeaveMultiplier ?? '1' })
          : t('staff.leave.policyLost')
    ].join(' · ')
  }
}
