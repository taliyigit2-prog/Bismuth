// "Gece raporu" (P21d, Ö-22): one A4 page for a day — who arrives, leaves, stays and did not come, the room states and the
// cash summary. The same view is on screen and in the print layout (PrintLayout adds the hotel, title and date).
// A deposit still held is shown apart from income: it is the guest's money to give back (or to turn into income).
import { useTranslation } from 'react-i18next'
import type { LocalDate } from '@shared/date'
import type { NightReport } from '@shared/contract/fees'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { Money, ReportQuery } from './common'

type Line = NightReport['arrivals'][number]

function GuestTable({ id, lines }: { id: 'arrivals' | 'departures' | 'staying' | 'noShows'; lines: Line[] }) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <Card className="gap-2 py-3" data-testid={`night-${id}`}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm">
          {t(`reports.night.${id}`)}{' '}
          <span className="text-muted-foreground font-normal">({lines.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('reports.night.none')}</p>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t('reports.night.room')}</TableHead>
                <TableHead>{t('reports.night.guest')}</TableHead>
                <TableHead className="max-sm:hidden print:table-cell">{t('reports.night.dates')}</TableHead>
                <TableHead className="text-end">{t('reports.night.balance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={`${l.reservationId}-${l.room}`}>
                  <TableCell className="font-medium tabular-nums">{l.room}</TableCell>
                  <TableCell>
                    {l.guest}
                    <span className="text-muted-foreground ms-2 tabular-nums">{l.code}</span>
                  </TableCell>
                  <TableCell className="tabular-nums max-sm:hidden print:table-cell">
                    {f.date(l.checkIn, 'short')} – {f.date(l.checkOut, 'short')}
                  </TableCell>
                  <TableCell className="text-end">
                    {l.balanceMinor === null ? (
                      '–'
                    ) : (
                      <Money minor={l.balanceMinor} currency={l.currency} tone="warn" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  k,
  value
}: {
  k: 'total' | 'occupied' | 'clean' | 'dirty' | 'inspected' | 'outOfService'
  value: number
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-muted-foreground text-xs">{t(`reports.night.rooms.${k}`)}</dt>
      <dd className="text-base font-semibold tabular-nums" data-testid={`night-rooms-${k}`}>
        {value}
      </dd>
    </div>
  )
}

function NightView({ report }: { report: NightReport }) {
  const { t } = useTranslation()
  const r = report.rooms
  return (
    <div className="grid gap-3" data-testid="night-report">
      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6 print:grid-cols-6">
        <Stat k="total" value={r.total} />
        <Stat k="occupied" value={r.occupied} />
        <Stat k="clean" value={r.clean} />
        <Stat k="dirty" value={r.dirty} />
        <Stat k="inspected" value={r.inspected} />
        <Stat k="outOfService" value={r.outOfService} />
      </dl>
      <div className="grid gap-3 lg:grid-cols-2 print:grid-cols-2">
        <GuestTable id="arrivals" lines={report.arrivals} />
        <GuestTable id="departures" lines={report.departures} />
        <GuestTable id="staying" lines={report.staying} />
        <GuestTable id="noShows" lines={report.noShows} />
      </div>
      {report.cash ? (
        <Card className="gap-2 py-3" data-testid="night-cash">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">{t('reports.night.cash')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {report.cash.byCurrency.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('reports.night.cashNone')}</p>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reports.night.currency')}</TableHead>
                    <TableHead className="text-end">{t('reports.night.income')}</TableHead>
                    <TableHead className="text-end">{t('reports.night.refunds')}</TableHead>
                    <TableHead className="text-end">{t('reports.night.expenses')}</TableHead>
                    <TableHead className="text-end">{t('reports.night.depositHeld')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.cash.byCurrency.map((c) => (
                    <TableRow key={c.currency} data-testid={`night-cash-${c.currency}`}>
                      <TableCell className="font-medium">{c.currency}</TableCell>
                      <TableCell className="text-end">
                        <Money minor={c.incomeMinor} currency={c.currency} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Money minor={c.refundMinor} currency={c.currency} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Money minor={c.expenseMinor} currency={c.currency} />
                      </TableCell>
                      <TableCell className="text-end" data-testid={`night-deposit-${c.currency}`}>
                        <Money minor={c.depositHeldMinor} currency={c.currency} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-muted-foreground mt-2 text-xs">{t('reports.night.depositNote')}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function NightTab({ date }: { date: LocalDate }) {
  const query = useApiQuery('reports.nightReport', { date })
  return <ReportQuery query={query}>{(report) => <NightView report={report} />}</ReportQuery>
}
