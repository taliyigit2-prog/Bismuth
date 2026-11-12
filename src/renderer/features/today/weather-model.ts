// Small weather helpers shared by the Today card and the Hava tab (no components here).
import { useTranslation } from 'react-i18next'
import type { WeatherView } from '@shared/contract/external'
import { useFormat } from '@/hooks/use-format'

export type Day = NonNullable<WeatherView['forecast']>['days'][number]

/** km/h from MET's m/s, whole numbers. */
export const kmh = (ms: number): number => Math.round(ms * 3.6)

/** Decimal degrees typed in any of the three locales ("40,99" or "40.99"); null when not a number in range. */
export function parseDegrees(text: string, max: number): number | null {
  const s = text.trim().replace(',', '.')
  if (!/^-?\d{1,3}(\.\d{1,6})?$/.test(s)) return null
  const n = Number(s)
  return Math.abs(n) <= max ? n : null
}

/** "Yağmur bekleniyor · 2 mm" / "Kar bekleniyor · 3 mm" / "Yağış beklenmiyor" for one day (S-90: mm, no %). */
export function useRainLine(): (day: Day) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return (day) => {
    if (day.precipMm <= 0) return t('weather.dry')
    const kind = /snow/.test(day.symbol) ? 'snow' : /sleet/.test(day.symbol) ? 'sleet' : 'rain'
    return t(`weather.expected.${kind}`, { mm: f.number(day.precipMm, day.precipMm < 10 ? 1 : 0) })
  }
}
