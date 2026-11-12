// The month's purchases (G-170, §6.13): per product how much was bought and for how much, per supplier the total
// of its slips. Twelve months to choose from; amounts in the hotel's currency (another currency gets its own line).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackageIcon, TruckIcon } from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { SectionCard } from '@/components/section-card'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { monthOfDay, monthStart, shiftMonth, type YearMonth } from './derive'
import { useQty } from './use-qty'

const MONTHS_BACK = 12

function Amounts({ totals }: { totals: readonly { amountMinor: number; currency: string }[] }) {
  const f = useFormat()
  if (!totals.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="grid justify-items-end">
      {totals.map((m) => (
        <bdi key={m.currency}>{f.money(m.amountMinor, m.currency)}</bdi>
      ))}
    </span>
  )
}

export function MonthSummaryView({ today, base }: { today: LocalDate; base: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const qty = useQty()
  const current = monthOfDay(today)
  const months: YearMonth[] = Array.from({ length: MONTHS_BACK }, (_, i) => shiftMonth(current, -i))
  const [picked, setPicked] = useState(0)
  const month = months[picked] ?? current
  const query = useApiQuery('supply.monthSummary', month)
  const label = (m: YearMonth): string => f.monthYear(monthStart(m))
  const total = query.data?.totals ?? []
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={String(picked)} onValueChange={(v) => setPicked(Number(v))}>
          <SelectTrigger className="w-48 max-md:w-full" aria-label={t('supply.summary.month')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m, i) => (
              <SelectItem key={i} value={String(i)}>
                {label(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {query.data ? (
          <p className="text-sm">
            {t('supply.summary.total', { count: query.data.purchaseCount })}{' '}
            <span className="font-semibold tabular-nums">
              {total.length
                ? total.map((m) => f.money(m.amountMinor, m.currency)).join(' + ')
                : f.money(0, base)}
            </span>
          </p>
        ) : null}
      </div>
      {query.isPending ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.purchaseCount ? (
        <p className="text-muted-foreground text-sm">{t('supply.summary.empty', { month: label(month) })}</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <SectionCard title={t('supply.summary.byProduct')} icon={PackageIcon} testId="summary-products">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('supply.col.product')}</TableHead>
                  <TableHead className="text-end">{t('supply.col.qty')}</TableHead>
                  <TableHead className="text-end">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.byProduct.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="whitespace-normal">
                      {p.name}
                      <span className="text-muted-foreground block text-xs">
                        {t('supply.history.purchases', { count: p.purchaseCount })}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{qty(p.qty, p.unit)}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      <Amounts totals={p.totals} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
          <SectionCard title={t('supply.summary.bySupplier')} icon={TruckIcon} testId="summary-suppliers">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('supply.col.supplier')}</TableHead>
                  <TableHead className="text-end">{t('supply.summary.slips')}</TableHead>
                  <TableHead className="text-end">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.bySupplier.map((s) => (
                  <TableRow key={s.contactId ?? 'none'}>
                    <TableCell className="whitespace-normal">
                      {s.name ?? t('supply.purchase.noSupplier')}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{s.purchaseCount}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      <Amounts totals={s.totals} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>{t('common.total')}</TableCell>
                  <TableCell className="text-end tabular-nums">{query.data.purchaseCount}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    <Amounts totals={total} />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </SectionCard>
        </div>
      )}
      <p className="text-muted-foreground text-xs">{t('supply.summary.note')}</p>
    </div>
  )
}
