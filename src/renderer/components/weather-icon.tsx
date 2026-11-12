// Weather symbol (G-113, K-13): the Yr symbol set, one file per MET `symbol_code`, bundled — no network for icons.
import { useTranslation } from 'react-i18next'
import { symbolBase } from '@shared/domain/weather'
import { cn } from '@/lib/utils'

const urls = import.meta.glob<string>('../assets/weather/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})

/** Yr symbol code → bundled file URL. */
const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(urls).map(([path, url]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), url])
)

export const WEATHER_SYMBOLS = Object.keys(ICONS)

export function WeatherIcon({ symbol, className }: { symbol: string; className?: string }) {
  const { t } = useTranslation()
  const known = symbol in ICONS
  return (
    <img
      src={ICONS[known ? symbol : 'cloudy']}
      alt={t(`weather.condition.${symbolBase(known ? symbol : 'cloudy')}`, {
        defaultValue: t('weather.condition.cloudy')
      })}
      className={cn('size-10 select-none', className)}
      draggable={false}
    />
  )
}
