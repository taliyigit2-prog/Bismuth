// "Kasa ve ödemeler" (faz-10 madde 5): totals by payment method and currency (with what is still waiting for the
// owner's "x"), the handover history, the age of money not yet taken, card and IBAN rows without the "x" and the
// drawer per currency right now.
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CreditCardIcon,
  HandCoinsIcon,
  HistoryIcon,
  HourglassIcon,
  VaultIcon
} from 'lucide-react'
import type { CashReport } from '@shared/contract/procedures/reports'
import { localDateOf } from '@shared/date'
import type { Period } from '@shared/domain/reports-period'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { ChartCard } from './chart-card'
import { usePrintMode } from './print-mode'
import { Money, ReportQuery } from './common'
import { useReportLabels } from './labels'

function CashView({ report }: { report: CashReport }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const print = usePrintMode()
  const labels = useReportLabels()
  const c = report.baseCurrency
  const totalBase = report.methods.reduce((s, m) => s + m.baseMinor, 0)
  return (
    <div className="grid gap-4">
      <ChartCard
        title={t('reports.cash.methods')}
        icon={HandCoinsIcon}
        testId="cash-methods"
        exportId="methods"
        empty={report.methods.length ? null : t('reports.chart.empty')}
        table={{
          columns: [
            { key: 'method', label: t('reports.col.method') },
            { key: 'cur', label: t('reports.col.currency'), minor: true },
            { key: 'amount', label: t('reports.col.original'), numeric: true },
            { key: 'pending', label: t('reports.col.pending'), numeric: true },
            { key: 'base', label: t('reports.col.baseOf', { currency: c }), numeric: true, minor: true }
          ],
          rows: report.methods.map((m) => ({
            key: `${m.methodId}-${m.currency}`,
            cells: {
              method: labels.list(m) || t(`ledger.group.${m.group}`),
              cur: m.currency,
              amount: <Money minor={m.amountMinor} currency={m.currency} />,
              pending: <Money minor={m.pendingMinor} currency={m.currency} tone="warn" />,
              base: <Money minor={m.baseMinor} currency={c} />
            }
          })),
          footer: { method: t('common.total'), base: <Money minor={totalBase} currency={c} strong /> }
        }}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
        <ChartCard
          title={t('reports.cash.aging')}
          icon={HourglassIcon}
          testId="cash-aging"
          exportId="aging"
          note={t('reports.cash.agingNote', {
            date: f.date(report.to < report.today ? report.to : report.today, 'medium')
          })}
          table={{
            columns: [
              { key: 'age', label: t('reports.col.age') },
              { key: 'rows', label: t('reports.col.rows'), numeric: true },
              { key: 'amount', label: t('reports.col.amount'), numeric: true }
            ],
            rows: report.aging.map((a) => ({
              key: a.bucket,
              cells: {
                age: t(`reports.cash.age.${a.bucket}`),
                rows: a.rows,
                amount: <Money minor={a.baseMinor} currency={c} tone={a.bucket === 'd90' ? 'bad' : 'warn'} />
              }
            }))
          }}
        />
        <ChartCard
          title={t('reports.cash.drawer')}
          icon={VaultIcon}
          testId="cash-drawer"
          exportId="drawer"
          note={t('reports.cash.drawerNote')}
          table={{
            columns: [
              { key: 'cur', label: t('reports.col.currency') },
              { key: 'amount', label: t('reports.col.amount'), numeric: true }
            ],
            rows: report.drawer.length
              ? report.drawer.map((d) => ({
                  key: d.currency,
                  cells: {
                    cur: d.currency,
                    amount: <Money minor={d.amountMinor} currency={d.currency} strong />
                  }
                }))
              : [{ key: 'empty', cells: { cur: t('reports.cash.drawerEmpty'), amount: '' } }]
          }}
        />
      </div>
      <ChartCard
        title={t('reports.cash.unchecked')}
        icon={CreditCardIcon}
        testId="cash-unchecked"
        exportId="unchecked"
        empty={report.unchecked.length ? null : t('reports.cash.uncheckedNone')}
        note={
          report.uncheckedTotal > report.unchecked.length
            ? t('reports.cash.uncheckedMore', {
                shown: report.unchecked.length,
                total: report.uncheckedTotal
              })
            : null
        }
        table={{
          columns: [
            { key: 'date', label: t('reports.col.date') },
            { key: 'method', label: t('reports.col.method'), minor: true },
            { key: 'guest', label: t('reports.col.guest') },
            { key: 'amount', label: t('reports.col.amount'), numeric: true }
          ],
          rows: report.unchecked.map((u) => ({
            key: u.id,
            cells: {
              date: f.date(u.date, 'medium'),
              method: t(`ledger.group.${u.group}`),
              guest: u.guestName ?? u.reservationCode ?? '–',
              amount: <Money minor={u.amountMinor} currency={u.currency} />
            }
          }))
        }}
      />
      {can('ledger') && !print && report.unchecked.length ? (
        <div className="-mt-2 flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link to="/ledger">
              {t('monthEnd.check.ledger')}
              <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}
      <ChartCard
        title={t('reports.cash.handovers')}
        icon={HistoryIcon}
        testId="cash-handovers"
        exportId="handovers"
        empty={report.handovers.length ? null : t('reports.cash.handoversNone')}
        table={{
          columns: [
            { key: 'at', label: t('reports.col.time') },
            { key: 'by', label: t('reports.col.by'), minor: true },
            { key: 'rows', label: t('reports.col.rows'), numeric: true, minor: true },
            { key: 'totals', label: t('reports.col.amount'), numeric: true }
          ],
          rows: report.handovers.map((h) => ({
            key: h.id,
            cells: {
              at: (
                <span className={h.reverted ? 'text-muted-foreground line-through' : undefined}>
                  {f.date(localDateOf(new Date(h.at)), 'medium')} {f.time(h.at)}
                  {h.reverted ? <span className="sr-only"> ({t('reports.cash.reverted')})</span> : null}
                </span>
              ),
              by: h.byName ?? '–',
              rows: h.paymentCount,
              totals: (
                <span className="grid justify-end">
                  {h.totals.map((x) => (
                    <Money key={x.currency} minor={x.amountMinor} currency={x.currency} />
                  ))}
                </span>
              )
            }
          }))
        }}
      />
    </div>
  )
}

export function CashTab({ period }: { period: Period }) {
  const query = useApiQuery('reports.cash', period)
  return <ReportQuery query={query}>{(r) => <CashView report={r} />}</ReportQuery>
}
