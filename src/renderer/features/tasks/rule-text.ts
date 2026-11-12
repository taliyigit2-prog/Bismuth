// A task template's repeat rule in plain words ("Her gün 12:00", "3 ayda bir · 10:00", "Her ayın son günü ·
// 09:00"): Ayarlar → Görev önerileri and the wizard's step 8 show the seeded suggestions and the hotel's own tasks
// with it (G-91, G-94, K-34).
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, localDate } from '@shared/date'
import { recurrenceRuleSchema } from '@shared/domain/task-recurrence'
import { useFormat } from '@/hooks/use-format'

/** A Sunday: weekday names come from the dates of that week (0 = Sunday … 6 = Saturday). */
const SUNDAY = localDate('2026-10-04')
/** A monthly rule on day 31 falls on every month's last day (task-recurrence.ts). */
const LAST_DAY = 31

/** '' when the rule cannot be read (an older or damaged row). */
export function useRuleText(): (recurrence: unknown) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return useCallback(
    (recurrence) => {
      const parsed = recurrenceRuleSchema.safeParse(recurrence)
      if (!parsed.success) return ''
      const rule = parsed.data
      switch (rule.kind) {
        case 'none':
          return t('settings.taskSuggestions.rule.none')
        case 'daily':
          return t('settings.taskSuggestions.rule.daily', { time: rule.time })
        case 'weekly':
          return t('settings.taskSuggestions.rule.weekly', {
            days: rule.weekdays.map((d) => f.weekday(addDays(SUNDAY, d))).join(', '),
            time: rule.time
          })
        case 'monthly':
          return rule.day === LAST_DAY
            ? t('settings.taskSuggestions.rule.monthlyLast', { time: rule.time })
            : t('settings.taskSuggestions.rule.monthly', { day: rule.day, time: rule.time })
        case 'interval': {
          // "Every month" in words: Russian's "one" form also covers 21, 31… ("Каждый 21 месяц").
          const every =
            rule.unit === 'days'
              ? t('settings.taskSuggestions.rule.days', { count: rule.every })
              : rule.unit === 'months'
                ? rule.every === 1
                  ? t('settings.taskSuggestions.rule.everyMonth')
                  : t('settings.taskSuggestions.rule.months', { count: rule.every })
                : rule.every === 1
                  ? t('settings.taskSuggestions.rule.everyYear')
                  : t('settings.taskSuggestions.rule.years', { count: rule.every })
          return t('settings.taskSuggestions.rule.withTime', { rule: every, time: rule.time })
        }
        case 'everyNStays':
          return t('settings.taskSuggestions.rule.stays', { count: rule.n })
      }
    },
    [t, f]
  )
}
