// Döviz screen (G-110…G-113, G-16): the optional online data side by side — Döviz (rates, hotel rate, converter),
// Hava (hour by hour) and Bayramlar (yearly online check). Each works offline with its last data. `?tab=weather`
// or `?tab=holidays` opens a tab directly (Today's weather card, screenshots).
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { CoinsIcon } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Page } from '@/components/page'
import { EmptyState } from '@/components/states'
import { useCan } from '@/lib/view-as'
import { FxTab } from './fx-tab'
import { HolidayCheckTab } from './holiday-check'
import { WeatherTab } from './weather-tab'

const TABS = ['fx', 'weather', 'holidays'] as const
type Tab = (typeof TABS)[number]

export function CurrencyPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { tab?: unknown }
  const showFx = can('currency')
  const showWeather = can('currency') || can('today')
  const showHolidays = can('calendar.notes', 'edit')
  const allowed = TABS.filter((k) => (k === 'fx' ? showFx : k === 'weather' ? showWeather : showHolidays))
  const wanted = TABS.find((k) => k === search.tab)
  const tab: Tab | undefined = wanted && allowed.includes(wanted) ? wanted : allowed[0]
  return (
    <Page title={t('nav.currency')} description={t('currency.description')}>
      {!tab ? (
        <EmptyState icon={CoinsIcon} title={t('common.noAccessTitle')} body={t('common.noAccessBody')} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) =>
            void navigate({ to: '.', search: v === 'fx' ? {} : { tab: v }, replace: true })
          }
          className="gap-4"
        >
          {allowed.length > 1 ? (
            <TabsList className="max-md:h-auto max-md:w-full">
              {allowed.map((k) => (
                <TabsTrigger key={k} value={k} className="max-md:min-h-11 max-md:flex-1">
                  {t(`currency.tabs.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}
          <TabsContent value="fx">{tab === 'fx' ? <FxTab /> : null}</TabsContent>
          <TabsContent value="weather">{tab === 'weather' ? <WeatherTab /> : null}</TabsContent>
          <TabsContent value="holidays">{tab === 'holidays' ? <HolidayCheckTab /> : null}</TabsContent>
        </Tabs>
      )}
    </Page>
  )
}
