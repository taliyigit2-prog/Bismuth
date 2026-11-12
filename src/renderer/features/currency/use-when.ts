// "Bugün 14:05" or "3 Eki 14:05": when a rate or a forecast arrived.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { localDateOf } from '@shared/date'
import { useFormat } from '@/hooks/use-format'

export function useWhen(): (iso: string) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return useCallback(
    (iso: string) => {
      const day = localDateOf(new Date(iso))
      return day === localDateOf(new Date())
        ? t('currency.card.todayAt', { time: f.time(iso) })
        : t('currency.card.dayAt', { day: f.dayMonth(day), time: f.time(iso) })
    },
    [f, t]
  )
}
