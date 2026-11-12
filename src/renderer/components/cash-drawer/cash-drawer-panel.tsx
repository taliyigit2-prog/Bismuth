// The drawer panel (faz-07 madde 2; G-64, S-30, S-31): the Excel "KASA DURUMU" — what should be in the drawer per
// currency, money not yet taken by the owner (currency × method: cash, IBAN and card rows get the same "x"), the
// month's channel totals, then "Teslim al" and the handover history. The same panel opens from the top bar on every
// screen and sits on the ledger screen (the phone's "Kasa" tab).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HandCoinsIcon, HistoryIcon, LandmarkIcon, ReceiptTextIcon, WalletIcon } from 'lucide-react'
import { METHOD_GROUPS, type MethodGroup } from '@shared/domain/cash'
import type { LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { HandoverDialog } from './handover-dialog'
import { HandoverHistory } from './handover-history'

/** Columns always shown in the owner's order (cash → IBAN → card); other groups only when they have money. */
const BASE_GROUPS: readonly MethodGroup[] = ['cash', 'bank', 'card']

export function useCashPanel(enabled = true) {
  return useApiQuery('ledger.cashPanel', {}, { enabled, staleTime: 15_000, refetchInterval: 60_000 })
}

export function DrawerAmount({
  minor,
  currency,
  strong
}: {
  minor: number
  currency: string
  strong?: boolean
}) {
  const f = useFormat()
  if (!minor) return <span className="text-muted-foreground">–</span>
  return (
    <bdi className={cn('tabular-nums', strong && 'font-semibold', minor < 0 && 'text-destructive')}>
      {f.money(minor, currency)}
    </bdi>
  )
}

function PanelSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-3">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-16 w-full" aria-hidden />
      <Skeleton className="h-24 w-full" aria-hidden />
    </div>
  )
}

/**
 * `compact`: the narrow form (top-bar sheet on the phone, the ledger screen on the phone) — the matrix becomes a
 * list. `selected` are payment rows picked on the ledger screen, offered as a third way to take money.
 */
export function CashDrawerPanel({
  compact = false,
  selected = [],
  onCollected
}: {
  compact?: boolean
  selected?: readonly { id: string; amountMinor: number; currency: string }[]
  onCollected?: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const query = useCashPanel()
  const [handover, setHandover] = useState(false)
  const [history, setHistory] = useState(false)
  if (query.isPending) return <PanelSkeleton />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const panel = query.data
  const base = panel.baseCurrency
  const currencies = [...new Set([base, ...Object.keys(panel.pending), ...Object.keys(panel.drawer)])].filter(
    (c) => c === base || panel.drawer[c] || Object.values(panel.pending[c] ?? {}).some(Boolean)
  )
  // A second currency gets its own drawer tile only when cash of it should be in the drawer.
  const tiles = currencies.filter((c) => c === base || panel.drawer[c])
  const groups = METHOD_GROUPS.filter(
    (g) => BASE_GROUPS.includes(g) || currencies.some((c) => panel.pending[c]?.[g])
  )
  const channels = Object.entries(panel.channels)
  const canCollect = can('payments.handover', 'edit')
  const nothing = panel.uncollectedCount === 0 && panel.unsettledExpenseCount === 0
  return (
    <div className="grid gap-4" data-testid="cash-drawer-panel">
      {panel.partial ? (
        <Badge variant="outline" className="w-fit" data-testid="drawer-partial">
          {t('ledger.partial.badge')}
        </Badge>
      ) : null}
      <div className={cn('grid gap-4', !compact && 'md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]')}>
        <div className="grid content-start gap-2" data-testid="drawer-totals">
          {tiles.map((c) => (
            <div key={c} className="bg-accent/60 rounded-lg px-3 py-2" data-testid={`drawer-${c}`}>
              <p className="text-muted-foreground text-xs">{t('ledger.panel.drawer', { currency: c })}</p>
              <p className="text-xl font-semibold tracking-tight tabular-nums">
                <bdi>{f.money(panel.drawer[c] ?? 0, c)}</bdi>
              </p>
            </div>
          ))}
        </div>
        <div className="grid content-start gap-1.5">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <ReceiptTextIcon className="size-3.5" aria-hidden />
            {t('ledger.panel.pending')}
          </p>
          {nothing ? (
            <p className="text-muted-foreground text-sm" data-testid="drawer-empty">
              {t('ledger.drawer.nothingPending')}
            </p>
          ) : compact ? (
            <ul className="grid gap-1 text-sm">
              {currencies.flatMap((c) =>
                groups.map((g) => (
                  <li key={`${c}-${g}`} className="flex min-h-8 items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t(`ledger.group.${g}`)} · {c}
                    </span>
                    <DrawerAmount minor={panel.pending[c]?.[g] ?? 0} currency={c} />
                  </li>
                ))
              )}
            </ul>
          ) : (
            <table className="w-full text-sm" data-testid="drawer-matrix">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th scope="col" className="py-1 text-start font-medium">
                    <span className="sr-only">{t('money.currency')}</span>
                  </th>
                  {groups.map((g) => (
                    <th key={g} scope="col" className="py-1 text-end font-medium">
                      {t(`ledger.group.${g}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c} className="border-t">
                    <th scope="row" className="py-1.5 text-start font-medium">
                      {c}
                    </th>
                    {groups.map((g) => (
                      <td key={g} className="py-1.5 text-end">
                        <DrawerAmount minor={panel.pending[c]?.[g] ?? 0} currency={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!nothing ? (
            <p className="text-muted-foreground text-xs" data-testid="drawer-waiting">
              {t('ledger.drawer.waiting', { count: panel.uncollectedCount + panel.unsettledExpenseCount })}
              {panel.oldestDate
                ? ` · ${t('ledger.drawer.since', { date: f.date(panel.oldestDate as LocalDate, 'medium') })}`
                : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <LandmarkIcon className="size-3.5" aria-hidden />
          {t('ledger.panel.platforms', { month: f.monthYear(panel.monthFrom as LocalDate) })}
        </p>
        <ChannelTotals channels={channels} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {canCollect ? (
          <Button onClick={() => setHandover(true)} disabled={nothing} data-testid="drawer-collect">
            <HandCoinsIcon aria-hidden />
            {t('ledger.drawer.collect')}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">{t('ledger.drawer.collectNoRight')}</p>
        )}
        <Button
          variant="outline"
          onClick={() => setHistory((v) => !v)}
          aria-expanded={history}
          data-testid="drawer-history-toggle"
          className="md:ms-auto"
        >
          <HistoryIcon aria-hidden />
          {t('ledger.drawer.history')}
        </Button>
      </div>
      {panel.lastHandover && !history ? (
        <p className="text-muted-foreground text-xs" data-testid="drawer-last">
          {panel.lastHandover.byName
            ? t('ledger.drawer.lastBy', {
                when: `${f.date(panel.lastHandover.at.slice(0, 10) as LocalDate, 'medium')} ${f.time(panel.lastHandover.at)}`,
                name: panel.lastHandover.byName
              })
            : t('ledger.drawer.last', {
                when: `${f.date(panel.lastHandover.at.slice(0, 10) as LocalDate, 'medium')} ${f.time(panel.lastHandover.at)}`
              })}
        </p>
      ) : null}
      {history ? <HandoverHistory compact={compact} /> : null}
      <HandoverDialog
        open={handover}
        onOpenChange={setHandover}
        panel={panel}
        selected={selected}
        onDone={onCollected}
      />
    </div>
  )
}

function ChannelTotals({ channels }: { channels: [string, Record<string, number>][] }) {
  const { t } = useTranslation()
  const f = useFormat()
  const query = useApiQuery('ledger.options', {}, { staleTime: 60_000 })
  const named = new Map((query.data?.channels ?? []).map((c) => [c.code, c]))
  // The Excel "Platform" column: booking sites, agencies, luggage platforms — not the hotel's own direct channels.
  const shown = channels.filter(([code]) => named.get(code)?.kind !== 'direct')
  const label = (code: string): string => {
    const c = named.get(code)
    return c ? c.nameI18n?.[f.locale] || c.name || code : code
  }
  if (!shown.length) return <p className="text-muted-foreground text-sm">{t('ledger.panel.noPlatforms')}</p>
  return (
    <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2" data-testid="drawer-channels">
      {shown.map(([code, totals]) => (
        <li key={code} className="flex items-center justify-between gap-3">
          <span className="min-w-0 break-words">{label(code)}</span>
          <span className="flex flex-wrap justify-end gap-x-2">
            {Object.entries(totals).map(([c, v]) => (
              <DrawerAmount key={c} minor={v} currency={c} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Icon for the top-bar button and the ledger card. */
export const DrawerIcon = WalletIcon
