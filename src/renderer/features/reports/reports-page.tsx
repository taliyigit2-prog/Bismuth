// Raporlar (faz-10 madde 1–9; G-100…G-105): one frame — a period (this month, last month, this year, a custom
// range) and what to compare with — over the report groups the role may see (G-105): Özet ("Eylül Özet"), Yıllık
// özet, Doluluk ve KPI, Kasa ve ödemeler, Giderler, Personel. Every table goes to CSV/Excel; the whole report to one
// workbook or to paper / PDF. Figures come from the report service; the screen only lays them out.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import { ChartColumnIcon, PrinterIcon } from 'lucide-react'
import type { ReportKind, StayKind } from '@shared/contract/procedures/reports'
import type { LocalDate } from '@shared/date'
import {
  COMPARE_MODES,
  PERIOD_PRESETS,
  type CompareMode,
  type PeriodPreset
} from '@shared/domain/reports-period'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateInput } from '@/components/date-input'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import type { PermissionKey } from '@shared/permissions'
import { CashTab } from './cash-tab'
import { LedgerLink, NoAccess, ReportSkeleton } from './common'
import { ExpensesTab } from './expenses-tab'
import { NightTab } from './night-tab'
import { OccupancyTab } from './occupancy-tab'
import { compareOf, initialChoice, lastDay, periodOf, yearsBetween, type PeriodChoice } from './period'
import { PrintLayout } from './print-layout'
import { ReportActions, ReportScope } from './report-export'
import { usePrint, type ReportRef } from './use-report-export'
import { StaffTab } from './staff-tab'
import { SummaryTab } from './summary-tab'
import { YearlyTab } from './yearly-tab'

const REPORT_TABS = ['summary', 'yearly', 'occupancy', 'cash', 'expenses', 'staff', 'night'] as const
type ReportTab = (typeof REPORT_TABS)[number]

const TAB_PERMISSION: Record<ReportTab, PermissionKey> = {
  summary: 'reports.finance',
  yearly: 'reports.finance',
  occupancy: 'reports.operations',
  cash: 'reports.finance',
  expenses: 'reports.finance',
  staff: 'reports.staff',
  night: 'reports.operations'
}

const TAB_REPORT: Record<ReportTab, ReportKind> = {
  summary: 'monthly',
  yearly: 'yearly',
  occupancy: 'occupancy',
  cash: 'cash',
  expenses: 'expenses',
  staff: 'staff',
  // The night report has its own day and print button; the workbook export is not offered there.
  night: 'occupancy'
}

const isTab = (v: unknown): v is ReportTab =>
  typeof v === 'string' && (REPORT_TABS as readonly string[]).includes(v)

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 max-sm:w-full">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function PeriodControls({
  choice,
  onChoice,
  showCompare
}: {
  choice: PeriodChoice
  onChoice: (c: PeriodChoice) => void
  /** The cash report has nothing to compare. */
  showCompare: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field id="report-preset" label={t('reports.period.label')}>
        <Select
          value={choice.preset}
          onValueChange={(v) => onChoice({ ...choice, preset: v as PeriodPreset })}
        >
          <SelectTrigger id="report-preset" className="w-48 max-sm:w-full" data-testid="period-preset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`reports.period.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {choice.preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-3 max-sm:w-full sm:flex">
          <div className="sm:w-44">
            <DateInput
              label={t('reports.period.from')}
              value={choice.from}
              onChange={(from) => onChoice({ ...choice, from })}
            />
          </div>
          <div className="sm:w-44">
            <DateInput
              label={t('reports.period.until')}
              value={choice.until}
              onChange={(until) => onChoice({ ...choice, until })}
            />
          </div>
        </div>
      ) : null}
      {showCompare ? (
        <Field id="report-compare" label={t('reports.compare.label')}>
          <Select
            value={choice.compare}
            onValueChange={(v) => onChoice({ ...choice, compare: v as CompareMode })}
          >
            <SelectTrigger id="report-compare" className="w-56 max-sm:w-full" data-testid="period-compare">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPARE_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`reports.compare.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </>
  )
}

function YearControls({
  years,
  year,
  onYear,
  other,
  onOther
}: {
  years: number[]
  year: number
  onYear: (y: number) => void
  other?: number | null
  onOther?: (y: number | null) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field id="report-year" label={t('reports.period.whichYear')}>
        <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
          <SelectTrigger id="report-year" className="w-32 max-sm:w-full" data-testid="report-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {onOther ? (
        <Field id="report-other-year" label={t('reports.yearly.compareWith')}>
          <Select
            value={other ? String(other) : 'none'}
            onValueChange={(v) => onOther(v === 'none' ? null : Number(v))}
          >
            <SelectTrigger
              id="report-other-year"
              className="w-52 max-sm:w-full"
              data-testid="report-other-year"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('reports.compare.none')}</SelectItem>
              {[...new Set([...years, year - 1])]
                .filter((y) => y !== year)
                .sort((a, b) => b - a)
                .map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </>
  )
}

function NightPrintButton({ onPrint }: { onPrint: () => void }) {
  const { t } = useTranslation()
  return (
    <Button variant="outline" onClick={onPrint} data-testid="print-report">
      <PrinterIcon aria-hidden />
      {t('reports.print.button')}
    </Button>
  )
}

function ReportsScreen({ today, firstDay }: { today: LocalDate; firstDay: LocalDate | null }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const mobile = useIsMobile()
  const search: { tab?: string } = useSearch({ strict: false })
  const tabs = REPORT_TABS.filter((k) => can(TAB_PERMISSION[k]))
  const [tab, setTab] = useState<ReportTab>(
    isTab(search.tab) && tabs.includes(search.tab) ? search.tab : (tabs[0] ?? 'occupancy')
  )
  const [choice, setChoice] = useState<PeriodChoice>(() => initialChoice(today))
  const years = yearsBetween(firstDay, today)
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [other, setOther] = useState<number | null>(null)
  const [stayKind, setStayKind] = useState<StayKind>('all')
  const [nightDate, setNightDate] = useState<LocalDate>(today)
  const print = usePrint()

  const period = periodOf(choice, today)
  const compare = tab === 'cash' ? null : compareOf(choice, today)
  const yearTab = tab === 'yearly' || tab === 'staff'
  const range =
    tab === 'night'
      ? f.date(nightDate, 'long')
      : yearTab
        ? tab === 'yearly' && other
          ? `${year} · ${other}`
          : String(year)
        : t('reports.period.shown', {
            from: f.date(period.from, 'long'),
            until: f.date(lastDay(period), 'long')
          })
  const ref: ReportRef =
    tab === 'yearly'
      ? { report: 'yearly', years: other ? [year, other] : [year] }
      : tab === 'staff'
        ? { report: 'staff', year }
        : {
            report: TAB_REPORT[tab],
            from: period.from,
            to: period.to,
            ...(tab === 'occupancy' && stayKind !== 'all' ? { stayKind } : {})
          }

  const content = (which: ReportTab): ReactNode => {
    switch (which) {
      case 'summary':
        return <SummaryTab period={period} compare={compare} today={today} />
      case 'yearly':
        return <YearlyTab year={year} other={other} today={today} />
      case 'occupancy':
        return <OccupancyTab period={period} compare={compare} stayKind={stayKind} onStayKind={setStayKind} />
      case 'cash':
        return <CashTab period={period} />
      case 'expenses':
        return <ExpensesTab period={period} compare={compare} />
      case 'staff':
        return <StaffTab year={year} />
      case 'night':
        return <NightTab date={nightDate} />
    }
  }

  return (
    <ReportScope value={ref}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)} className="gap-4">
        <div className="flex flex-wrap items-end gap-3" data-testid="period-toolbar">
          {mobile ? (
            <Field id="report-tab" label={t('reports.tab.label')}>
              <Select value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
                <SelectTrigger id="report-tab" className="w-full" data-testid="report-tab-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tabs.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`reports.tab.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <TabsList aria-label={t('reports.tab.label')} className="h-auto flex-wrap">
              {tabs.map((k) => (
                <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
                  {t(`reports.tab.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {tab === 'night' ? (
            <div className="grid gap-1.5 max-sm:w-full" data-testid="night-date">
              <DateInput value={nightDate} onChange={setNightDate} label={t('reports.night.date')} />
            </div>
          ) : yearTab ? (
            <YearControls
              years={years}
              year={year}
              onYear={setYear}
              {...(tab === 'yearly' ? { other, onOther: setOther } : {})}
            />
          ) : (
            <PeriodControls choice={choice} onChoice={setChoice} showCompare={tab !== 'cash'} />
          )}
          <div className="flex flex-wrap gap-2 max-md:w-full md:ms-auto max-md:[&>[data-slot=button]]:flex-1">
            {tab === 'night' ? (
              <NightPrintButton onPrint={print.start} />
            ) : (
              <ReportActions onPrint={print.start} />
            )}
          </div>
        </div>
        {!yearTab && tab !== 'night' ? (
          <p className="text-muted-foreground -mt-2 text-xs" data-testid="period-range">
            {range}
            {compare
              ? ` · ${t('reports.period.versus', {
                  from: f.date(compare.from, 'long'),
                  until: f.date(lastDay(compare), 'long')
                })}`
              : ''}
          </p>
        ) : null}
        {tabs.map((k) => (
          <TabsContent key={k} value={k} className="min-w-0">
            {k === tab ? content(k) : null}
          </TabsContent>
        ))}
      </Tabs>
      {print.printing ? (
        <PrintLayout title={t(`reports.tab.${tab}`)} range={range}>
          {content(tab)}
        </PrintLayout>
      ) : null}
    </ReportScope>
  )
}

export function ReportsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const allowed = (['reports.operations', 'reports.finance', 'reports.staff'] as const).some((k) => can(k))
  const context = useApiQuery('reports.context', {}, { enabled: allowed })
  return (
    <Page title={t('nav.reports')} description={t('reports.description')}>
      {!allowed ? (
        <NoAccess />
      ) : (
        <QueryView
          query={context}
          loading={<ReportSkeleton />}
          isEmpty={(c) => c.firstDay === null}
          empty={{
            icon: ChartColumnIcon,
            title: t('reports.emptyTitle'),
            body: t('reports.emptyBody'),
            action: <LedgerLink />
          }}
        >
          {(c) => <ReportsScreen today={c.today} firstDay={c.firstDay} />}
        </QueryView>
      )}
    </Page>
  )
}
