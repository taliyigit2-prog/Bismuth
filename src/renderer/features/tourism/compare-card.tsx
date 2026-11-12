// The KBS table against Bismuth's own stays of the month (faz-10 madde 10 "Karşılaştırma"): countries whose
// arrivals or nights differ, people whose nationality is not written ("uyruk eksik"), and room + check-in days
// found on one side only (a stay not reported to KBS is a legal risk, G-53).
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2Icon, GitCompareIcon } from 'lucide-react'
import { localDate } from '@shared/date'
import type { TourismComparisonView } from '@shared/contract/tourism'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionCard } from '@/components/section-card'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import type { QueryLike } from '@/components/query-view'

/** Long lists are cut: the first rows, then "and N more". */
const SHOWN = 8

function Group({
  title,
  hint,
  testId,
  children,
  more
}: {
  title: string
  hint: string
  testId: string
  children: ReactNode
  more: number
}) {
  const { t } = useTranslation()
  return (
    <section className="grid gap-1.5" data-testid={testId}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground text-xs">{hint}</p>
      <ul className="grid gap-1 text-sm">{children}</ul>
      {more > 0 ? (
        <p className="text-muted-foreground text-xs">{t('tourism.compare.more', { count: more })}</p>
      ) : null}
    </section>
  )
}

function Body({ cmp }: { cmp: TourismComparisonView }) {
  const { t } = useTranslation()
  const f = useFormat()
  const mobile = useIsMobile()
  const day = (d: string): string => f.date(localDate(d), 'medium')
  const pair = (a: number, n: number): string =>
    t('tourism.compare.pair', { arrivals: f.number(a), nights: f.number(n) })
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-xs">{t('tourism.compare.intro')}</p>
      <p className="text-sm">
        {t('tourism.compare.programTotals', {
          arrivals: f.number(cmp.programTotals.arrivals),
          nights: f.number(cmp.programTotals.nights)
        })}
      </p>
      {cmp.headCountStays > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="compare-head-count">
          {t('tourism.compare.headCount', { count: cmp.headCountStays })}
        </p>
      ) : null}
      {cmp.differences.length === 0 ? (
        <p className="text-success flex items-center gap-2 text-sm font-medium" data-testid="compare-same">
          <CheckCircle2Icon className="size-4" aria-hidden />
          {t('tourism.compare.same')}
        </p>
      ) : mobile ? (
        <ul className="grid gap-2" data-testid="compare-differences">
          {cmp.differences.map((d) => (
            <li
              key={`${d.iso2 ?? ''}|${d.country}`}
              className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="font-medium">{d.country}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {t('tourism.compare.line', {
                  kbs: pair(d.kbsArrivals, d.kbsNights),
                  program: pair(d.programArrivals, d.programNights)
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Table className="text-sm" data-testid="compare-differences">
          <TableHeader>
            <TableRow>
              <TableHead>{t('tourism.result.country')}</TableHead>
              <TableHead className="text-end">
                {t('tourism.compare.kbs')}
                <span className="text-muted-foreground block text-xs font-normal">
                  {t('tourism.compare.pairHint')}
                </span>
              </TableHead>
              <TableHead className="text-end">
                {t('tourism.compare.program')}
                <span className="text-muted-foreground block text-xs font-normal">
                  {t('tourism.compare.pairHint')}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cmp.differences.map((d) => (
              <TableRow key={`${d.iso2 ?? ''}|${d.country}`}>
                <TableCell className="whitespace-normal">{d.country}</TableCell>
                <TableCell className="text-end tabular-nums">{pair(d.kbsArrivals, d.kbsNights)}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {pair(d.programArrivals, d.programNights)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {cmp.missingNationality.length ? (
        <Group
          title={t('tourism.compare.missingTitle', { count: cmp.missingNationality.length })}
          hint={t('tourism.compare.missingHint')}
          testId="compare-missing"
          more={cmp.missingNationality.length - SHOWN}
        >
          {cmp.missingNationality.slice(0, SHOWN).map((m, i) => (
            <li key={`${m.reservationCode}-${i}`} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{m.name}</span>
              <span className="text-muted-foreground">
                {t('tourism.inHouse.room', { room: m.room })} · {day(m.arrival)} · {m.reservationCode}
              </span>
            </li>
          ))}
        </Group>
      ) : null}
      {cmp.onlyInProgram.length ? (
        <Group
          title={t('tourism.compare.onlyInProgramTitle', { count: cmp.onlyInProgram.length })}
          hint={t('tourism.compare.onlyInProgramHint')}
          testId="compare-only-program"
          more={cmp.onlyInProgram.length - SHOWN}
        >
          {cmp.onlyInProgram.slice(0, SHOWN).map((s) => (
            <li key={`${s.room}|${s.arrival}`} className="text-muted-foreground">
              {t('tourism.inHouse.room', { room: s.room })} · {day(s.arrival)} · {s.reservationCode}
            </li>
          ))}
        </Group>
      ) : null}
      {cmp.onlyInKbs.length ? (
        <Group
          title={t('tourism.compare.onlyInKbsTitle', { count: cmp.onlyInKbs.length })}
          hint={t('tourism.compare.onlyInKbsHint')}
          testId="compare-only-kbs"
          more={cmp.onlyInKbs.length - SHOWN}
        >
          {cmp.onlyInKbs.slice(0, SHOWN).map((s) => (
            <li key={`${s.room}|${s.arrival}`} className="text-muted-foreground">
              {t('tourism.inHouse.room', { room: s.room })} · {day(s.arrival)} ·{' '}
              {t('tourism.compare.people', { count: s.people })}
            </li>
          ))}
        </Group>
      ) : null}
    </div>
  )
}

export function CompareCard({ query }: { query: QueryLike<TourismComparisonView> | null }) {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('tourism.compare.title')} icon={GitCompareIcon} testId="tourism-compare">
      {!query ? (
        <p className="text-muted-foreground text-sm">{t('tourism.step.needFile')}</p>
      ) : query.isPending ? (
        <div role="status" aria-busy className="grid gap-2">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-4 w-2/3" aria-hidden />
          <Skeleton className="h-20" aria-hidden />
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Body cmp={query.data} />
      )}
    </SectionCard>
  )
}
