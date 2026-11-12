// Past KBS imports and whether each was entered into the ministry panel ("bildirildi" + date, faz-10 madde 10).
// A row opens its month. Desktop: a table; phone: a list.
import { useTranslation } from 'react-i18next'
import { CheckCircle2Icon, HistoryIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import type { TourismImportView } from '@shared/contract/tourism'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'

export function HistoryCard({
  imports,
  monthName,
  onOpen
}: {
  imports: readonly TourismImportView[]
  monthName: (period: string) => string
  onOpen: (period: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const mobile = useIsMobile()
  const day = (iso: string): string => f.date(localDateOf(new Date(iso)), 'medium')
  const status = (i: TourismImportView) =>
    i.reportedAt ? (
      <span className="text-foreground flex items-center gap-1.5">
        <CheckCircle2Icon className="text-success size-4 shrink-0" aria-hidden />
        {t('tourism.history.reportedOn', { date: day(i.reportedAt) })}
      </span>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        {t('tourism.history.notReported')}
      </Badge>
    )
  const open = (i: TourismImportView) => (
    <Button variant="ghost" size="sm" onClick={() => onOpen(i.period)}>
      {t('tourism.history.open', { month: monthName(i.period) })}
    </Button>
  )
  return (
    <SectionCard title={t('tourism.history.title')} icon={HistoryIcon} testId="tourism-history">
      {imports.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('tourism.history.none')}</p>
      ) : mobile ? (
        <ul className="grid gap-2">
          {imports.map((i) => (
            <li
              key={i.id}
              className="grid gap-1 rounded-lg border px-3 py-2 text-sm"
              data-testid="history-row"
            >
              <span className="font-medium">{monthName(i.period)}</span>
              <span className="text-muted-foreground text-xs break-all">{i.fileName}</span>
              <span className="text-muted-foreground text-xs">
                {t('tourism.history.importedOn', { date: day(i.importedAt) })}
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {status(i)}
                {open(i)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{t('tourism.history.month')}</TableHead>
              <TableHead>{t('tourism.history.file')}</TableHead>
              <TableHead>{t('tourism.history.imported')}</TableHead>
              <TableHead>{t('tourism.history.status')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('common.details')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((i) => (
              <TableRow key={i.id} data-testid="history-row">
                <TableCell className="font-medium">{monthName(i.period)}</TableCell>
                <TableCell className="max-w-56 truncate" title={i.fileName}>
                  {i.fileName}
                </TableCell>
                <TableCell className="tabular-nums">{day(i.importedAt)}</TableCell>
                <TableCell>{status(i)}</TableCell>
                <TableCell className="py-1 text-end">{open(i)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  )
}
