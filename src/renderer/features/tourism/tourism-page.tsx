// Turizm istatistiği (G-150, faz-10 madde 10, 03-mimari.md §6.11): the month's KBS "EGM Konaklayan Listesi" →
// arrivals and nights per nationality in the ministry panel's shape. Same-day stays = 1 night (this module only),
// every night goes to the arrival month, the hotel's real bed count from the capacity history. The file's identity
// columns are never read (the service reads five columns by header). Desktop focus; on the phone tables become lists.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRingIcon, ChevronLeftIcon, ChevronRightIcon, GlobeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { diffDays, today as todayOf, type LocalDate } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import type { TourismImportView } from '@shared/contract/tourism'
import { useMonthName } from '../reports/labels'
import { CompareCard } from './compare-card'
import { latestOf, monthOptions, reportableMonths, reportWindow, toBase64 } from './derive'
import { FileCard } from './file-card'
import { HistoryCard } from './history-card'
import { ResultCard } from './result-card'
import { InHouseCard, ReviewCard } from './review-card'
import { errorText, useComparison, useImportKbs, useImports, useTourismTable } from './use-tourism'

function Reminder({ month, today }: { month: string; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const monthName = useMonthName()
  const win = reportWindow(month)
  const left = diffDays(today, win.to)
  const before = diffDays(today, win.from)
  return (
    <Alert
      className={cn(left >= 0 && before <= 0 ? 'border-warning/60' : undefined)}
      data-testid="tourism-reminder"
    >
      <BellRingIcon aria-hidden />
      <AlertTitle>
        {t('tourism.reminder.title', {
          month: monthName(month, false),
          from: f.dayMonth(win.from),
          to: f.dayMonth(win.to)
        })}
      </AlertTitle>
      <AlertDescription>
        {before > 0
          ? t('tourism.reminder.notYet', { count: before })
          : left === 0
            ? t('tourism.reminder.lastDay')
            : left > 0
              ? t('tourism.reminder.left', { count: left })
              : t('tourism.reminder.past')}
      </AlertDescription>
    </Alert>
  )
}

function TourismView({ imports, today }: { imports: TourismImportView[]; today: LocalDate }) {
  const { t } = useTranslation()
  const can = useCan()
  const editable = can('tourism_stats', 'edit')
  const monthName = useMonthName()
  const months = useMemo(() => monthOptions(today, imports), [today, imports])
  const [month, setMonth] = useState(() => reportableMonths(today)[0]!)
  const current = latestOf(imports, month)
  const table = useTourismTable(current?.id)
  const compare = useComparison(current?.id)
  const importKbs = useImportKbs()
  const i = months.indexOf(month)
  const data = current ? table.data : undefined

  const onFile = (file: File): void => {
    void file.arrayBuffer().then((buffer) =>
      importKbs.mutate(
        { fileName: file.name, dataBase64: toBase64(new Uint8Array(buffer)) },
        {
          onSuccess: (result) => {
            setMonth(result.period)
            toast.success(t('tourism.file.loaded', { month: monthName(result.period, false) }))
          },
          onError: (error) => toast.error(t('tourism.file.failed'), { description: errorText(t, error) })
        }
      )
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-1" data-testid="tourism-month">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('monthEnd.previousMonth')}
          disabled={i >= months.length - 1}
          onClick={() => setMonth(months[i + 1]!)}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-52 font-semibold" aria-label={t('monthEnd.month')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthName(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('monthEnd.nextMonth')}
          disabled={i <= 0}
          onClick={() => setMonth(months[i - 1]!)}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
      </div>
      <Reminder month={month} today={today} />
      {current && table.isError ? (
        <QueryView query={table}>{() => null}</QueryView>
      ) : current && table.isPending ? (
        <TourismSkeleton />
      ) : (
        <>
          {/* Both step cards the same height: no empty strip under the shorter one. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <FileCard
              current={current}
              table={data}
              monthLabel={monthName(month, false)}
              editable={editable}
              busy={importKbs.isPending}
              onFile={onFile}
            />
            <ReviewCard table={data} editable={editable} />
          </div>
          {data && data.inHouse.length ? <InHouseCard table={data} editable={editable} /> : null}
          <ResultCard table={data} editable={editable} />
          <div className="grid grid-cols-1 gap-4">
            <CompareCard query={current ? compare : null} />
            <HistoryCard imports={imports} monthName={(p) => monthName(p)} onOpen={setMonth} />
          </div>
        </>
      )}
    </div>
  )
}

function TourismSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-72" aria-hidden />
    </div>
  )
}

export function TourismPage({ today }: { today?: LocalDate } = {}) {
  const { t } = useTranslation()
  const can = useCan()
  const allowed = can('tourism_stats')
  const imports = useImports(allowed)
  const day = today ?? todayOf()
  return (
    <Page title={t('nav.tourism')} description={t('tourism.description')}>
      {!allowed ? (
        <EmptyState icon={GlobeIcon} title={t('common.noAccessTitle')} body={t('common.noAccessBody')} />
      ) : (
        <QueryView
          query={imports}
          loading={
            <div className="grid gap-4">
              <Skeleton className="h-9 w-64" aria-hidden />
              <Skeleton className="h-16" aria-hidden />
              <TourismSkeleton />
            </div>
          }
        >
          {(list) => <TourismView imports={list} today={day} />}
        </QueryView>
      )}
    </Page>
  )
}
