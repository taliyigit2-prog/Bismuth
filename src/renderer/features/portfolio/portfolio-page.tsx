// Portföy (P21c, K-54, S-116): sahibin bütün otelleri tek ekranda — bugünkü doluluk, kasa, seçilen dönemin
// gelir-gideri ve her otelin salt-okunur takvimi. İstemci bilgisayarda kayıtlı oteller (kullanımdaki canlı, öteki bu
// bilgisayardaki kopyadan); ana bilgisayarda yalnız kendi oteli. Rakamlar ekran servisleriyle aynıdır (bu ekran hesap
// yapmaz); yalnız aynı para biriminin oteller arası toplamı burada alınır, farklı para birimi ayrı satırdır.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BuildingIcon, InfoIcon } from 'lucide-react'
import { today as todayOf } from '@shared/date'
import type { PeriodPreset } from '@shared/domain/reports-period'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/hooks/use-format'
import { initialChoice, periodOf } from '@/features/reports/period'
import { HotelCard } from './hotel-card'
import { PortfolioCalendar } from './portfolio-calendar'
import { hotelKey, hotelOfKey, readable, totalsByCurrency } from './portfolio-model'
import { usePortfolioOverview } from './use-portfolio'

const PRESETS = ['thisMonth', 'lastMonth', 'thisYear'] as const satisfies readonly PeriodPreset[]
type Preset = (typeof PRESETS)[number]

function PortfolioSkeleton() {
  return (
    <div role="status" aria-busy className="grid gap-6 lg:grid-cols-2" data-testid="portfolio-loading">
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-3 rounded-xl border p-4" aria-hidden>
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, j) => (
              <Skeleton key={j} className="h-20" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PortfolioPage() {
  const { t } = useTranslation()
  const f = useFormat()
  const [today] = useState(todayOf)
  const [preset, setPreset] = useState<Preset>('thisMonth')
  const period = useMemo(
    () => periodOf({ ...initialChoice(today), preset, compare: 'none' }, today),
    [preset, today]
  )
  const query = usePortfolioOverview(period)
  const [picked, setPicked] = useState<string | null>(null)

  return (
    <Page title={t('portfolio.title')} description={t('portfolio.description')} wide>
      <div className="grid gap-1.5 sm:w-56">
        <Label htmlFor="portfolio-period">{t('reports.period.label')}</Label>
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger id="portfolio-period" data-testid="portfolio-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`reports.period.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {f.date(period.from, 'medium')} – {f.date(period.to, 'medium')}
        </p>
      </div>
      <QueryView
        query={query}
        loading={<PortfolioSkeleton />}
        isEmpty={(o) => o.hotels.length === 0}
        empty={{
          icon: BuildingIcon,
          title: t('portfolio.noHotels.title'),
          body: t('portfolio.noHotels.body')
        }}
      >
        {(overview) => {
          const totals = totalsByCurrency(overview.hotels).filter((c) => c.hotels > 1)
          const withFigures = overview.hotels.filter((h) => h.figures)
          const ok = readable(overview.hotels)
          const selected = ok.find((h) => hotelKey(h) === picked) ?? ok.find((h) => h.active) ?? ok[0]
          return (
            <div className="grid min-w-0 gap-6">
              {overview.mode === 'host' ? (
                <Alert data-testid="portfolio-host-note">
                  <InfoIcon aria-hidden />
                  <AlertTitle>{t('portfolio.hostNote.title')}</AlertTitle>
                  <AlertDescription>{t('portfolio.hostNote.body')}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-6 lg:grid-cols-2" data-testid="portfolio-hotels">
                {overview.hotels.map((h) => (
                  <HotelCard key={hotelKey(h)} hotel={h} />
                ))}
              </div>
              {totals.length ? (
                <SectionCard title={t('portfolio.totals.title')} testId="portfolio-totals">
                  <ul className="grid gap-2 text-sm">
                    {totals.map((c) => (
                      <li
                        key={c.currency}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                        data-testid={`portfolio-total-${c.currency}`}
                      >
                        <span className="font-medium">
                          {t('portfolio.totals.line', { currency: c.currency, count: c.hotels })}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {t('portfolio.totals.figures', {
                            revenue: f.money(c.revenueMinor, c.currency),
                            expenses: f.money(c.expensesMinor, c.currency),
                            profit: f.money(c.profitMinor, c.currency)
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : withFigures.length > 1 ? (
                <p className="text-muted-foreground text-sm" data-testid="portfolio-no-total">
                  {t('portfolio.totals.mixed')}
                </p>
              ) : null}
              {selected ? (
                <SectionCard
                  title={t('portfolio.calendar.title')}
                  testId="portfolio-calendar-card"
                  action={
                    ok.length > 1 ? (
                      <Select value={hotelKey(selected)} onValueChange={setPicked}>
                        <SelectTrigger
                          aria-label={t('portfolio.calendar.hotel')}
                          className="w-52 max-w-full"
                          data-testid="portfolio-calendar-hotel"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ok.map((h) => (
                            <SelectItem key={hotelKey(h)} value={hotelKey(h)}>
                              {h.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null
                  }
                >
                  <PortfolioCalendar
                    hotel={hotelOfKey(hotelKey(selected))}
                    today={selected.figures?.today ?? today}
                  />
                </SectionCard>
              ) : null}
            </div>
          )
        }}
      </QueryView>
    </Page>
  )
}
