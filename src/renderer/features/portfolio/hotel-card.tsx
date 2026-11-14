// Bir otelin portföy kartı (P21c): bugünkü doluluk, kasa, seçilen dönemin gelir-gider özeti ve rakamların kaynağı
// (canlı ya da kopya + son eşitleme). Para her otelin kendi para biriminde; hiçbir şey çevrilmez.
import { useTranslation } from 'react-i18next'
import {
  AlertTriangleIcon,
  BedDoubleIcon,
  CopyXIcon,
  PiggyBankIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon
} from 'lucide-react'
import type { PortfolioHotel } from '@shared/contract/procedures/portfolio'
import { KpiCard } from '@/components/kpi-card'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { useFormat } from '@/hooks/use-format'
import { tonightBasisPoints } from './portfolio-model'
import { SourceBadge } from './source-badge'

export function HotelCard({ hotel }: { hotel: PortfolioHotel }) {
  const { t } = useTranslation()
  const f = useFormat()
  const testId = `portfolio-hotel-${hotel.code ?? 'own'}`
  const figures = hotel.figures
  return (
    <SectionCard
      title={hotel.name}
      testId={testId}
      action={
        hotel.active ? (
          <Badge variant="outline" data-testid="hotel-active">
            {t('portfolio.hotel.active')}
          </Badge>
        ) : null
      }
    >
      <div className="grid gap-3">
        <SourceBadge source={hotel.source} syncedAt={hotel.syncedAt} />
        {hotel.state === 'noCopy' ? (
          <EmptyState
            compact
            icon={CopyXIcon}
            title={t('portfolio.noCopy.title')}
            body={t('portfolio.noCopy.body')}
          />
        ) : hotel.state === 'failed' || !figures ? (
          <div role="alert" className="flex items-start gap-2 text-sm" data-testid="hotel-failed">
            <AlertTriangleIcon className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{t('portfolio.failed')}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3" data-testid={`${testId}-kpis`}>
              <KpiCard
                label={t('portfolio.kpi.tonight')}
                value={f.percent(tonightBasisPoints(figures), 0)}
                hint={t('portfolio.kpi.tonightHint', {
                  count: figures.soldTonight,
                  rooms: figures.sellableRooms
                })}
                icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
              />
              <KpiCard
                label={t('portfolio.kpi.drawer')}
                value={
                  figures.drawer.length
                    ? figures.drawer.map((d) => f.money(d.amountMinor, d.currency)).join(' · ')
                    : f.money(0, figures.baseCurrency)
                }
                hint={t('portfolio.kpi.drawerHint')}
                icon={<WalletIcon className="size-3.5" aria-hidden />}
              />
              <KpiCard
                label={t('portfolio.kpi.periodOccupancy')}
                value={f.percent(figures.period.occupancyBp, 1)}
                hint={t('portfolio.kpi.periodOccupancyHint')}
                icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
              />
              <KpiCard
                label={t('portfolio.kpi.revenue')}
                value={f.money(figures.period.revenueMinor, figures.baseCurrency)}
                icon={<TrendingUpIcon className="size-3.5" aria-hidden />}
              />
              <KpiCard
                label={t('portfolio.kpi.expenses')}
                value={f.money(figures.period.expensesMinor, figures.baseCurrency)}
                hint={figures.period.partial ? t('portfolio.kpi.partial') : undefined}
                icon={<TrendingDownIcon className="size-3.5" aria-hidden />}
              />
              <KpiCard
                label={t('portfolio.kpi.profit')}
                value={f.money(figures.period.profitMinor, figures.baseCurrency)}
                icon={<PiggyBankIcon className="size-3.5" aria-hidden />}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {t('portfolio.currencyNote', { currency: figures.baseCurrency })}
            </p>
          </>
        )}
      </div>
    </SectionCard>
  )
}
