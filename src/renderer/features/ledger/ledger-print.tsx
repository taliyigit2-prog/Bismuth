// The day ledger on paper (faz-15 madde 8): A4 like the reports (the same print layout — hotel, "Defter", the day
// on every page, page numbers, light colours whatever the theme), the day's totals, every payment and expense of
// the day with time, room, guest, method and amount, cancelled rows struck through and named, and the day note.
// Only what the role may see reaches it: the rows are the screen's own (`ledger.day`).
import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { PrintLayout } from '../reports/print-layout'
import { DaySummaryCard } from './day-parts'
import { localName, signedAmount, type LedgerDay, type LedgerOptions } from './ledger-api'

export function LedgerDayPrint({ day, options }: { day: LedgerDay; options: LedgerOptions }) {
  const { t } = useTranslation()
  const f = useFormat()
  const method = (id: string | null, group: string): string => {
    const m = options.methods.find((x) => x.id === id)
    return m ? localName(f, m) : t(`ledger.group.${group}` as 'ledger.group.cash')
  }
  const channel = (id: string | null, code: string | null): string => {
    const ch = options.channels.find((c) => c.id === id || (code && c.code === code))
    return !ch || ch.kind === 'direct' ? t('ledger.payments.direct') : localName(f, ch)
  }
  const section = (id: string, code: string): string => {
    const s = options.sections.find((x) => x.id === id)
    return s ? localName(f, s) : code
  }
  const voided = (v: boolean) => (v ? ` · ${t('ledger.payments.voided')}` : '')
  return (
    <PrintLayout title={t('ledger.print.title')} range={f.date(day.date, 'full')}>
      <DaySummaryCard day={day} />
      <section className="grid gap-2" data-testid="print-income">
        <h2 className="text-sm font-semibold">{t('ledger.payments.title')}</h2>
        {day.income.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ledger.col.time')}</TableHead>
                <TableHead>{t('ledger.col.room')}</TableHead>
                <TableHead>{t('ledger.col.guest')}</TableHead>
                <TableHead>{t('ledger.col.method')}</TableHead>
                <TableHead>{t('ledger.col.channel')}</TableHead>
                <TableHead className="text-end">{t('ledger.col.amount')}</TableHead>
                <TableHead>{t('ledger.payments.mark')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {day.income.map((p) => (
                <TableRow key={p.id} className={cn(p.voided && 'text-muted-foreground line-through')}>
                  <TableCell className="tabular-nums">{f.time(p.at)}</TableCell>
                  <TableCell className="tabular-nums">{p.roomNumbers.join(', ') || '—'}</TableCell>
                  <TableCell className="whitespace-normal">
                    {(p.saleTitle ?? p.guestName ?? '—') + voided(p.voided)}
                  </TableCell>
                  <TableCell>
                    {method(p.methodId, p.methodGroup)}
                    {p.kind === 'payment' ? '' : ` · ${t(`calendar.paymentKind.${p.kind}`)}`}
                  </TableCell>
                  <TableCell>{channel(p.channelId, p.channelCode)}</TableCell>
                  <TableCell className="text-end">
                    <bdi className="tabular-nums">{f.money(signedAmount(p), p.currency)}</bdi>
                  </TableCell>
                  <TableCell>{p.collected ? t('ledger.payments.mark') : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">{t('ledger.payments.empty')}</p>
        )}
      </section>
      <section className="grid gap-2" data-testid="print-expenses">
        <h2 className="text-sm font-semibold">{t('ledger.expenses.title')}</h2>
        {day.expenses.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ledger.col.time')}</TableHead>
                <TableHead>{t('ledger.col.section')}</TableHead>
                <TableHead>{t('ledger.col.description')}</TableHead>
                <TableHead>{t('ledger.col.method')}</TableHead>
                <TableHead className="text-end">{t('ledger.col.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {day.expenses.map((e) => (
                <TableRow key={e.id} className={cn(e.voided && 'text-muted-foreground line-through')}>
                  <TableCell className="tabular-nums">{f.time(e.at)}</TableCell>
                  <TableCell>{section(e.sectionId, e.sectionCode)}</TableCell>
                  <TableCell className="whitespace-normal">{e.description + voided(e.voided)}</TableCell>
                  <TableCell>
                    {e.paidFromDrawer ? t('ledger.expenses.drawer') : method(e.methodId, e.methodGroup)}
                  </TableCell>
                  <TableCell className="text-end">
                    <bdi className="tabular-nums">{f.money(-e.amountMinor, e.currency)}</bdi>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">{t('ledger.expenses.empty')}</p>
        )}
      </section>
      {day.note ? (
        <section className="grid gap-1" data-testid="print-note">
          <h2 className="text-sm font-semibold">{t('ledger.note.title')}</h2>
          <p className="text-sm whitespace-pre-wrap">{day.note}</p>
        </section>
      ) : null}
    </PrintLayout>
  )
}
